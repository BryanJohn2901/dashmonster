import type { Template, KpiSpec, FunnelStage, PersonalizadoConfig } from "./types";
import { formatBRL, formatInt, formatPercent, safeDivide } from "@/lib/format";

// ─── KPI Group structure (used by PersonalizadoBuilder for grouped display) ───

export interface KpiGroup {
  label: string;
  kpiIds: string[];
  igOnly?: boolean; // only shown when Instagram token is configured
}

// ─── Catalog of all available KPIs (3.5) ─────────────────────────────────────

export const ALL_KPI_OPTIONS: KpiSpec[] = [
  // Resultados
  { id: "customResult",  label: "Resultados",              format: formatInt,                    color: "green", tooltip: "Resultado auto-detectado da campanha — adapta-se ao tipo configurado (lead, compra, formulário, seguidor…). Mesmo valor que aparece na coluna Resultados da tabela." },
  { id: "sales",         label: "Conversões (pixel)",      format: formatInt,                    color: "green", tooltip: "Conversões registradas pelo pixel Meta — usa o resultado configurado quando disponível, caso contrário compras do pixel." },
  { id: "leads",         label: "Leads",                   format: formatInt,                    color: "green" },
  { id: "cpa",           label: "Custo por resultado",     format: formatBRL,                    color: "rose", invert: true },
  { id: "cpl",           label: "Custo por lead",          format: formatBRL,                    color: "rose", invert: true },
  // Alcance e entrega
  { id: "reach",         label: "Alcance",                 format: formatInt,                    color: "sky" },
  { id: "impressions",   label: "Impressões",              format: formatInt,                    color: "sky" },
  { id: "frequency",     label: "Frequência",              format: (n) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), color: "sky", tooltip: "Frequência — quantas vezes em média cada pessoa viu o anúncio" },
  { id: "cpm",           label: "CPM",                     format: formatBRL,                    color: "rose",  invert: true, tooltip: "Custo por Mil Impressões" },
  // Cliques e tráfego
  { id: "clicks",        label: "Cliques no link",         format: formatInt,                    color: "sky" },
  { id: "total_clicks",  label: "Cliques (todos)",         format: formatInt,                    color: "sky",   tooltip: "Todos os cliques: links, reações, compartilhamentos, etc." },
  { id: "cpc_link",      label: "CPC (link)",              format: formatBRL,                    color: "rose",  invert: true, tooltip: "Custo por Clique no Link" },
  { id: "cpc_all",       label: "CPC (todos)",             format: formatBRL,                    color: "rose",  invert: true, tooltip: "Custo por Clique (todos os cliques)" },
  { id: "ctr",           label: "CTR (link) %",            format: (n) => formatPercent(n),      color: "brand", tooltip: "Taxa de Clique no Link = Cliques no link ÷ Impressões" },
  { id: "ctr_all",       label: "CTR (todos) %",           format: (n) => formatPercent(n),      color: "brand", tooltip: "Taxa de Clique (todos) = Cliques totais ÷ Impressões" },
  { id: "page_views",    label: "Vis. de página",          format: formatInt,                    color: "sky",   tooltip: "Visualizações da Página de Destino após clique no anúncio" },
  { id: "cpv",           label: "Custo por visualização",  format: formatBRL,                    color: "rose",  invert: true, tooltip: "Custo por Visualização de Página de Destino" },
  // Investimento
  { id: "spend",         label: "Investimento",            format: formatBRL,                    color: "brand" },
  { id: "revenue",       label: "Faturamento",             format: formatBRL,                    color: "green" },
  { id: "roas",          label: "ROAS",                    format: (n) => `${n.toFixed(2)}x`,   color: "brand", tooltip: "Retorno sobre o Investimento em Anúncios = Receita ÷ Investimento" },
  // Perfil
  { id: "profile_visits", label: "Visitas ao perfil",     format: formatInt,                    color: "green" },
  { id: "new_followers", label: "Novos seguidores",        format: formatInt,                    color: "green" },
  { id: "cpf",           label: "Custo por seguidor",      format: formatBRL,                    color: "rose", invert: true },
  // Instagram orgânico (igOnly)
  { id: "ig_followers",  label: "Seguidores (IG)",         format: formatInt,                    color: "sky" },
  { id: "ig_growth",     label: "Crescimento IG",          format: formatInt,                    color: "green" },
  { id: "ig_reach",      label: "Alcance orgânico",        format: formatInt,                    color: "sky" },
  { id: "ig_impressions", label: "Impressões do perfil",   format: formatInt,                    color: "sky" },
  // Outros
  { id: "tickets",        label: "Ingressos",               format: formatInt, color: "green" },
  { id: "cpa_ticket",     label: "CPA por ingresso",        format: formatBRL, color: "rose", invert: true },
  // Vendas Eduzz (entrada manual — Eduzz não conectado ainda)
  { id: "sales_ingresso", label: "Vendas de Ingresso",      format: formatInt, color: "green", tooltip: "Vendas de ingresso (Eduzz) — valor inserido manualmente" },
  { id: "sales_pos",      label: "Vendas de Pós",           format: formatInt, color: "green", tooltip: "Vendas de pós-graduação (Eduzz) — valor inserido manualmente" },
  { id: "sales_total",    label: "Vendas Total",            format: formatInt, color: "green", tooltip: "Total de vendas Eduzz — valor inserido manualmente" },
  { id: "cpa_venda",      label: "Custo por Venda",         format: formatBRL, color: "rose",  invert: true, tooltip: "Custo por Venda = Investimento ÷ Vendas Total (auto-calculado)" },
  { id: "cpa_ingresso",  label: "Custo p/ Venda Ingresso", format: formatBRL, color: "rose",  invert: true, tooltip: "Custo por Venda de Ingresso = Investimento ÷ Vendas de Ingresso (auto-calculado)" },
  { id: "cpa_pos",       label: "Custo p/ Venda de Pós",  format: formatBRL, color: "rose",  invert: true, tooltip: "Custo por Venda de Pós = Investimento ÷ Vendas de Pós (auto-calculado)" },
];

