"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Search, RefreshCw, Calendar, Radar, X, Mail, Phone, MapPin } from "lucide-react";
import { supabaseClient } from "@/lib/supabase";
import { useCompany } from "@/hooks/useCompany";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrackingEvent {
  id: string;
  event_name: string;
  fingerprint_id: string;
  event_url: string | null;
  page_title: string | null;
  user_data: { em?: string; ph?: string } | null;
  lead_email: string | null;
  lead_phone: string | null;
  extra_fields: Record<string, string> | null;
  capi_status: "pending" | "sent" | "failed" | "skipped";
  capi_error: string | null;
  created_at: string;
}

interface TrackingConfig {
  meta_pixel_id: string | null;
  dominio_autorizado: string | null;
}

interface Visitor {
  fingerprintId: string;
  events: TrackingEvent[]; // mais recente primeiro
  firstSeen: string;
  lastSeen: string;
  isLead: boolean;
  leadEmail: string | null;
  leadPhone: string | null;
  leadFields: Record<string, string>;
  lastUrl: string | null;
  lastPageTitle: string | null;
  lastUtm: Record<string, string>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, string> = {
  Lead: "Lead",
  Contact: "WhatsApp",
  Purchase: "Compra",
  PageView: "Visualização",
  AddToCart: "Carrinho",
};

const EVENT_COLORS: Record<string, { bg: string; text: string }> = {
  Lead: { bg: "rgba(49,52,145,0.12)", text: "var(--dm-primary)" },
  Contact: { bg: "rgba(16,185,129,0.12)", text: "#059669" },
  Purchase: { bg: "rgba(245,158,11,0.12)", text: "#d97706" },
  PageView: { bg: "rgba(100,116,139,0.12)", text: "#475569" },
  AddToCart: { bg: "rgba(139,92,246,0.12)", text: "#7c3aed" },
};

const STATUS_LABELS: Record<string, string> = {
  sent: "Enviado à Meta",
  pending: "Enviando…",
  failed: "Falhou na Meta",
  skipped: "Capturado (sem Meta)",
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  sent: { bg: "rgba(16,185,129,0.12)", text: "#059669" },
  pending: { bg: "rgba(245,158,11,0.12)", text: "#d97706" },
  failed: { bg: "rgba(239,68,68,0.12)", text: "#dc2626" },
  skipped: { bg: "rgba(100,116,139,0.12)", text: "var(--dm-text-tertiary)" },
};

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

const EVENTS_SELECT = "id, event_name, fingerprint_id, event_url, page_title, user_data, lead_email, lead_phone, extra_fields, capi_status, capi_error, created_at";
// Sem page_title/extra_fields (migration 033) — usado se a migration ainda não rodou no banco,
// pra não derrubar a tela inteira enquanto ela não é aplicada manualmente no Supabase.
const EVENTS_SELECT_FALLBACK = "id, event_name, fingerprint_id, event_url, user_data, lead_email, lead_phone, capi_status, capi_error, created_at";

function fmt(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "agora mesmo";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days}d`;
  return fmt(iso);
}

// Anúncios (ex.: Meta) costumam montar a UTM a partir de um placeholder
// ({{ad.name}} etc.) que já vem URL-encoded — somado ao encoding normal da
// query string, o valor chega com 2 camadas (%2520, %252F, "+" literal...).
// Decodifica em loop até estabilizar (defensivo: nunca lança, só desiste).
function decodeUtmValue(raw: string): string {
  let value = raw;
  for (let i = 0; i < 4; i++) {
    if (!/%[0-9A-Fa-f]{2}/.test(value) && !value.includes("+")) break;
    try {
      const decoded = decodeURIComponent(value.replace(/\+/g, " "));
      if (decoded === value) break;
      value = decoded;
    } catch {
      break;
    }
  }
  return value;
}

function parseUtm(url: string | null): Record<string, string> {
  if (!url) return {};
  try {
    const u = new URL(url);
    const out: Record<string, string> = {};
    for (const key of UTM_KEYS) {
      const v = u.searchParams.get(key);
      if (v) out[key] = decodeUtmValue(v);
    }
    return out;
  } catch {
    return {};
  }
}

// Caminho da página sem os parâmetros utm_* (esses já aparecem como chips à parte).
function urlPath(url: string | null): string {
  if (!url) return "—";
  try {
    const u = new URL(url);
    for (const key of UTM_KEYS) u.searchParams.delete(key);
    const query = u.searchParams.toString();
    return u.pathname + (query ? `?${query}` : "");
  } catch {
    return url;
  }
}

function groupByVisitor(events: TrackingEvent[]): Visitor[] {
  const map = new Map<string, TrackingEvent[]>();
  for (const e of events) {
    const list = map.get(e.fingerprint_id);
    if (list) list.push(e);
    else map.set(e.fingerprint_id, [e]);
  }

  const visitors: Visitor[] = [];
  for (const [fingerprintId, list] of map) {
    const sorted = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const leadEvent = sorted.find((e) => e.lead_email || e.lead_phone);
    visitors.push({
      fingerprintId,
      events: sorted,
      lastSeen: sorted[0].created_at,
      firstSeen: sorted[sorted.length - 1].created_at,
      isLead: Boolean(leadEvent),
      leadEmail: leadEvent?.lead_email ?? null,
      leadPhone: leadEvent?.lead_phone ?? null,
      leadFields: leadEvent?.extra_fields ?? {},
      lastUrl: sorted[0].event_url,
      lastPageTitle: sorted[0].page_title,
      lastUtm: parseUtm(sorted[0].event_url),
    });
  }

  return visitors.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}

// ─── Filter chip ──────────────────────────────────────────────────────────────

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-opacity hover:opacity-80"
      style={{
        borderColor: active ? "var(--dm-primary)" : "var(--dm-border-default)",
        background: active ? "rgba(49,52,145,0.12)" : "transparent",
        color: active ? "var(--dm-primary)" : "var(--dm-text-tertiary)",
      }}
    >
      {label}
    </button>
  );
}

// ─── Detail drawer ────────────────────────────────────────────────────────────

function VisitorDrawer({ visitor, onClose }: { visitor: Visitor; onClose: () => void }) {
  if (typeof document === "undefined") return null;

  const timeline = [...visitor.events].reverse(); // ordem cronológica: o que ele fez primeiro até o último

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-hidden border-l shadow-2xl sm:max-w-[460px]"
        style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b px-6 py-4" style={{ borderColor: "var(--dm-border-default)" }}>
          <div>
            <h3 className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>Histórico do visitante</h3>
            <p className="font-mono text-[10px] mt-0.5" style={{ color: "var(--dm-text-tertiary)" }}>{visitor.fingerprintId}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="flex h-7 w-7 items-center justify-center rounded-full transition-opacity hover:opacity-70" style={{ color: "var(--dm-text-tertiary)" }}>
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {visitor.isLead && (
            <div className="mb-5 rounded-xl border p-3" style={{ borderColor: "var(--dm-primary)", background: "rgba(49,52,145,0.06)" }}>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-primary)" }}>Dados capturados</p>
              {visitor.leadEmail && (
                <p className="mb-1 flex items-center gap-1.5 text-xs" style={{ color: "var(--dm-text-primary)" }}>
                  <Mail size={12} style={{ color: "var(--dm-text-tertiary)" }} /> {visitor.leadEmail}
                </p>
              )}
              {visitor.leadPhone && (
                <p className="mb-1 flex items-center gap-1.5 text-xs" style={{ color: "var(--dm-text-primary)" }}>
                  <Phone size={12} style={{ color: "var(--dm-text-tertiary)" }} /> {visitor.leadPhone}
                </p>
              )}
              {Object.entries(visitor.leadFields).map(([key, value]) => (
                <p key={key} className="mt-1 text-xs" style={{ color: "var(--dm-text-primary)" }}>
                  <span style={{ color: "var(--dm-text-tertiary)" }}>{key}:</span> {value}
                </p>
              ))}
            </div>
          )}

          <p className="mb-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
            Jornada · {timeline.length} evento{timeline.length !== 1 ? "s" : ""}
          </p>

          <div className="relative flex flex-col gap-4 border-l pl-4" style={{ borderColor: "var(--dm-border-default)" }}>
            {timeline.map((event) => {
              const evColor = EVENT_COLORS[event.event_name] ?? { bg: "rgba(100,100,100,0.10)", text: "var(--dm-text-tertiary)" };
              const utm = parseUtm(event.event_url);
              const utmEntries = Object.entries(utm);
              return (
                <div key={event.id} className="relative">
                  <span
                    className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2"
                    style={{ background: "var(--dm-bg-surface)", borderColor: evColor.text }}
                  />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold whitespace-nowrap" style={{ background: evColor.bg, color: evColor.text }}>
                      {EVENT_LABELS[event.event_name] ?? event.event_name}
                    </span>
                    <span className="text-[10px] tabular-nums" style={{ color: "var(--dm-text-tertiary)" }}>{fmt(event.created_at)}</span>
                  </div>
                  {event.page_title && (
                    <p className="mt-1 text-[11px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>
                      {event.page_title}
                    </p>
                  )}
                  <p className="mt-0.5 break-all text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                    <MapPin size={10} className="mr-1 inline" />
                    {urlPath(event.event_url)}
                  </p>
                  {utmEntries.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {utmEntries.map(([k, v]) => (
                        <span key={k} className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] dark:bg-slate-700" style={{ color: "var(--dm-text-tertiary)" }}>
                          {k.replace("utm_", "")}: <strong style={{ color: "var(--dm-text-secondary)" }}>{v}</strong>
                        </span>
                      ))}
                    </div>
                  )}
                  {event.event_name === "Lead" && (
                    <span
                      className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold"
                      style={{ background: STATUS_COLORS[event.capi_status].bg, color: STATUS_COLORS[event.capi_status].text }}
                      title={event.capi_error ?? undefined}
                    >
                      {STATUS_LABELS[event.capi_status]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TrackingEventsView({ onConfigure }: { onConfigure?: () => void } = {}) {
  const { companyId } = useCompany();
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [config, setConfig] = useState<TrackingConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState<string | null>(null);
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);

  const [dateFrom, setDateFrom] = useState(() => new Date(Date.now() - 30 * 86400_000).toISOString().split("T")[0]);
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  const fetchEvents = useCallback(async () => {
    if (!supabaseClient) {
      setError("Supabase não configurado.");
      return;
    }
    if (!companyId) {
      setError("Nenhuma empresa selecionada.");
      return;
    }

    setLoading(true);
    setError(null);

    const [eventsRes, configRes] = await Promise.all([
      supabaseClient
        .from("events_log")
        .select(EVENTS_SELECT)
        .eq("company_id", companyId)
        .gte("created_at", `${dateFrom}T00:00:00`)
        .lte("created_at", `${dateTo}T23:59:59`)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabaseClient
        .from("companies")
        .select("meta_pixel_id, dominio_autorizado")
        .eq("id", companyId)
        .single(),
    ]);

    if (eventsRes.error?.message?.includes("page_title") || eventsRes.error?.message?.includes("extra_fields")) {
      // Migration 033 ainda não rodou no Supabase — busca sem as colunas novas em vez de quebrar a tela.
      const retry = await supabaseClient
        .from("events_log")
        .select(EVENTS_SELECT_FALLBACK)
        .eq("company_id", companyId)
        .gte("created_at", `${dateFrom}T00:00:00`)
        .lte("created_at", `${dateTo}T23:59:59`)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (retry.error) {
        setError(retry.error.message);
      } else {
        setEvents((retry.data as TrackingEvent[]) ?? []);
      }
    } else if (eventsRes.error) {
      setError(eventsRes.error.message);
    } else {
      setEvents((eventsRes.data as TrackingEvent[]) ?? []);
    }
    if (!configRes.error) {
      setConfig(configRes.data as TrackingConfig);
    }

    setLoading(false);
  }, [companyId, dateFrom, dateTo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEvents();
  }, [fetchEvents]);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const visitors = useMemo(() => groupByVisitor(events), [events]);

  const filteredVisitors = visitors.filter((v) => {
    if (eventFilter && !v.events.some((e) => e.event_name === eventFilter)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        v.fingerprintId.toLowerCase().includes(q) ||
        v.events.some((e) => e.event_url?.toLowerCase().includes(q) || e.page_title?.toLowerCase().includes(q)) ||
        v.leadEmail?.toLowerCase().includes(q) ||
        v.leadPhone?.toLowerCase().includes(q) ||
        false
      );
    }
    return true;
  });

  const eventTypes = [...new Set(events.map((e) => e.event_name))];
  // Captura funciona sem Meta — isso é só um lembrete de que o envio CAPI está desligado, não um erro.
  const metaNotConfigured = !loading && !error && !config?.meta_pixel_id;

  // Mantém o drawer em sincronia se um refresh trouxer novos eventos do mesmo visitante.
  const openVisitor = selectedVisitor
    ? (visitors.find((v) => v.fingerprintId === selectedVisitor.fingerprintId) ?? selectedVisitor)
    : null;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full p-4 sm:p-6 overflow-y-auto">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold" style={{ color: "var(--dm-text-primary)" }}>
            Eventos de Tracking
          </h2>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--dm-text-tertiary)" }}>
            Pixel Server-Side · {filteredVisitors.length} visitante{filteredVisitors.length !== 1 ? "s" : ""} · {events.length} evento{events.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={fetchEvents}
          disabled={loading}
          className="flex-shrink-0 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-70 disabled:opacity-40"
          style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}
        >
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
          Atualizar
        </button>
      </div>

      {/* Date + Search row */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Calendar size={13} className="flex-shrink-0" style={{ color: "var(--dm-text-tertiary)" }} />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-lg border px-2 py-1 text-xs"
          style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)", color: "var(--dm-text-primary)" }}
        />
        <span className="text-xs" style={{ color: "var(--dm-text-tertiary)" }}>até</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded-lg border px-2 py-1 text-xs"
          style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)", color: "var(--dm-text-primary)" }}
        />
        <div className="relative flex-1 min-w-[180px]">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--dm-text-tertiary)" }} />
          <input
            type="text"
            placeholder="URL, e-mail, telefone ou fingerprint..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border pl-7 pr-3 py-1.5 text-xs"
            style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)", color: "var(--dm-text-primary)" }}
          />
        </div>
      </div>

      {/* Filter chips */}
      {eventTypes.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {eventTypes.map((ev) => (
            <Chip
              key={ev}
              label={EVENT_LABELS[ev] ?? ev}
              active={eventFilter === ev}
              onClick={() => setEventFilter(eventFilter === ev ? null : ev)}
            />
          ))}
        </div>
      )}

      {/* Meta CAPI não configurada (informativo, não bloqueia captura) */}
      {metaNotConfigured && (
        <div
          className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)" }}
        >
          <span>Eventos sendo capturados normalmente. Envio pra Meta Conversions API está desligado (Pixel ID/Token não configurados).</span>
          {onConfigure && (
            <button
              type="button"
              onClick={onConfigure}
              className="flex-shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-opacity hover:opacity-80"
              style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-primary)" }}
            >
              Configurar Meta →
            </button>
          )}
        </div>
      )}

      {/* Errors */}
      {error && (
        <div
          className="mb-4 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "#f87171" }}
        >
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && events.length === 0 && (
        <div className="flex flex-1 items-center justify-center gap-2" style={{ color: "var(--dm-text-tertiary)" }}>
          <RefreshCw size={14} className="animate-spin" />
          <span className="text-sm">Buscando eventos…</span>
        </div>
      )}

      {/* Empty */}
      {!loading && events.length === 0 && !error && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <Radar size={28} style={{ color: "var(--dm-text-tertiary)" }} />
          <p className="text-sm" style={{ color: "var(--dm-text-tertiary)" }}>
            Nenhum evento capturado no período.
          </p>
          <p className="text-[11px] mt-0.5 text-center max-w-sm" style={{ color: "var(--dm-text-tertiary)" }}>
            Instale o pixel (<code>/api/tracking/pixel.js</code>) nas páginas do cliente e chame{" "}
            <code>Tracker.init(&quot;slug-da-empresa&quot;)</code>.
          </p>
        </div>
      )}

      {/* Table — 1 linha por visitante */}
      {filteredVisitors.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: "var(--dm-border-default)" }}>
          <table className="w-full min-w-[680px] text-xs">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--dm-border-default)", background: "var(--dm-bg-elevated)" }}>
                {["Visitante", "Última ação", "Eventos", "Origem / UTM", "Lead"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left font-semibold" style={{ color: "var(--dm-text-tertiary)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredVisitors.map((visitor, i) => {
                const utmEntries = Object.entries(visitor.lastUtm);
                return (
                  <tr
                    key={visitor.fingerprintId}
                    onClick={() => setSelectedVisitor(visitor)}
                    className="cursor-pointer transition-colors hover:opacity-80"
                    style={{
                      borderBottom: i < filteredVisitors.length - 1 ? "1px solid var(--dm-border-subtle)" : undefined,
                      background: i % 2 === 0 ? "var(--dm-bg-surface)" : "var(--dm-bg-card)",
                    }}
                  >
                    <td className="px-4 py-2.5 font-mono text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                      {visitor.fingerprintId.slice(0, 12)}…
                    </td>
                    <td className="px-4 py-2.5 tabular-nums whitespace-nowrap" style={{ color: "var(--dm-text-secondary)" }} title={fmt(visitor.lastSeen)}>
                      {relativeTime(visitor.lastSeen)}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: "var(--dm-text-secondary)" }}>
                      {visitor.events.length}
                    </td>
                    <td className="px-4 py-2.5 max-w-[280px]">
                      {utmEntries.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {utmEntries.slice(0, 2).map(([k, v]) => (
                            <span key={k} className="truncate rounded bg-slate-100 px-1.5 py-0.5 text-[9px] dark:bg-slate-700" style={{ color: "var(--dm-text-tertiary)", maxWidth: 130 }}>
                              {v}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="truncate block" style={{ color: "var(--dm-text-tertiary)" }}>
                          {visitor.lastPageTitle || urlPath(visitor.lastUrl)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {visitor.isLead ? (
                        <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold whitespace-nowrap" style={{ background: EVENT_COLORS.Lead.bg, color: EVENT_COLORS.Lead.text }}>
                          ✓ converteu
                        </span>
                      ) : (
                        <span style={{ color: "var(--dm-text-tertiary)" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {openVisitor && <VisitorDrawer visitor={openVisitor} onClose={() => setSelectedVisitor(null)} />}
    </div>
  );
}
