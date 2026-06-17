// ─── Product category ─────────────────────────────────────────────────────────

/** Built-in categories (fixed). Custom categories are arbitrary strings. */
export type BuiltinCategory = "pos" | "livros" | "ebooks" | "perpetuo" | "eventos";
/** Accepts built-in literal types + any custom string (open enum pattern). */
export type ProductCategory = BuiltinCategory | (string & {});

// ─── Fonte vs canal ─────────────────────────────────────────────────────────
//
// Dois eixos que antes eram confundidos num campo só:
//   • `source` = proveniência TÉCNICA da linha (como o dado entrou no sistema).
//                Enum fixo, casa com a coluna `source` de campaign_metrics.
//   • `origem` = canal de NEGÓCIO que dirige a quebra por fonte no card
//                ("Meta Ads", "Google", "Orgânico", "Indicação"…). String livre.
export type SourceChannel = "meta" | "eduzz" | "sheet" | "csv" | "google_sheets";

/** Deriva o rótulo de canal padrão a partir da proveniência técnica. */
export const DEFAULT_ORIGIN_BY_SOURCE: Record<SourceChannel, string> = {
  meta:          "Meta Ads",
  eduzz:         "Eduzz",
  sheet:         "Planilha",
  csv:           "Planilha",
  google_sheets: "Planilha",
};

export interface CampaignRawRow {
  Data: string;
  "Nome da Campanha": string;
  "Investimento (R$)": string | number;
  Cliques: string | number;
  Impressões: string | number;
  Conversões: string | number;
  "Receita (R$)": string | number;
}

export interface CampaignData {
  id: string;
  date: string;
  campaignName: string;
  investment: number;
  clicks: number;
  impressions: number;
  conversions: number;
  leads: number;
  pageViews?: number;   // landing_page_view (Meta) — visualizações de página
  revenue: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
  conversionRate: number;
  /** Proveniência técnica da linha. Default "meta" quando ausente (legado). */
  source?: SourceChannel;
  /** Canal de negócio p/ a quebra por fonte no card. Default derivado de `source`. */
  origem?: string;
}

/** Somatório de métricas de um canal de negócio (uma fatia do sourceBreakdown). */
export interface OriginBreakdown {
  origem: string;
  investment: number;
  clicks: number;
  impressions: number;
  conversions: number;
  leads: number;
  revenue: number;
}

/** Lead individual unificado (Meta lead forms + planilha) consumido pela aba Leads. */
export interface LeadRow {
  id: string;
  createdTime: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  /** Canal de negócio ("Meta Ads", "Orgânico", "Google"…). */
  origem: string;
  /** Produto identificado (coluna da planilha ou nome da campanha). */
  produto?: string;
  campaignName?: string;
  source: SourceChannel;
}

export interface DashboardTotals {
  totalInvestment: number;
  totalRevenue: number;
  totalClicks: number;
  totalImpressions: number;
  totalConversions: number;
  totalLeads: number;
  totalPageViews: number;
  roi: number;
  roas: number;
  // Weighted-average (ratio-of-sums) metrics — NOT arithmetic averages of per-campaign rates.
  cpa: number;
  ctr: number;
  conversionRate: number;
  cpc: number;
  cpm: number;
  cpl: number;
  /** Quebra dos totais por canal de negócio (Meta · Google · Orgânico · …). */
  sourceBreakdown: OriginBreakdown[];
}

export interface DailyTrendPoint {
  date: string;
  clicks: number;
  conversions: number;
  investment: number;
}

export interface CampaignComparisonPoint {
  campaignName: string;
  investment: number;
  revenue: number;
}

export interface BudgetDistributionPoint {
  campaignName: string;
  investment: number;
}

export interface AggregatedCampaign {
  campaignName: string;
  investment: number;
  revenue: number;
  clicks: number;
  impressions: number;
  conversions: number;
  roas: number;
  roi: number;
  ctr: number;
  cpa: number;
  conversionRate: number;
}