// ─── KPI groups for builder UI (3.5) ─────────────────────────────────────────

export const KPI_GROUPS: KpiGroup[] = [
  { label: "Resultados",        kpiIds: ["customResult", "sales", "leads", "cpa", "cpl"] },
  { label: "Alcance e entrega", kpiIds: ["reach", "impressions", "frequency", "cpm"] },
  { label: "Cliques e tráfego", kpiIds: ["clicks", "total_clicks", "cpc_link", "cpc_all", "ctr", "ctr_all", "page_views", "cpv"] },
  { label: "Investimento",      kpiIds: ["spend", "revenue", "roas"] },
  { label: "Perfil",            kpiIds: ["profile_visits", "new_followers", "cpf"] },
  { label: "Instagram",         kpiIds: ["ig_followers", "ig_growth", "ig_reach", "ig_impressions"], igOnly: true },
  { label: "Outros",            kpiIds: ["tickets", "cpa_ticket", "sales_ingresso", "sales_pos", "sales_total", "cpa_venda", "cpa_ingresso", "cpa_pos"] },
];

// ─── Catalog of all available funnel stages ───────────────────────────────────

export const ALL_FUNNEL_OPTIONS: FunnelStage[] = [
  { id: "reach",          label: "Alcance",                  bg: "#DBEAFE" },
  { id: "impressions",    label: "Impressões",               bg: "#BFDBFE" },
  { id: "clicks",         label: "Cliques no link",          bg: "#93C5FD", rateFromPrev: "CTR" },
  { id: "page_views",     label: "Visualizações de página",  bg: "#67E8F9", rateFromPrev: "Tx. Visita" },
  { id: "leads",          label: "Leads",                    bg: "#FEF08A", rateFromPrev: "Tx. Captura" },
  { id: "sales",          label: "Vendas",                   bg: "#BBF7D0", rateFromPrev: "Tx. Conversão" },
  { id: "profile_visits", label: "Visitas ao perfil",        bg: "#A7F3D0", rateFromPrev: "Tx. Visita" },
  { id: "new_followers",  label: "Novos seguidores",         bg: "#6EE7B7", rateFromPrev: "Tx. Follow" },
  { id: "tickets",        label: "Ingressos vendidos",       bg: "#D1FAE5", rateFromPrev: "Tx. Conversão" },
  { id: "sales_ingresso", label: "Vendas de Ingresso",      bg: "#BBF7D0", rateFromPrev: "Tx. Conversão" },
  { id: "sales_pos",      label: "Vendas de Pós",           bg: "#A7F3D0", rateFromPrev: "Tx. Conversão" },
];

