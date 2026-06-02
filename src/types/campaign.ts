// ─── Product category ─────────────────────────────────────────────────────────

/** Built-in categories (fixed). Custom categories are arbitrary strings. */
export type BuiltinCategory = "pos" | "livros" | "ebooks" | "perpetuo" | "eventos";
/** Accepts built-in literal types + any custom string (open enum pattern). */
export type ProductCategory = BuiltinCategory | (string & {});

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
