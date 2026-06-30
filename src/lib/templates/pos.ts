import type { Template } from "./types";
import { formatBRL, formatInt, safeDivide } from "@/lib/format";

export const posTemplate: Template = {
  id: "pos",
  label: "Pós Graduação",
  description: "Lançamentos mensais com funil de leads e venda de curso",
  color: "#16A34A",
  kpis: [
    { id: "spend",   label: "Investimento", format: formatBRL, color: "brand" },
    { id: "revenue", label: "Faturamento",  format: formatBRL, color: "green" },
    { id: "sales",   label: "Vendas",       format: formatInt, color: "green" },
    { id: "cpa",     label: "CPA Médio",    format: formatBRL, color: "rose",  invert: true, tooltip: "Custo por Aquisição = Investimento ÷ Vendas" },
    { id: "roas",    label: "ROAS",         format: (n) => `${n.toFixed(2)}x`, color: "brand", tooltip: "Retorno sobre Investimento em Anúncios = Faturamento ÷ Investimento" },
  ],
  funnel: [
    { id: "impressions", label: "Impressões",      bg: "#EEF2FF" },
    { id: "clicks",      label: "Cliques no link", bg: "#E0E7FF", rateFromPrev: "CTR" },
    { id: "leads",       label: "Leads",           bg: "#FEF9C3", rateFromPrev: "Tx. Captura" },
    { id: "sales",       label: "Vendas",          bg: "#D1FAE5", rateFromPrev: "Tx. Conversão" },
  ],
  table: {
    title: "Vendas por Campanha",
    columns: [
      { id: "name",  label: "Campanha",     align: "left" },
      { id: "sales", label: "Compras",      align: "right", format: formatInt },
      { id: "spend", label: "Investimento", align: "right", format: formatBRL },
      { id: "leads", label: "Leads",        align: "right", format: formatInt },
      { id: "cpa",   label: "CPA",          align: "right", format: formatBRL },
    ],
  },
  derive: (raw) => ({
    cpa:  safeDivide(raw.spend, raw.customResult || raw.sales),
    roas: safeDivide(raw.revenue, raw.spend),
  }),
};