const KPI_MAP    = Object.fromEntries(ALL_KPI_OPTIONS.map((k) => [k.id, k]));
const FUNNEL_MAP = Object.fromEntries(ALL_FUNNEL_OPTIONS.map((s) => [s.id, s]));

export const DEFAULT_PERSONALIZADO_CONFIG: PersonalizadoConfig = {
  kpiIds:    ["spend", "impressions", "clicks", "leads", "cpa"],
  funnelIds: ["impressions", "clicks", "leads", "sales"],
};

// ─── Dynamic template builder ─────────────────────────────────────────────────

export function buildPersonalizadoTemplate(config: PersonalizadoConfig): Template {
  // dedup: preserves first occurrence order
  const seenIds = new Set<string>();
  const uniqueIds = config.kpiIds.filter((id) => {
    if (seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });
  const kpis   = uniqueIds.map((id) => KPI_MAP[id]).filter(Boolean);
  const funnel = config.funnelIds.map((id) => FUNNEL_MAP[id]).filter(Boolean);

  // Table: campaign + adset fixed, then one column per selected KPI; spend always last if missing
  const kpiCols = kpis.map((k) => ({ id: k.id, label: k.label, align: "right" as const, format: k.format }));
  const hasSpend = kpis.some((k) => k.id === "spend");
  const tableColumns = [
    { id: "campaign", label: "Campanha", align: "left" as const },
    { id: "adset",    label: "Conjunto", align: "left" as const },
    ...kpiCols,
    ...(!hasSpend ? [{ id: "spend", label: "Investimento", align: "right" as const, format: formatBRL }] : []),
  ];

  return {
    id: "personalizado",
    label: config.name ?? "Personalizado",
    description: "Dashboard montado por você",
    color: "#7C3AED",
    kpis,
    funnel,
    table: { title: "Performance por Conjunto", columns: tableColumns },
    derive: (raw) => ({
      // cpa usa customResult quando disponível (auto-detectado por linha),
      // cai pra sales como fallback (comportamento pré-3.8 preservado).
      cpa:        safeDivide(raw.spend, (raw.customResult || raw.sales) ?? 0),
      cpl:        safeDivide(raw.spend, raw.leads ?? 0),
      cpm:        raw.impressions > 0 ? (raw.spend / raw.impressions) * 1000 : 0,
      frequency:  safeDivide(raw.impressions, raw.reach ?? 0),
      ctr:        raw.impressions > 0 ? (raw.clicks / raw.impressions) * 100 : 0,
      ctr_all:    raw.impressions > 0 ? ((raw.total_clicks ?? 0) / raw.impressions) * 100 : 0,
      cpc_link:   safeDivide(raw.spend, raw.clicks ?? 0),
      cpc_all:    safeDivide(raw.spend, raw.total_clicks ?? 0),
      cpv:        safeDivide(raw.spend, raw.page_views ?? 0),
      roas:       safeDivide(raw.revenue, raw.spend),
      cpf:        safeDivide(raw.spend, raw.new_followers ?? 0),
      cpa_ticket: safeDivide(raw.spend, raw.tickets ?? 0),
      cpa_venda:     safeDivide(raw.spend, raw.sales_total    ?? 0),
      cpa_ingresso:  safeDivide(raw.spend, raw.sales_ingresso ?? 0),
      cpa_pos:       safeDivide(raw.spend, raw.sales_pos      ?? 0),
    }),
  };
}
