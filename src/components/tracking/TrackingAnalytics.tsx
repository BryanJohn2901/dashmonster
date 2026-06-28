"use client";

import { useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Users, Activity, UserCheck, ShoppingBag, DollarSign, TrendingUp,
  Globe, Tag, Radar, Monitor, Radio,
} from "lucide-react";
import { useChartTheme, shortDate, xInterval } from "@/components/charts/useChartTheme";
import {
  EVENT_LABELS, EVENT_COLORS, flagEmoji, formatMoney, resolveUtm,
  parseUserAgent, parseOS, parseBrowser,
  type Visitor, type TrackingEvent,
} from "@/components/TrackingEventsView";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const intFmt = new Intl.NumberFormat("pt-BR");
const fmtInt = (n: number) => intFmt.format(Math.round(n));
const fmtPct = (n: number) => `${n.toFixed(n < 10 ? 1 : 0)}%`;

const DIRECT_LABEL = "Direto / Orgânico";
const UNDEFINED_LABEL = "(não definido)";

function visitorUtm(v: Visitor): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of v.events) {
    const u = resolveUtm(e);
    for (const k of Object.keys(u)) if (!out[k] && u[k]) out[k] = u[k];
  }
  return out;
}

function topBuckets(
  counts: Map<string, number>, n: number,
): { label: string; value: number }[] {
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  if (sorted.length <= n) return sorted;
  const head = sorted.slice(0, n);
  const rest = sorted.slice(n).reduce((s, i) => s + i.value, 0);
  if (rest > 0) head.push({ label: `+${sorted.length - n} outros`, value: rest });
  return head;
}

