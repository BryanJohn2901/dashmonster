// ─── Discriminator ────────────────────────────────────────────────────────────

export type HistoricalKind = "lancamento" | "evento" | "perpetuo" | "instagram";

export const HISTORICAL_KIND_LABELS: Record<HistoricalKind, string> = {
  lancamento: "Lançamentos",
  evento: "Eventos",
  perpetuo: "Perpétuo",
  instagram: "Perfil Instagram",
};

/** Chave em companies.settings que guarda os rótulos das sub-abas por empresa. */
export const HISTORY_TAB_LABELS_KEY = "historyTabLabels";

/**
 * Rótulo da sub-aba do Histórico para uma empresa. Prioriza o override por
 * empresa (companies.settings.historyTabLabels) sobre o default do template.
 * O `kind` (slug) fica estável; só o texto exibido muda.
 */
export function historyKindLabel(
  kind: HistoricalKind,
  labels?: Record<string, string>,
): string {
  const override = labels?.[kind];
  return (typeof override === "string" && override.trim()) ? override.trim() : HISTORICAL_KIND_LABELS[kind];
}

// ─── Common fields ────────────────────────────────────────────────────────────

interface HistoricalRowBase {
  id?: string;
  kind: HistoricalKind;
  product: string;
  /** Turma / edição do lançamento — ex.: "1", "2", "3ª" etc. (opcional) */
  turma?: string;
  month: string;
  year: number;
  monthKey: string;
  monthLabel: string;
  investment: number;
  revenue: number;
  // Campos já usados pelo Histórico atual (mantidos para retrocompatibilidade)
  campaignEndDate?: string;
  cpm: number;
  reach: number;
  ctr: number;
  clicks: number;
  pageViews: number;
  pageViewRate: number;
  preCheckouts: number;
  preCheckoutRate: number;
  sales: number;
  salesRate: number;
  cac: number;
  roas: number;
  tag?: string;
}

// ─── Per-kind extras ──────────────────────────────────────────────────────────

export interface LancamentoExtras {
  /** Nome do evento/imersão que antecede o lançamento */
  imersao?: string;
  /** Ingressos vendidos na imersão */
  ingressosVendidos?: number;
  /** Faturamento gerado pelos ingressos da imersão */
  faturamentoIngresso?: number;
  /** Vendas da pós-graduação após a imersão */
  vendasPos?: number;
  /** Faturamento gerado pelas vendas da pós-graduação */
  faturamentoPos?: number;
}

export interface EventoExtras {
  reach: number;
  clicks: number;
  ctr: number;
  signups: number;
  tickets: number;
  conversionSignupToTicket: number;
  ticketAvg: number;
  cac: number;
  roas: number;
  lotes?: Array<{ label: string; tickets: number; price: number }>;
}

export interface PerpetuoExtras {
  reach: number;
  clicks: number;
  ctr: number;
  leads: number;
  newSubscribers: number;
  churn: number;
  mrr: number;
  ltv: number;
  cac: number;
  paybackMonths: number;
}

export interface InstagramExtras {
  organicReach: number;
  accountsReached: number;
  accountsEngaged: number;
  newFollowers: number;
  totalFollowers: number;
  saves: number;
  shares: number;
  comments: number;
  likes: number;
  engagementRate: number;
  topContents: string;
}

type AllExtras = LancamentoExtras & EventoExtras & PerpetuoExtras & InstagramExtras;

// ─── Discriminated union ──────────────────────────────────────────────────────

export type HistoricalRow =
  | (HistoricalRowBase & { kind: "lancamento" } & Partial<AllExtras>)
  | (HistoricalRowBase & { kind: "evento" } & Partial<AllExtras>)
  | (HistoricalRowBase & { kind: "perpetuo" } & Partial<AllExtras>)
  | (HistoricalRowBase & { kind: "instagram" } & Partial<AllExtras>);

// ─── Meta (per-product targets) ───────────────────────────────────────────────

export interface HistoricalMeta {
  id?: string;
  product: string;
  kind?: HistoricalKind;
  investment: number;
  cpm: number;
  ctr: number;
  pageViewRate: number;
  preCheckoutRate: number;
  salesTarget: number;
  cac: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isLancamento(r: HistoricalRow): r is Extract<HistoricalRow, { kind: "lancamento" }> {
  return r.kind === "lancamento";
}
export function isEvento(r: HistoricalRow): r is Extract<HistoricalRow, { kind: "evento" }> {
  return r.kind === "evento";
}
export function isPerpetuo(r: HistoricalRow): r is Extract<HistoricalRow, { kind: "perpetuo" }> {
  return r.kind === "perpetuo";
}
export function isInstagram(r: HistoricalRow): r is Extract<HistoricalRow, { kind: "instagram" }> {
  return r.kind === "instagram";
}
