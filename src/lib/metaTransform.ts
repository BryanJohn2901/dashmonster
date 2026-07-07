import type { CampaignData } from "@/types/campaign";

// ─── Transformação Meta Insights → CampaignData (fonte única) ──────────────────
// Funções puras, sem dependência de browser. Usadas tanto pelo cliente
// (utils/metaApi.ts reexporta) quanto pelo cron server-side (lib/metaSync.ts).

export interface MetaAction {
  action_type: string;
  value: string; // numeric string
}

export interface MetaInsight {
  campaign_name: string;
  campaign_id:   string;
  ad_id?:        string;
  ad_name?:      string;
  adset_id?:     string;
  adset_name?:   string;
  impressions:   string | number;
  reach:         string | number;
  clicks:        string | number;
  inline_link_clicks?: string | number;
  spend:         string | number;
  cpm:           string | number;
  ctr:           string | number;
  inline_link_click_ctr?: string | number;
  date_start:    string;
  date_stop:     string;
  actions?:       MetaAction[];
  action_values?: MetaAction[];
}

/**
 * Faz parse de string numérica da Meta ("400.00", "9000000") corretamente.
 * A Meta sempre usa formato US (ponto decimal), NUNCA formato BR.
 * parseBR/safeNumber aqui removeria o ponto e inflaria valores 100x.
 */
export function parseMetaNum(v: string | number | undefined | null): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Retorna o valor do PRIMEIRO action_type que casar (para hierarquias
 * mutuamente exclusivas: purchase > omni_purchase > fb_pixel_purchase).
 */
function pickAction(actions: MetaAction[] | undefined, ...types: string[]): number {
  if (!actions) return 0;
  for (const type of types) {
    const found = actions.find((a) => a.action_type === type);
    if (found) return parseFloat(found.value) || 0;
  }
  return 0;
}

/**
 * Maior valor entre os eventos CUSTOM de pixel (fbq trackCustom / conversão
 * personalizada) de uma linha — comuns em contas novas que ainda não convergiram
 * pro Purchase/Lead padrão da Meta (ex.: evento de checkout próprio). A Meta reporta
 * tanto o AGREGADO ("offsite_conversion.fb_pixel_custom", sem sufixo) quanto, às
 * vezes, por evento ("...fb_pixel_custom.EndForm") — sem exigir nome exato, pega
 * o agregado (total real) ou o evento, o que tiver maior valor.
 */
export function customPixelEventValue(actions: MetaAction[] | undefined): number {
  if (!actions) return 0;
  let best = 0;
  for (const a of actions) {
    if (
      a.action_type.startsWith("offsite_conversion.custom") ||
      a.action_type.startsWith("offsite_conversion.fb_pixel_custom")
    ) {
      const v = Number(a.value) || 0;
      if (v > best) best = v;
    }
  }
  return best;
}

/**
 * Conta conversões (compras). Primeiro match vence (tipos mutuamente exclusivos);
 * sem nenhum tipo padrão, cai pro evento custom de pixel (conta nova sem Purchase
 * nativo configurado ainda) — sem isso, "Conversões" ficava sempre 0 nesses casos.
 */
export function extractConversions(actions: MetaAction[] | undefined): number {
  return pickAction(actions, "purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase") || customPixelEventValue(actions);
}

/**
 * Conta leads. Primeiro match vence.
 * IMPORTANTE: os tipos são redundantes — a Meta pode retornar o mesmo valor em
 * "lead", "onsite_conversion.lead_grouped" e "leadgen_grouped". Somar = dobrado.
 * leadgen_grouped = Leads de Formulário (Meta native forms); os demais = pixel/web.
 */
export function extractLeads(actions: MetaAction[] | undefined): number {
  return pickAction(
    actions,
    "onsite_conversion.lead_grouped",
    "leadgen_grouped",
    "lead",
    "offsite_conversion.fb_pixel_lead",
  );
}

/** Extrai receita de compras de action_values. */
export function extractRevenue(actionValues: MetaAction[] | undefined): number {
  return pickAction(actionValues, "purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase");
}

/**
 * Converte linhas da Meta Insights API em CampaignData do dashboard.
 *
 * Conversões: purchase > omni_purchase > offsite_conversion.fb_pixel_purchase
 * Receita:    action_values dos mesmos tipos
 */
export function metaInsightsToCampaignData(
  insights: MetaInsight[],
  adAccountId: string,
): CampaignData[] {
  return insights.map((row) => {
    const investment  = parseMetaNum(row.spend);
    const impressions = parseMetaNum(row.impressions);

    // Prefere inline_link_clicks (cliques no link, igual ao Meta Ads Manager).
    const clicks = row.inline_link_clicks != null
      ? parseMetaNum(row.inline_link_clicks)
      : parseMetaNum(row.clicks);

    const conversions = extractConversions(row.actions);
    const revenue     = extractRevenue(row.action_values);
    const leads       = extractLeads(row.actions);

    // Visualizações de página de destino — "Vis. de Página" no funil.
    const pageViews = pickAction(row.actions, "landing_page_view", "omni_landing_page_view");

    // CTR: Meta retorna porcentagem ("2.34" = 2.34%). Armazena como decimal (0–1).
    const ctrPct = row.inline_link_click_ctr != null
      ? parseMetaNum(row.inline_link_click_ctr)
      : parseMetaNum(row.ctr);
    const ctr = ctrPct / 100;

    return {
      id:             `meta-${adAccountId}-${row.date_start}-${row.campaign_id}`,
      date:           row.date_start,
      campaignName:   row.campaign_name,
      investment,
      clicks,
      impressions,
      conversions,
      leads,
      pageViews,
      revenue,
      ctr,
      cpc:            clicks      > 0 ? investment / clicks      : 0,
      cpa:            conversions > 0 ? investment / conversions : 0,
      roas:           investment  > 0 ? revenue    / investment  : 0,
      conversionRate: clicks      > 0 ? (conversions / clicks) * 100 : 0,
    };
  });
}
