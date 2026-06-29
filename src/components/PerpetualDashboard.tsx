"use client";

import { useEffect, useState } from "react";
import { RefreshCw, TrendingUp, Users, Wallet, ChevronDown, ChevronUp, ArrowLeft, Zap } from "lucide-react";
import Link from "next/link";
import type { PerpetualDashboardData, ProdutoData, ProdutoKey } from "@/types/perpetuo";
import { useAdvertiserStore } from "@/hooks/useAdvertiserStore";
import { loadMetaCredentials, fetchMetaInsights } from "@/utils/metaApi";
import { classifyCampaign } from "@/utils/campaignClassifier";

// ── Helpers ───────────────────────────────────────────────────────────────────

const n  = (v: number | null, dec = 0) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

const brl = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pct = (v: number | null) => (v == null ? "—" : `${n(v, 1)}%`);

function semColor(p: number): string {
  if (p >= 100) return "#10b981";
  if (p >= 70)  return "#f59e0b";
  return "#ef4444";
}

// Parse emoji-prefixed cenário string: "🟢 -R$ 13.107,67" → { emoji, text }
function parseCenario(val: string | null): { emoji: string; text: string } {
  if (!val) return { emoji: "⬜", text: "—" };
  const match = val.match(/^(\p{Emoji_Presentation}|\p{Emoji}️?)\s*(.*)/u);
  if (match) return { emoji: match[1], text: match[2] || "—" };
  return { emoji: "⬜", text: val };
}

const PRODUTO_LABELS: Record<ProdutoKey, { name: string; emoji: string }> = {
  bm:  { name: "Biomecânica",           emoji: "🦴" },
  bb:  { name: "Bodybuilding",           emoji: "🏋️" },
  sm:  { name: "Treinamento feminino",    emoji: "🏃" },
  mpa: { name: "Musculação",             emoji: "💪" },
  fe:  { name: "Fisiologia",             emoji: "🫀" },
  tf:  { name: "Treinamento funcional",  emoji: "👩" },
};

// ── Mini donut ────────────────────────────────────────────────────────────────

const R = 22, CIRC = 2 * Math.PI * R;

