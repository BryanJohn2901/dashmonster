"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, RefreshCw, Calendar, Radar } from "lucide-react";
import { supabaseClient } from "@/lib/supabase";
import { useCompany } from "@/hooks/useCompany";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrackingEvent {
  id: string;
  event_name: string;
  fingerprint_id: string;
  event_url: string | null;
  user_data: { em?: string; ph?: string } | null;
  capi_status: "pending" | "sent" | "failed";
  capi_error: string | null;
  created_at: string;
}

interface TrackingConfig {
  meta_pixel_id: string | null;
  dominio_autorizado: string | null;
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
  sent: "Enviado",
  pending: "Pendente",
  failed: "Falhou",
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  sent: { bg: "rgba(16,185,129,0.12)", text: "#059669" },
  pending: { bg: "rgba(245,158,11,0.12)", text: "#d97706" },
  failed: { bg: "rgba(239,68,68,0.12)", text: "#dc2626" },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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

// ─── Main component ───────────────────────────────────────────────────────────

export function TrackingEventsView() {
  const { companyId } = useCompany();
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [config, setConfig] = useState<TrackingConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState(() => new Date(Date.now() - 30 * 86400_000).toISOString().split("T")[0]);
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  const fetchEvents = useCallback(async () => {
    if (!supabaseClient) {
      setError("Supabase não configurado.");
      return;
    }
    if (!companyId) return;

    setLoading(true);
    setError(null);

    const [eventsRes, configRes] = await Promise.all([
      supabaseClient
        .from("events_log")
        .select("id, event_name, fingerprint_id, event_url, user_data, capi_status, capi_error, created_at")
        .eq("company_id", companyId)
        .gte("created_at", `${dateFrom}T00:00:00`)
        .lte("created_at", `${dateTo}T23:59:59`)
        .order("created_at", { ascending: false })
        .limit(500),
      supabaseClient
        .from("companies")
        .select("meta_pixel_id, dominio_autorizado")
        .eq("id", companyId)
        .single(),
    ]);

    if (eventsRes.error) {
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

  const filtered = events.filter((e) => {
    if (eventFilter && e.event_name !== eventFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return e.event_url?.toLowerCase().includes(q) || e.fingerprint_id.toLowerCase().includes(q) || false;
    }
    return true;
  });

  const eventTypes = [...new Set(events.map((e) => e.event_name))];
  const notConfigured = !loading && !config?.meta_pixel_id;

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
            Pixel Server-Side · {filtered.length} evento{filtered.length !== 1 ? "s" : ""}
            {events.length !== filtered.length && ` (${events.length} total)`}
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
            placeholder="URL ou fingerprint..."
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

      {/* Tracking não configurado */}
      {notConfigured && (
        <div
          className="mb-4 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: "rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.08)", color: "#d97706" }}
        >
          Tracking ainda não configurado para esta empresa. Defina <code>meta_pixel_id</code>,{" "}
          <code>meta_capi_token</code> e <code>dominio_autorizado</code> na tabela <code>companies</code>.
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

      {/* Table */}
      {filtered.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: "var(--dm-border-default)" }}>
          <table className="w-full min-w-[680px] text-xs">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--dm-border-default)", background: "var(--dm-bg-elevated)" }}>
                {["Evento", "Data", "Status CAPI", "Origem", "Dados", "Fingerprint"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left font-semibold" style={{ color: "var(--dm-text-tertiary)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((event, i) => {
                const evColor = EVENT_COLORS[event.event_name] ?? { bg: "rgba(100,100,100,0.10)", text: "var(--dm-text-tertiary)" };
                const statusColor = STATUS_COLORS[event.capi_status];
                return (
                  <tr
                    key={event.id}
                    title={event.capi_error ?? undefined}
                    style={{
                      borderBottom: i < filtered.length - 1 ? "1px solid var(--dm-border-subtle)" : undefined,
                      background: i % 2 === 0 ? "var(--dm-bg-surface)" : "var(--dm-bg-card)",
                    }}
                  >
                    <td className="px-4 py-2.5">
                      <span
                        className="rounded-full px-2 py-0.5 text-[9px] font-semibold whitespace-nowrap"
                        style={{ background: evColor.bg, color: evColor.text }}
                      >
                        {EVENT_LABELS[event.event_name] ?? event.event_name}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums whitespace-nowrap" style={{ color: "var(--dm-text-secondary)" }}>
                      {fmt(event.created_at)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className="rounded-full px-2 py-0.5 text-[9px] font-semibold whitespace-nowrap"
                        style={{ background: statusColor.bg, color: statusColor.text }}
                      >
                        {STATUS_LABELS[event.capi_status]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 max-w-[260px] truncate" style={{ color: "var(--dm-text-secondary)" }}>
                      {event.event_url ?? "—"}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: "var(--dm-text-secondary)" }}>
                      {event.user_data?.em && (
                        <span className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] dark:bg-slate-700">e-mail</span>
                      )}
                      {event.user_data?.ph && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] dark:bg-slate-700">tel</span>
                      )}
                      {!event.user_data?.em && !event.user_data?.ph && "—"}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                      {event.fingerprint_id.slice(0, 10)}…
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
