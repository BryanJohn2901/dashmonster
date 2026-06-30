import type { Template } from "./types";
import { formatBRL, formatInt, safeDivide } from "@/lib/format";

export const imersaoTemplate: Template = {
  id: "imersao",
  label: "Imersão",
  description: "Eventos presenciais com venda de ingresso",
  color: "#0D9488",
  kpis: [
    { id: "spend",      label: "Investimento",      format: formatBRL, color: "brand" },
    { id: "tickets",    label: "Ingressos vendidos", format: formatInt, color: "green" },
    { id: "cpa_ticket", label: "CPA por ingresso",  format: formatBRL, color: "rose",  invert: true, tooltip: "Custo por Ingresso = Investimento ÷ Ingressos Vendidos" },
    { id: "roas",       label: "ROAS",              format: (n) => `${n.toFixed(2)}x`, color: "brand", tooltip: "Retorno sobre Investimento em Anúncios = Faturamento ÷ Investimento" },
    { id: "revenue",    label: "Faturamento",       format: formatBRL, color: "green" },
  ],
  funnel: [
    { id: "reach",       label: "Alcance",                bg: "#ECFDF5" },
    { id: "impressions", label: "Impressões",             bg: "#D1FAE5" },
    { id: "clicks",      label: "Cliques no link",        bg: "#A7F3D0", rateFromPrev: "CTR" },
    { id: "page_views",  label: "Visualização de página", bg: "#5EEAD4", rateFromPrev: "Tx. Visita" },
    { id: "leads",       label: "Lead",                   bg: "#FEF9C3", rateFromPrev: "Tx. Captura" },
    { id: "tickets",     label: "Vendas (ingressos)",     bg: "#D1FAE5", rateFromPrev: "Tx. Conversão" },
  ],
  table: {
    title: "Performance por Conjunto Criativo",
    columns: [
      { id: "campaign",    label: "Nome da campanha",    align: "left" },
      { id: "adset",       label: "Conjunto criativo",   align: "left" },
      { id: "reach",       label: "Alcance",             align: "right", format: formatInt },
      { id: "impressions", label: "Impressões",          align: "right", format: formatInt },
      { id: "clicks",      label: "Cliques",             align: "right", format: formatInt },
      { id: "page_views",  label: "Visualizações",       align: "right", format: formatInt },
      { id: "leads",       label: "Leads",               align: "right", format: formatInt },
      { id: "tickets",     label: "Ingressos",           align: "right", format: formatInt },
      { id: "spend",       label: "Investimento",        align: "right", format: formatBRL },
    ],
  },
  derive: (raw) => ({
    cpa_ticket: safeDivide(raw.spend, raw.tickets),
    roas:       safeDivide(raw.revenue, raw.spend),
  }),
};