function MiniDonut({ p, color }: { p: number; color: string }) {
  const clamp  = Math.min(p, 100);
  const offset = CIRC * (1 - clamp / 100);
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 80); return () => clearTimeout(t); }, []);
  return (
    <svg width={56} height={56} viewBox="0 0 56 56" className="-rotate-90 flex-shrink-0" aria-hidden>
      <circle cx="28" cy="28" r={R} fill="none" strokeWidth="5" stroke="var(--dm-bg-elevated)" />
      <circle cx="28" cy="28" r={R} fill="none" strokeWidth="5" stroke={color} strokeLinecap="round"
        strokeDasharray={CIRC} strokeDashoffset={ready ? offset : CIRC}
        style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.4,0,0.2,1)" }} />
    </svg>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function Bar({ p, color }: { p: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(p, 100)}%`, backgroundColor: color }} />
    </div>
  );
}

// ── Lead source split ─────────────────────────────────────────────────────────

function LeadBar({ label, value, total, color }: { label: string; value: number | null; total: number | null; color: string }) {
  const ratio = value != null && total != null && total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-[9px]">
        <span style={{ color: "var(--dm-text-tertiary)" }}>{label}</span>
        <span className="font-semibold" style={{ color: "var(--dm-text-secondary)" }}>{n(value)}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
        <div className="h-full rounded-full" style={{ width: `${ratio}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ── Cenários table ────────────────────────────────────────────────────────────

const CENARIO_COLS = ["atual", "futuro", "ideal"] as const;
const CENARIO_LABELS: Record<string, string> = {
  atual: "Atual", futuro: "Futuro", ideal: "Ideal",
};
const CENARIO_ROWS: Array<{ key: keyof ReturnType<typeof emptyCenario>; label: string }> = [
  { key: "investimento",  label: "Investimento" },
  { key: "custo_por_lead", label: "CPL" },
  { key: "leads",         label: "Leads" },
  { key: "taxa_captura",  label: "Tx. Captura" },
  { key: "vendas",        label: "Vendas" },
  { key: "taxa_conversao", label: "Tx. Conv." },
];

function emptyCenario() {
  return { investimento: null, custo_por_lead: null, leads: null, taxa_captura: null, vendas: null, taxa_conversao: null } as Record<string, string | null>;
}

function CenariosTable({ cenarios }: { cenarios: ProdutoData["cenarios"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px]">
        <thead>
          <tr>
            <th className="text-left py-1 pr-2 font-semibold" style={{ color: "var(--dm-text-tertiary)" }}>Métrica</th>
            {CENARIO_COLS.map((col) => (
              <th key={col} className="text-center py-1 px-1 font-semibold" style={{ color: "var(--dm-text-secondary)" }}>
                {CENARIO_LABELS[col]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CENARIO_ROWS.map(({ key, label }) => (
            <tr key={key} className="border-t" style={{ borderColor: "var(--dm-border-subtle)" }}>
              <td className="py-1.5 pr-2 font-medium" style={{ color: "var(--dm-text-tertiary)" }}>{label}</td>
              {CENARIO_COLS.map((col) => {
                const raw = (cenarios[col] as Record<string, string | null>)[key];
                const { emoji, text } = parseCenario(raw);
                return (
                  <td key={col} className="py-1.5 px-1 text-center">
                    <span>{emoji} </span>
                    <span style={{ color: "var(--dm-text-primary)" }}>{text}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Product card ──────────────────────────────────────────────────────────────

function ProdutoCard({ id, data }: { id: ProdutoKey; data: ProdutoData }) {
  const [showCenarios, setShowCenarios] = useState(false);
  const meta  = PRODUTO_LABELS[id] ?? { name: id.toUpperCase(), emoji: "📊" };
  const rc    = data.resumo_campanha;
  const m     = data.metas;

  const totalInvest = rc.investimento.total ?? 0;
  const totalLeads  = rc.leads.total ?? 0;
  const totalVendas = rc.funil.vendas ?? 0;

  const pctInvest = m.orcamento    ? (totalInvest / m.orcamento)    * 100 : 0;
  const pctLeads  = m.meta_leads   ? (totalLeads  / m.meta_leads)   * 100 : 0;
  const pctVendas = m.meta_vendas  ? (totalVendas / m.meta_vendas)  * 100 : 0;

  const mainColor = semColor(pctLeads);

  return (
    <article className="rounded-[20px] border bg-white dark:bg-[#1d2027] shadow-horizon overflow-hidden"
      style={{ borderColor: "var(--dm-border-default)" }}>

      {/* Header */}
      <div className="flex items-center gap-3 p-4 pb-3">
        <div className="relative flex-shrink-0">
          <MiniDonut p={pctLeads} color={mainColor} />
          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold" style={{ color: mainColor }}>
            {Math.round(pctLeads)}%
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-lg leading-none">{meta.emoji}</span>
            <p className="text-sm font-bold truncate" style={{ color: "var(--dm-text-primary)" }}>{meta.name}</p>
          </div>
          <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
            {n(totalLeads)} leads · {n(totalVendas)} vendas
          </p>
        </div>
      </div>

      <div className="px-4 pb-4 space-y-3">
        {/* Metas progress */}
        <div className="space-y-2">
          {[
            { label: "Orçamento",  value: brl(totalInvest),  meta: brl(m.orcamento),   p: pctInvest, invert: true },
            { label: "Leads",      value: n(totalLeads),     meta: n(m.meta_leads),     p: pctLeads  },
            { label: "Vendas",     value: n(totalVendas),    meta: n(m.meta_vendas),    p: pctVendas },
          ].map(({ label, value, meta: metaVal, p }) => {
            const c = semColor(p);
            return (
              <div key={label}>
                <div className="mb-0.5 flex items-center justify-between text-[10px]">
                  <span style={{ color: "var(--dm-text-tertiary)" }}>{label}</span>
                  <span className="font-semibold" style={{ color: c }}>{value} / {metaVal}</span>
                </div>
                <Bar p={p} color={c} />
              </div>
            );
          })}
        </div>

        {/* KPI mini grid */}
        <div className="grid grid-cols-3 gap-px rounded-xl overflow-hidden border"
          style={{ borderColor: "var(--dm-border-subtle)", backgroundColor: "var(--dm-border-subtle)" }}>
          {[
            { label: "Invest.",   value: brl(rc.investimento.total) },
            { label: "CPL",       value: brl(rc.custo_por_lead.geral) },
            { label: "CTR",       value: pct(rc.taxas.ctr) },
            { label: "Connect",   value: pct(rc.taxas.connect_rate) },
            { label: "Captura",   value: pct(rc.taxas.taxa_captura) },
            { label: "Conv.",     value: pct(rc.taxas.taxa_conversao) },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col items-center px-2 py-2" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
              <p className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: "var(--dm-text-tertiary)" }}>{label}</p>
              <p className="text-[11px] font-bold" style={{ color: "var(--dm-text-primary)" }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Lead source */}
        <div className="space-y-1.5">
          <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>Origem de Leads ({n(totalLeads)} total)</p>
          <LeadBar label="Meta Ads"  value={rc.leads.meta_ads}  total={rc.leads.total} color="#3b82f6" />
          <LeadBar label="Google"    value={rc.leads.google_ads} total={rc.leads.total} color="#f59e0b" />
          <LeadBar label="Orgânico"  value={rc.leads.organico}  total={rc.leads.total} color="#10b981" />
        </div>

        {/* Cenários toggle */}
        <button type="button" onClick={() => setShowCenarios((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-[10px] font-semibold transition-opacity hover:opacity-70"
          style={{ borderColor: "var(--dm-border-subtle)", color: "var(--dm-text-secondary)" }}>
          <span>Cenários</span>
          {showCenarios ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>

        {showCenarios && (
          <div className="rounded-xl border p-3" style={{ borderColor: "var(--dm-border-subtle)" }}>
            <CenariosTable cenarios={data.cenarios} />
          </div>
        )}
      </div>
    </article>
  );
}

// ── Meta Ads strip (Lógica 1) ─────────────────────────────────────────────────

interface MetaAdsData {
  invest: number;
  leads:  number;
}

function MetaAdsStrip() {
  const { profiles }                = useAdvertiserStore();
  const [meta, setMeta]             = useState<MetaAdsData | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError]   = useState<string | null>(null);

  useEffect(() => {
    const { accessToken } = loadMetaCredentials();
    if (!accessToken || profiles.length === 0) return;

    const adAccounts = [...new Set(profiles.map((p) => p.adAccountId).filter(Boolean))];
    if (adAccounts.length === 0) return;

    const now       = new Date();
    const dateFrom  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const dateTo    = now.toISOString().split("T")[0];

    setMetaLoading(true);
    Promise.all(
      adAccounts.map((id) =>
        fetchMetaInsights(id, dateFrom, dateTo, { timeIncrement: "all_days" }),
      ),
    )
      .then((results) => {
        const flat = results.flat().filter((ins) => {
          const cat = classifyCampaign(ins.campaign_name);
          return cat === "pos" || cat === "perpetuo";
        });

        let invest = 0;
        let leads  = 0;
        for (const ins of flat) {
          invest += parseFloat(String(ins.spend)) || 0;
          const a = ins.actions?.find(
            (x) =>
              x.action_type === "lead" ||
              x.action_type === "leadgen_grouped" ||
              x.action_type === "onsite_conversion.lead_grouped",
          );
          if (a) leads += parseFloat(a.value) || 0;
        }
        setMeta({ invest, leads });
      })
      .catch((e) => {
        setMetaError(e instanceof Error ? e.message : "Erro Meta Ads");
      })
      .finally(() => setMetaLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles.length]);

  if (!meta && !metaLoading && !metaError) return null;

  return (
    <div
      className="mb-6 rounded-[18px] border p-4"
      style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-card)" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Zap size={14} className="text-amber-500 flex-shrink-0" />
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--dm-text-tertiary)" }}>
          Tráfego Pago · Meta Ads · Mês atual
        </span>
        {metaLoading && (
          <RefreshCw size={10} className="animate-spin ml-1" style={{ color: "var(--dm-text-tertiary)" }} />
        )}
      </div>
      {metaError && (
        <p className="text-xs" style={{ color: "#f87171" }}>{metaError}</p>
      )}
      {meta && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Investimento Meta", value: brl(meta.invest) },
            { label: "Leads Meta",        value: n(meta.leads) },
            { label: "CPL Meta",          value: meta.leads > 0 ? brl(meta.invest / meta.leads) : "—" },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-[9px] font-semibold uppercase" style={{ color: "var(--dm-text-tertiary)" }}>
                {label}
              </p>
              <p
                className="text-base font-bold mt-0.5"
                style={{ fontFamily: "var(--font-poppins)", color: "var(--dm-text-primary)" }}
              >
                {value}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface PerpetualDashboardProps {
  data: PerpetualDashboardData;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function PerpetualDashboard({ data, onRefresh, refreshing }: PerpetualDashboardProps) {
  const entries = Object.entries(data) as [ProdutoKey, ProdutoData][];

  // Aggregate totals across all products
  const totals = entries.reduce(
    (acc, [, d]) => ({
      invest: acc.invest + (d.resumo_campanha.investimento.total ?? 0),
      leads:  acc.leads  + (d.resumo_campanha.leads.total  ?? 0),
      vendas: acc.vendas + (d.resumo_campanha.funil.vendas ?? 0),
    }),
    { invest: 0, leads: 0, vendas: 0 },
  );

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--dm-bg-base)" }}>
      {/* Header */}
      <header className="sticky top-0 z-20 border-b px-4 py-3"
        style={{ backgroundColor: "var(--dm-bg-card)", borderColor: "var(--dm-border-default)" }}>
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-70"
            style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
            <ArrowLeft size={12} />
            Dashboard
          </Link>
          <span className="text-xl leading-none">♾️</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>Perpétuo — Visão Geral</h1>
            <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
              {entries.length} produtos · {n(totals.leads)} leads · {n(totals.vendas)} vendas · {brl(totals.invest)}
            </p>
          </div>
          {onRefresh && (
            <button type="button" onClick={onRefresh} disabled={refreshing}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-70 disabled:opacity-40"
              style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
              <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
              Atualizar
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        {/* Summary strip */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          {[
            { icon: Wallet,    label: "Total Investido", value: brl(totals.invest) },
            { icon: Users,     label: "Total Leads",     value: n(totals.leads) },
            { icon: TrendingUp, label: "Total Vendas",   value: n(totals.vendas) },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-[18px] border bg-white dark:bg-[#1d2027] shadow-horizon p-4 flex items-center gap-3"
              style={{ borderColor: "var(--dm-border-default)" }}>
              <Icon size={16} className="text-violet-500 flex-shrink-0" />
              <div>
                <p className="text-[10px] font-semibold" style={{ color: "var(--dm-text-tertiary)" }}>{label}</p>
                <p className="text-base font-bold font-[family-name:var(--font-poppins)]" style={{ color: "var(--dm-text-primary)" }}>{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Meta Ads strip */}
        <MetaAdsStrip />

        {/* Product grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {entries.map(([id, prodData]) => (
            <ProdutoCard key={id} id={id} data={prodData} />
          ))}
        </div>
      </main>
    </div>
  );
}