// ─── UI primitives ────────────────────────────────────────────────────────────
function Panel({ title, icon: Icon, action, children, className }: {
  title: string;
  icon?: typeof Users;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex flex-col rounded-2xl border p-4 ${className ?? ""}`}
      style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)" }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {Icon && (
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(99,102,200,0.12)" }}>
              <Icon size={13} style={{ color: "var(--dm-primary)" }} />
            </span>
          )}
          <h3 className="text-[12px] font-bold" style={{ color: "var(--dm-text-primary)" }}>{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ScoreCard({ label, value, icon: Icon, accent }: {
  label: string; value: string; icon: typeof Users; accent: string;
}) {
  return (
    <div className="rounded-2xl border p-3.5" style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)" }}>
      <div className="mb-2 flex items-center gap-1.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg" style={{ background: `${accent}1a` }}>
          <Icon size={13} style={{ color: accent }} />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--dm-text-tertiary)" }}>{label}</span>
      </div>
      <p className="text-[20px] font-bold leading-none tabular-nums" style={{ color: "var(--dm-text-primary)" }}>{value}</p>
    </div>
  );
}

function ToggleGroup<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-0.5 rounded-lg p-0.5" style={{ background: "var(--dm-bg-elevated)" }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className="rounded-md px-2.5 py-1 text-[11px] font-semibold transition"
          style={value === o.value
            ? { background: "var(--dm-bg-surface)", color: "var(--dm-primary)", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }
            : { color: "var(--dm-text-tertiary)" }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function BarList({ items, color, empty, formatValue }: {
  items: { key: string; label: React.ReactNode; value: number; sub?: string }[];
  color: string;
  empty: string;
  formatValue?: (v: number) => string;
}) {
  if (items.length === 0) return <EmptyHint text={empty} />;
  const max = Math.max(...items.map((i) => i.value), 1);
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <div className="flex flex-col gap-2">
      {items.map((it) => (
        <div key={it.key}>
          <div className="mb-0.5 flex items-center justify-between gap-2 text-[11px]">
            <span className="truncate" style={{ color: "var(--dm-text-secondary)" }}>{it.label}</span>
            <span className="flex flex-shrink-0 items-center gap-1 tabular-nums" style={{ color: "var(--dm-text-tertiary)" }}>
              {it.sub && <span className="opacity-60">{it.sub}</span>}
              <span className="font-semibold" style={{ color: "var(--dm-text-primary)" }}>
                {formatValue ? formatValue(it.value) : fmtInt(it.value)}
              </span>
              {!formatValue && total > 0 && <span className="opacity-70">{fmtPct((it.value / total) * 100)}</span>}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--dm-bg-elevated)" }}>
            <div className="h-full rounded-full" style={{ width: `${(it.value / max) * 100}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="py-4 text-center text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>{text}</p>;
}

// ─── Tipos ───────────────────────────────────────────────────────────────────
type TimelineMetric = "events" | "users" | "leads" | "sales";
type GeoDim = "country" | "region" | "city";
type GeoMode = "users" | "sales";
type DeviceDim = "device" | "os" | "browser";
type SourceDim = "utm_source" | "utm_medium";
type UtmDim = "utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term" | "utm_ad_id";
type UtmSortCol = "users" | "leads" | "sales" | "revenue";

// ─── Componente principal ─────────────────────────────────────────────────────
export function TrackingAnalytics({ visitors, events, eventsCapped, funnelHasProductNames = true }: {
  visitors: Visitor[];
  events: TrackingEvent[];
  eventsCapped: boolean;
  funnelHasProductNames?: boolean;
}) {
  const theme = useChartTheme();
  const [timelineMetric, setTimelineMetric] = useState<TimelineMetric>("events");
  const [geoDim, setGeoDim] = useState<GeoDim>("country");
  const [geoMode, setGeoMode] = useState<GeoMode>("users");
  const [sourceDim, setSourceDim] = useState<SourceDim>("utm_source");
  const [deviceDim, setDeviceDim] = useState<DeviceDim>("os");
  const [utmDim, setUtmDim] = useState<UtmDim>("utm_campaign");
  const [utmSort, setUtmSort] = useState<UtmSortCol>("revenue");

  const currency = useMemo(
    () => events.find((e) => e.event_name === "Purchase" && e.currency)?.currency ?? "BRL",
    [events],
  );

  // ── Scorecards ──────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const uniqueUsers = visitors.length;
    const leadFps = new Set(events.filter((e) => e.event_name === "Lead").map((e) => e.fingerprint_id));
    const purchaseEvts = events.filter((e) => e.event_name === "Purchase");
    const customerFps = new Set(purchaseEvts.map((e) => e.fingerprint_id));
    const leads = leadFps.size;
    const customers = customerFps.size;
    const sales = purchaseEvts.length;
    const revenue = purchaseEvts.reduce((s, e) => s + (e.value ?? 0), 0);
    const convRate = uniqueUsers > 0 ? (leads / uniqueUsers) * 100 : 0;
    return { uniqueUsers, totalEvents: events.length, leads, customers, sales, revenue, convRate };
  }, [visitors, events]);

  // ── Timeline ────────────────────────────────────────────────────────────────
  const timeline = useMemo(() => {
    const ev = new Map<string, number>();
    const us = new Map<string, Set<string>>();
    const ld = new Map<string, number>();
    const sl = new Map<string, number>();
    for (const e of events) {
      const d = e.created_at.slice(0, 10);
      ev.set(d, (ev.get(d) ?? 0) + 1);
      if (!us.has(d)) us.set(d, new Set());
      us.get(d)!.add(e.fingerprint_id);
      if (e.event_name === "Lead") ld.set(d, (ld.get(d) ?? 0) + 1);
      if (e.event_name === "Purchase") sl.set(d, (sl.get(d) ?? 0) + 1);
    }
    const days = [...ev.keys()].sort();
    if (days.length === 0) return [];
    const out: { date: string; events: number; users: number; leads: number; sales: number }[] = [];
    const cur = new Date(`${days[0]}T00:00:00Z`);
    const end = new Date(`${days[days.length - 1]}T00:00:00Z`);
    while (cur <= end) {
      const d = cur.toISOString().slice(0, 10);
      out.push({ date: d, events: ev.get(d) ?? 0, users: us.get(d)?.size ?? 0, leads: ld.get(d) ?? 0, sales: sl.get(d) ?? 0 });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return out;
  }, [events]);

  // ── Eventos por tipo ────────────────────────────────────────────────────────
  const eventsByType = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events) m.set(e.event_name, (m.get(e.event_name) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  }, [events]);

  // ── Compras por visitante (scoped ao funil) ─────────────────────────────────
  // Usado tanto na tabela UTM quanto nos painéis de localização/origem de vendas.
  const purchasesByFp = useMemo(() => {
    const m = new Map<string, { sales: number; revenue: number }>();
    for (const e of events) {
      if (e.event_name !== "Purchase") continue;
      const cur = m.get(e.fingerprint_id) ?? { sales: 0, revenue: 0 };
      cur.sales += 1;
      cur.revenue += e.value ?? 0;
      m.set(e.fingerprint_id, cur);
    }
    return m;
  }, [events]);

  // Visitantes com pelo menos 1 compra no funil atual.
  const buyerVisitors = useMemo(
    () => visitors.filter((v) => (purchasesByFp.get(v.fingerprintId)?.sales ?? 0) > 0),
    [visitors, purchasesByFp],
  );

  // ── Geografia ───────────────────────────────────────────────────────────────
  const geo = useMemo(() => {
    if (geoMode === "users") {
      const counts = new Map<string, number>();
      const flags = new Map<string, string | null>();
      for (const v of visitors) {
        const loc = v.lastLocation;
        const raw = geoDim === "country" ? loc.country : geoDim === "region" ? loc.countryRegion : loc.city;
        const key = raw?.trim() || "Desconhecido";
        counts.set(key, (counts.get(key) ?? 0) + 1);
        if (geoDim === "country" && !flags.has(key)) flags.set(key, loc.country);
      }
      return topBuckets(counts, 8).map((b) => ({
        ...b,
        flag: geoDim === "country" ? flagEmoji(flags.get(b.label) ?? null) : "",
        sub: undefined as string | undefined,
        formatValue: undefined as ((v: number) => string) | undefined,
      }));
    }
    // Vendas: agrupa revenue por localização; value = revenue; sub = nº de vendas
    const rev = new Map<string, number>();
    const cnt = new Map<string, number>();
    const flags = new Map<string, string | null>();
    for (const v of buyerVisitors) {
      const loc = v.lastLocation;
      const raw = geoDim === "country" ? loc.country : geoDim === "region" ? loc.countryRegion : loc.city;
      const key = raw?.trim() || "Desconhecido";
      const p = purchasesByFp.get(v.fingerprintId)!;
      rev.set(key, (rev.get(key) ?? 0) + p.revenue);
      cnt.set(key, (cnt.get(key) ?? 0) + p.sales);
      if (geoDim === "country" && !flags.has(key)) flags.set(key, loc.country);
    }
    return topBuckets(rev, 8).map((b) => ({
      ...b,
      flag: geoDim === "country" ? flagEmoji(flags.get(b.label) ?? null) : "",
      sub: `${fmtInt(cnt.get(b.label) ?? 0)} venda${(cnt.get(b.label) ?? 0) !== 1 ? "s" : ""}`,
      formatValue: (v: number) => formatMoney(v, currency),
    }));
  }, [visitors, buyerVisitors, purchasesByFp, geoDim, geoMode, currency]);

  // ── Vendas por UTM Source (first-touch) ─────────────────────────────────────
  // v.events é mais-recente-primeiro; iteramos ao contrário para pegar o UTM
  // do evento mais antigo do visitante dentro do período (first-touch).
  const salesBySource = useMemo(() => {
    const rev = new Map<string, number>();
    const cnt = new Map<string, number>();
    for (const v of buyerVisitors) {
      let firstSrc: string | null = null;
      for (let i = v.events.length - 1; i >= 0; i--) {
        const src = resolveUtm(v.events[i])["utm_source"]?.trim();
        if (src) { firstSrc = src; break; }
      }
      const key = firstSrc ?? DIRECT_LABEL;
      const p = purchasesByFp.get(v.fingerprintId)!;
      rev.set(key, (rev.get(key) ?? 0) + p.revenue);
      cnt.set(key, (cnt.get(key) ?? 0) + p.sales);
    }
    return topBuckets(rev, 8).map((b) => ({
      ...b,
      sub: `${fmtInt(cnt.get(b.label) ?? 0)} venda${(cnt.get(b.label) ?? 0) !== 1 ? "s" : ""}`,
    }));
  }, [buyerVisitors, purchasesByFp]);

  // ── Usuários por origem (todos os visitantes) ────────────────────────────────
  const usersBySource = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of visitors) {
      const key = visitorUtm(v)[sourceDim]?.trim() || DIRECT_LABEL;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return topBuckets(counts, 8);
  }, [visitors, sourceDim]);

  // ── UTM final da venda (UTM diretamente no evento de compra) ─────────────────
  // Diferente de salesBySource (que usa o histórico do visitante), aqui olhamos
  // somente o utm_source que veio junto com o evento Purchase em si.
  // Para vendas Eduzz server-side sem UTM, cai em "Sem UTM na venda".
  const utmFinalDeSale = useMemo(() => {
    const rev = new Map<string, number>();
    const cnt = new Map<string, number>();
    for (const e of events) {
      if (e.event_name !== "Purchase") continue;
      const utm = resolveUtm(e);
      const src = utm["utm_source"]?.trim() || null;
      const key = src ?? "Sem UTM na venda";
      rev.set(key, (rev.get(key) ?? 0) + (e.value ?? 0));
      cnt.set(key, (cnt.get(key) ?? 0) + 1);
    }
    return topBuckets(rev, 8).map((b) => ({
      ...b,
      sub: `${fmtInt(cnt.get(b.label) ?? 0)} venda${(cnt.get(b.label) ?? 0) !== 1 ? "s" : ""}`,
    }));
  }, [events]);

  // ── Dispositivos ─────────────────────────────────────────────────────────────
  const deviceStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of visitors) {
      let key: string | null = null;
      if (deviceDim === "device") {
        const d = parseUserAgent(v.lastUserAgent);
        key = d ? (d.device === "mobile" ? "Celular" : d.device === "tablet" ? "Tablet" : "Desktop") : null;
      } else if (deviceDim === "os") {
        key = parseOS(v.lastUserAgent);
      } else {
        key = parseBrowser(v.lastUserAgent);
      }
      const k = key ?? "Desconhecido";
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return topBuckets(counts, 10);
  }, [visitors, deviceDim]);

  // ── Eventos por UTM (tabela) ─────────────────────────────────────────────────
  const utmRows = useMemo(() => {
    const scopedConv = new Map<string, { leads: number; sales: number; revenue: number }>();
    for (const e of events) {
      if (e.event_name !== "Lead" && e.event_name !== "Purchase") continue;
      if (!scopedConv.has(e.fingerprint_id)) scopedConv.set(e.fingerprint_id, { leads: 0, sales: 0, revenue: 0 });
      const c = scopedConv.get(e.fingerprint_id)!;
      if (e.event_name === "Lead") c.leads += 1;
      if (e.event_name === "Purchase") { c.sales += 1; c.revenue += e.value ?? 0; }
    }
    const m = new Map<string, { users: number; leads: number; sales: number; revenue: number }>();
    for (const v of visitors) {
      const rawKey = visitorUtm(v)[utmDim]?.trim();
      const key = rawKey || UNDEFINED_LABEL;
      const cur = m.get(key) ?? { users: 0, leads: 0, sales: 0, revenue: 0 };
      const conv = scopedConv.get(v.fingerprintId) ?? { leads: 0, sales: 0, revenue: 0 };
      cur.users += 1;
      if (conv.leads > 0) cur.leads += 1;
      cur.sales += conv.sales;
      cur.revenue += conv.revenue;
      m.set(key, cur);
    }
    return [...m.entries()]
      .map(([label, vals]) => ({ label, ...vals }))
      .sort((a, b) => b[utmSort] - a[utmSort]);
  }, [visitors, events, utmDim, utmSort]);

  const utmTotals = useMemo(
    () => utmRows.reduce((acc, r) => ({
      users: acc.users + r.users, leads: acc.leads + r.leads, sales: acc.sales + r.sales, revenue: acc.revenue + r.revenue,
    }), { users: 0, leads: 0, sales: 0, revenue: 0 }),
    [utmRows],
  );

  // ── Funil de conversão ──────────────────────────────────────────────────────
  const funnelSteps = [
    { label: "Visitantes", value: totals.uniqueUsers, color: theme.c1 },
    { label: "Leads", value: totals.leads, color: theme.c4 },
    { label: "Compras", value: totals.customers, color: theme.c3 },
  ];

  const utmDimLabel: Record<UtmDim, string> = {
    utm_source: "Origem",
    utm_medium: "Mídia",
    utm_campaign: "Campanha",
    utm_content: "Conteúdo",
    utm_term: "Termo",
    utm_ad_id: "Anúncio",
  };

  if (visitors.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16">
        <Radar size={26} style={{ color: "var(--dm-text-tertiary)" }} />
        <p className="text-sm" style={{ color: "var(--dm-text-tertiary)" }}>Nenhum dado no período / funil selecionado.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {eventsCapped && (
        <div className="rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: "rgba(217,119,6,0.3)", background: "rgba(217,119,6,0.08)", color: "#d97706" }}>
          Mostrando os eventos mais recentes (limite atingido). Estreite o período para métricas exatas.
        </div>
      )}
      {!funnelHasProductNames && (
        <div className="rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: "rgba(99,102,200,0.3)", background: "rgba(99,102,200,0.06)", color: "var(--dm-text-secondary)" }}>
          <strong style={{ color: "var(--dm-text-primary)" }}>Atribuição limitada</strong> — funil sem produto configurado. Compras Eduzz chegam server-side e podem não carregar a mesma jornada da URL. Configure <strong>Produto</strong> no funil para atribuição precisa.
        </div>
      )}

      {/* Scorecards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <ScoreCard label="Usuários únicos" value={fmtInt(totals.uniqueUsers)} icon={Users} accent="#6366C8" />
        <ScoreCard label="Eventos" value={fmtInt(totals.totalEvents)} icon={Activity} accent="#0891b2" />
        <ScoreCard label="Leads" value={fmtInt(totals.leads)} icon={UserCheck} accent="#313491" />
        <ScoreCard label="Vendas" value={fmtInt(totals.sales)} icon={ShoppingBag} accent="#d97706" />
        <ScoreCard label="Receita" value={formatMoney(totals.revenue, currency)} icon={DollarSign} accent="#059669" />
        <ScoreCard label="Conversão" value={fmtPct(totals.convRate)} icon={TrendingUp} accent="#7c3aed" />
      </div>

      {/* Timeline */}
      <Panel
        title="Linha do tempo"
        icon={Activity}
        action={
          <ToggleGroup
            value={timelineMetric}
            onChange={setTimelineMetric}
            options={[
              { value: "events", label: "Eventos" },
              { value: "users", label: "Usuários" },
              { value: "leads", label: "Leads" },
              { value: "sales", label: "Vendas" },
            ]}
          />
        }
      >
        {timeline.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={timeline} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="ta-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.c1} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={theme.c1} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.gridStroke} vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} interval={xInterval(timeline.length)} tick={{ fill: theme.tickFill, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: theme.tickFill, fontSize: 11 }} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
              <Tooltip
                contentStyle={theme.tooltipStyle.contentStyle}
                cursor={theme.tooltipStyle.cursor}
                labelFormatter={(l) => shortDate(String(l))}
                formatter={(val) => [fmtInt(Number(val)), ""]}
              />
              <Area type="monotone" dataKey={timelineMetric} stroke={theme.c1} strokeWidth={2} fill="url(#ta-area)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyHint text="Sem eventos no período." />
        )}
      </Panel>

      {/* Funil + Eventos por tipo */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Funil de conversão" icon={TrendingUp}>
          <div className="flex flex-col gap-2.5">
            {funnelSteps.map((step, i) => {
              const top = funnelSteps[0].value || 1;
              const prev = i > 0 ? funnelSteps[i - 1].value : step.value;
              const pctTop = (step.value / top) * 100;
              const pctPrev = prev > 0 ? (step.value / prev) * 100 : 0;
              return (
                <div key={step.label}>
                  <div className="mb-0.5 flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-semibold" style={{ color: "var(--dm-text-secondary)" }}>{step.label}</span>
                    <span className="tabular-nums" style={{ color: "var(--dm-text-tertiary)" }}>
                      <span className="font-bold" style={{ color: "var(--dm-text-primary)" }}>{fmtInt(step.value)}</span>
                      {i > 0 && <span className="ml-1.5 opacity-80">{fmtPct(pctPrev)} da etapa anterior</span>}
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-md" style={{ background: "var(--dm-bg-elevated)" }}>
                    <div className="h-full rounded-md transition-all" style={{ width: `${Math.max(pctTop, 2)}%`, background: step.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Eventos por tipo" icon={Activity}>
          <BarList
            color={theme.c1}
            empty="Sem eventos."
            items={eventsByType.map((e) => ({
              key: e.name,
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: EVENT_COLORS[e.name]?.text ?? "var(--dm-text-tertiary)" }} />
                  {EVENT_LABELS[e.name] ?? e.name}
                </span>
              ),
              value: e.value,
            }))}
          />
        </Panel>
      </div>

      {/* Localização (usuários/vendas) + Usuários por origem */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel
          title={geoMode === "users" ? "Usuários por localização" : "Vendas por localização"}
          icon={Globe}
          action={
            <div className="flex flex-wrap items-center gap-1.5">
              <ToggleGroup
                value={geoMode}
                onChange={setGeoMode}
                options={[
                  { value: "users", label: "Usuários" },
                  { value: "sales", label: "Vendas" },
                ]}
              />
              <ToggleGroup
                value={geoDim}
                onChange={setGeoDim}
                options={[
                  { value: "country", label: "País" },
                  { value: "region", label: "Estado" },
                  { value: "city", label: "Cidade" },
                ]}
              />
            </div>
          }
        >
          <BarList
            color={geoMode === "users" ? "#0891b2" : "#059669"}
            empty={geoMode === "users" ? "Sem dados de localização." : "Nenhuma venda com localização no período."}
            formatValue={geo[0]?.formatValue}
            items={geo.map((g) => ({
              key: g.label,
              label: <span>{g.flag && <span className="mr-1">{g.flag}</span>}{g.label}</span>,
              value: g.value,
              sub: g.sub,
            }))}
          />
        </Panel>

        <Panel
          title="Usuários por origem"
          icon={Radio}
          action={
            <ToggleGroup
              value={sourceDim}
              onChange={setSourceDim}
              options={[
                { value: "utm_source", label: "Origem" },
                { value: "utm_medium", label: "Mídia" },
              ]}
            />
          }
        >
          <BarList
            color="#7c3aed"
            empty="Sem dados de origem."
            items={usersBySource.map((s) => ({ key: s.label, label: s.label, value: s.value }))}
          />
        </Panel>
      </div>

      {/* Vendas por origem (last-touch) + UTM final da venda */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel
          title="Vendas por origem (first-touch)"
          icon={ShoppingBag}
        >
          <BarList
            color="#059669"
            empty="Nenhuma venda com UTM Source no período."
            formatValue={(v) => formatMoney(v, currency)}
            items={salesBySource.map((s) => ({
              key: s.label,
              label: s.label,
              value: s.value,
              sub: s.sub,
            }))}
          />
        </Panel>

        <Panel
          title="UTM Source no momento da venda"
          icon={Tag}
        >
          <BarList
            color="#d97706"
            empty="Nenhuma venda com UTM Source no evento."
            formatValue={(v) => formatMoney(v, currency)}
            items={utmFinalDeSale.map((s) => ({
              key: s.label,
              label: s.label,
              value: s.value,
              sub: s.sub,
            }))}
          />
          <p className="mt-2 text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
            UTM diretamente no evento de compra. Vendas Eduzz server-side sem UTM aparecem como "Sem UTM na venda".
          </p>
        </Panel>
      </div>

      {/* Dispositivos */}
      <Panel
        title="Dispositivos dos usuários"
        icon={Monitor}
        action={
          <ToggleGroup
            value={deviceDim}
            onChange={setDeviceDim}
            options={[
              { value: "os", label: "Sistema Operacional" },
              { value: "device", label: "Tipo" },
              { value: "browser", label: "Navegador" },
            ]}
          />
        }
      >
        <BarList
          color="#7c3aed"
          empty="Sem dados de dispositivo."
          items={deviceStats.map((d) => ({ key: d.label, label: d.label, value: d.value }))}
        />
      </Panel>

      {/* Eventos por UTM */}
      <Panel
        title="Leads & Vendas por UTM"
        icon={Tag}
        action={
          <ToggleGroup
            value={utmDim}
            onChange={setUtmDim}
            options={[
              { value: "utm_source", label: "Origem" },
              { value: "utm_medium", label: "Mídia" },
              { value: "utm_campaign", label: "Campanha" },
              { value: "utm_content", label: "Conteúdo" },
              { value: "utm_term", label: "Termo" },
              { value: "utm_ad_id", label: "Anúncio" },
            ]}
          />
        }
      >
        {utmRows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[11px]">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--dm-border-default)" }}>
                  <th className="px-2 py-2 text-left font-semibold" style={{ color: "var(--dm-text-tertiary)" }}>
                    {utmDimLabel[utmDim]}
                  </th>
                  {([["users", "Usuários"], ["leads", "Leads"], ["sales", "Vendas"], ["revenue", "Receita"]] as [UtmSortCol, string][]).map(([col, label]) => (
                    <th
                      key={col}
                      onClick={() => setUtmSort(col)}
                      className="cursor-pointer select-none px-2 py-2 text-right font-semibold transition-opacity hover:opacity-70"
                      style={{ color: utmSort === col ? "var(--dm-primary)" : "var(--dm-text-tertiary)" }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {utmRows.map((r, i) => (
                  <tr key={r.label} style={{ borderBottom: i < utmRows.length - 1 ? "1px solid var(--dm-border-subtle)" : undefined }}>
                    <td className="max-w-[240px] truncate px-2 py-2" style={{ color: "var(--dm-text-secondary)" }} title={r.label}>{r.label}</td>
                    <td className="px-2 py-2 text-right tabular-nums" style={{ color: "var(--dm-text-primary)" }}>{fmtInt(r.users)}</td>
                    <td className="px-2 py-2 text-right tabular-nums" style={{ color: "var(--dm-text-primary)" }}>{fmtInt(r.leads)}</td>
                    <td className="px-2 py-2 text-right tabular-nums" style={{ color: "var(--dm-text-primary)" }}>{fmtInt(r.sales)}</td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums" style={{ color: r.revenue > 0 ? "#059669" : "var(--dm-text-tertiary)" }}>
                      {r.revenue > 0 ? formatMoney(r.revenue, currency) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "1px solid var(--dm-border-default)" }}>
                  <td className="px-2 py-2 font-bold" style={{ color: "var(--dm-text-primary)" }}>Total</td>
                  <td className="px-2 py-2 text-right font-bold tabular-nums" style={{ color: "var(--dm-text-primary)" }}>{fmtInt(utmTotals.users)}</td>
                  <td className="px-2 py-2 text-right font-bold tabular-nums" style={{ color: "var(--dm-text-primary)" }}>{fmtInt(utmTotals.leads)}</td>
                  <td className="px-2 py-2 text-right font-bold tabular-nums" style={{ color: "var(--dm-text-primary)" }}>{fmtInt(utmTotals.sales)}</td>
                  <td className="px-2 py-2 text-right font-bold tabular-nums" style={{ color: "#059669" }}>{formatMoney(utmTotals.revenue, currency)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <EmptyHint text="Sem UTMs capturadas no período." />
        )}
      </Panel>
    </div>
  );
}
