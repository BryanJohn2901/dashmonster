import {
  parseMetaNum,
  metaInsightsToCampaignData,
  extractConversions,
  extractLeads,
  extractRevenue,
  type MetaInsight,
  type MetaAction,
} from "@/lib/metaTransform";
import { saveMetaTokenToDB } from "@/utils/supabaseProfiles";
import { metaFetch } from "@/lib/authedFetch";

// Reexporta a transformação canônica — fonte única em lib/metaTransform,
// compartilhada com o cron server-side (lib/metaSync.ts).
export {
  parseMetaNum,
  metaInsightsToCampaignData,
  extractConversions,
  extractLeads,
  extractRevenue,
};
export type { MetaInsight, MetaAction };

const CREDS_KEY = "pta_meta_creds_v1";

// ─── Campaigns ────────────────────────────────────────────────────────────────

export interface MetaCampaign {
  id: string;
  name: string;
  status: string;        // ACTIVE | PAUSED | DELETED | ARCHIVED
  objective: string;
  created_time: string;
}

/**
 * Fetches all campaigns (ACTIVE + PAUSED) for the given ad account.
 * Proxied through /api/meta/campaigns to avoid CORS.
 */
export async function fetchMetaCampaigns(
  adAccountId: string,
  accessToken: string,
): Promise<MetaCampaign[]> {
  if (!adAccountId) throw new Error("Informe o Ad Account ID.");
  if (!accessToken) throw new Error("Informe o Access Token antes de buscar campanhas.");

  const res  = await metaFetch(`/api/meta/campaigns?${new URLSearchParams({ adAccountId })}`, accessToken);
  const body = await res.json() as MetaCampaign[] | { error: string };
  if (!res.ok) throw new Error((body as { error: string }).error ?? `Meta API error ${res.status}`);
  return body as MetaCampaign[];
}

// ─── Status real (ACTIVE/PAUSED) de conjuntos de anúncio e anúncios ───────────

export interface MetaEntityStatus {
  id:               string;
  name:             string;
  status:           string; // toggle próprio: ACTIVE | PAUSED | DELETED | ARCHIVED
  effective_status: string; // estado real (inclui pausa herdada do pai):
                            // ACTIVE | PAUSED | CAMPAIGN_PAUSED | ADSET_PAUSED | …
  campaignId?:      string; // ID da campanha pai (adsets only)
  adsetId?:         string; // ID do conjunto pai (ads only)
}

/**
 * Busca o status real (toggle ligado/desligado no Gerenciador de Anúncios) de
 * conjuntos de anúncio ou anúncios, escopado às campanhas informadas.
 * Proxied through /api/meta/status para evitar CORS.
 */
export async function fetchMetaEntityStatus(
  adAccountId: string,
  accessToken: string,
  level: "adset" | "ad",
  campaignIds?: string[],
): Promise<MetaEntityStatus[]> {
  if (!adAccountId || !accessToken) return [];
  const params: Record<string, string> = { adAccountId, level };
  if (campaignIds && campaignIds.length > 0) params.campaignIds = campaignIds.join(",");
  const res  = await metaFetch(`/api/meta/status?${new URLSearchParams(params)}`, accessToken);
  const body = await res.json() as MetaEntityStatus[] | { error: string };
  if (!res.ok) throw new Error((body as { error: string }).error ?? `Meta API error ${res.status}`);
  return body as MetaEntityStatus[];
}

// ─── Objetivo real das campanhas (optimization_goal + promoted_object) ─────────

import type { CampaignGoal } from "@/lib/resultDetection";

/**
 * Busca o objetivo REAL de cada campanha (o que a Meta otimiza) → mapa campaignId→goal.
 * Usado para contar o "Resultado" igual à coluna Resultados da Meta, sem chute.
 * Falha silenciosa (devolve {}) — o auto-detect cobre quando o objetivo não vem.
 */
export async function fetchCampaignGoals(
  adAccountId: string,
  accessToken: string,
  campaignIds?: string[],
): Promise<Record<string, CampaignGoal>> {
  if (!adAccountId || !accessToken) return {};
  try {
    const params = new URLSearchParams({ adAccountId });
    if (campaignIds && campaignIds.length > 0) params.set("campaignIds", campaignIds.join(","));
    const res = await metaFetch(`/api/meta/adset-goals?${params}`, accessToken);
    if (!res.ok) return {};
    return (await res.json()) as Record<string, CampaignGoal>;
  } catch {
    return {};
  }
}

// ─── Ad Accounts ──────────────────────────────────────────────────────────────

export interface MetaAdAccount {
  id: string;            // "act_123456789" — includes prefix
  name: string;
  account_status: number; // 1 = active
  currency: string;
}

/** Fetches all ad accounts accessible by the given token (proxied to avoid CORS). */
export async function fetchMetaAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  if (!accessToken) throw new Error("Informe o Access Token antes de buscar as contas.");
  const res  = await metaFetch(`/api/meta/accounts`, accessToken);
  const body = await res.json() as MetaAdAccount[] | { error: string };
  if (!res.ok) throw new Error((body as { error: string }).error ?? `Meta API error ${res.status}`);
  return body as MetaAdAccount[];
}

// ─── Credentials ─────────────────────────────────────────────────────────────

export interface MetaCredentials {
  accessToken: string;
}

export function loadMetaCredentials(): MetaCredentials {
  if (typeof window === "undefined") return { accessToken: "" };
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    if (!raw) return { accessToken: "" };
    return { accessToken: "", ...JSON.parse(raw) };
  } catch {
    return { accessToken: "" };
  }
}

export function saveMetaCredentials(creds: MetaCredentials): void {
  try { localStorage.setItem(CREDS_KEY, JSON.stringify(creds)); } catch {}
  // Background Supabase sync — fire-and-forget
  if (creds.accessToken) {
    saveMetaTokenToDB(creds.accessToken).catch(() => {});
  }
}

/**
 * Grava só no localStorage, sem sincronizar com o Supabase.
 * Usado ao restaurar o token da empresa — membros não-owner não podem
 * (e não devem) gravar o token de volta no banco.
 */
export function cacheMetaCredentials(creds: MetaCredentials): void {
  try { localStorage.setItem(CREDS_KEY, JSON.stringify(creds)); } catch {}
}

// ─── Insights ─────────────────────────────────────────────────────────────────

export interface AdInsight {
  ad_id:        string;
  ad_name:      string;
  campaign_id:  string;
  campaign_name: string;
  adset_name:   string;
  spend:        number;
  impressions:  number;
  clicks:       number;
  ctr:          number;  // decimal (0–1)
  cpc:          number;
  cpm:          number;
  conversions:  number;
  leads:        number;
  revenue:      number;
  roas:         number;
  conversionRate: number;
}

export interface FetchInsightsOptions {
  /** API breakdown level. "campaign" = one row per campaign (default). "adset" = one row per ad set. "ad" = one row per ad. */
  level?: "campaign" | "adset" | "ad";
  /**
   * Time aggregation. "1" = daily rows (useful for trend charts).
   * "all_days" = single totals row per campaign/adset over the whole period.
   */
  timeIncrement?: "1" | "all_days";
  /** Limit results to specific campaign IDs. */
  campaignIds?: string[];
}

/**
 * Fetches insights from the Meta API for a given ad account and date range.
 *
 * Default: campaign-level, daily breakdown (one row per campaign per day).
 * Pass `level: "adset"` + `timeIncrement: "all_days"` for adset breakdowns without daily splitting.
 */
export async function fetchMetaInsights(
  adAccountId: string,
  dateFrom: string,
  dateTo: string,
  campaignIdsOrOptions?: string[] | FetchInsightsOptions,
): Promise<MetaInsight[]> {
  const { accessToken } = loadMetaCredentials();
  if (!accessToken) throw new Error("Token de acesso Meta não configurado.");

  // Backwards-compatible overload: if 4th arg is an array, treat as campaignIds
  const opts: FetchInsightsOptions = Array.isArray(campaignIdsOrOptions)
    ? { campaignIds: campaignIdsOrOptions }
    : (campaignIdsOrOptions ?? {});

  const params = new URLSearchParams({ adAccountId, dateFrom, dateTo });
  if (opts.campaignIds && opts.campaignIds.length > 0) {
    params.set("campaignIds", opts.campaignIds.join(","));
  }
  if (opts.level)         params.set("level",         opts.level);
  if (opts.timeIncrement) params.set("timeIncrement", opts.timeIncrement);

  const res = await metaFetch(`/api/meta/insights?${params.toString()}`, accessToken);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Meta API error ${res.status}`);
  }

  return (await res.json()) as MetaInsight[];
}

// ─── Creatives ────────────────────────────────────────────────────────────────

export interface MetaCampaignCreative {
  adId:          string;           // individual ad ID (unique per ad)
  adName:        string;           // ad name from Meta Ads Manager
  campaignId:    string;
  campaignName:  string;
  adsetName:     string;
  thumbnailUrl:  string;           // thumbnail URL (may expire — re-fetch to refresh)
  previewUrl:    string;           // preview_shareable_link (for direct preview)
  adLink:        string;           // Ads Library URL or preview link
  instagramUrl?: string;           // Instagram post permalink (if ad ran on Instagram)
  mediaType:     "image" | "video" | "carousel" | "unknown";
  createdTime?:       string;      // ISO 8601 — when the ad was created in Meta
  campaignStartTime?: string;      // ISO 8601 — when the parent campaign became active
  body?:              string;      // ad copy / caption text from object_story_spec
  headline?:          string;      // link headline (title shown under the creative)
  creativeId?:        string;      // AdCreative ID — used to fetch image_url at native resolution
  videoId?:           string;      // Meta video ID — used to fetch poster frame via /{videoId}?fields=picture
}

/**
 * Fetches one creative (thumbnail + link) per campaign for the given ad account.
 * Proxied through /api/meta/creatives to avoid CORS.
 */
/**
 * Fetches one page of creatives (up to 200 ads).
 * Pass `cursor` (base64-encoded next-page URL returned by the server) for subsequent pages.
 * Returns `{ data, nextCursor }` — `nextCursor` is absent on the last page.
 */
export async function fetchMetaCreativesPage(
  adAccountId: string,
  accessToken: string,
  cursor?: string,
): Promise<{ data: MetaCampaignCreative[]; nextCursor?: string }> {
  if (!adAccountId || !accessToken) return { data: [] };
  const params: Record<string, string> = { adAccountId };
  if (cursor) params.cursor = cursor;
  const res  = await metaFetch(`/api/meta/creatives?${new URLSearchParams(params)}`, accessToken);
  const body = await res.json() as { data: MetaCampaignCreative[]; nextCursor?: string } | { error: string };
  if (!res.ok) throw new Error((body as { error: string }).error ?? `Meta API error ${res.status}`);
  return body as { data: MetaCampaignCreative[]; nextCursor?: string };
}

/**
 * @deprecated Use fetchMetaCreativesPage for progressive loading.
 * Kept for backward-compatibility; fetches ALL pages sequentially.
 */
export async function fetchMetaCreatives(
  adAccountId: string,
  accessToken: string,
): Promise<MetaCampaignCreative[]> {
  const all: MetaCampaignCreative[] = [];
  let cursor: string | undefined;
  do {
    const { data, nextCursor } = await fetchMetaCreativesPage(adAccountId, accessToken, cursor);
    all.push(...data);
    cursor = nextCursor;
  } while (cursor);
  return all;
}

/**
 * Fetches ad-level insights (one row per ad, totals over date range).
 * Returns AdInsight[] with spend, CTR, conversions, leads, ROAS per ad ID.
 */
export async function fetchAdInsights(
  adAccountId: string,
  accessToken: string,
  dateFrom: string,
  dateTo: string,
): Promise<AdInsight[]> {
  if (!adAccountId || !accessToken || !dateFrom || !dateTo) return [];

  const params = new URLSearchParams({
    adAccountId, dateFrom, dateTo,
    level: "ad",
    timeIncrement: "all_days",
  });

  const res = await metaFetch(`/api/meta/insights?${params.toString()}`, accessToken);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Meta API error ${res.status}`);
  }

  const rows = (await res.json()) as MetaInsight[];

  return rows
    .filter((r) => r.ad_id)
    .map((r) => {
      const spend       = parseMetaNum(r.spend);
      const impressions = parseMetaNum(r.impressions);
      const clicks      = r.inline_link_clicks != null
        ? parseMetaNum(r.inline_link_clicks)
        : parseMetaNum(r.clicks);
      const ctrPct      = r.inline_link_click_ctr != null
        ? parseMetaNum(r.inline_link_click_ctr)
        : parseMetaNum(r.ctr);
      const cpm         = parseMetaNum(r.cpm);

      const conversions = pickActionRaw(r.actions, "purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase");
      const leads       = pickActionRaw(r.actions, "onsite_conversion.lead_grouped", "lead", "offsite_conversion.fb_pixel_lead");
      const revenue     = pickActionRaw(r.action_values, "purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase");

      return {
        ad_id:          r.ad_id!,
        ad_name:        r.ad_name ?? "",
        campaign_id:    r.campaign_id,
        campaign_name:  r.campaign_name,
        adset_name:     r.adset_name ?? "",
        spend,
        impressions,
        clicks,
        ctr:            ctrPct / 100,
        cpc:            clicks > 0 ? spend / clicks : 0,
        cpm,
        conversions,
        leads,
        revenue,
        roas:           spend  > 0 ? revenue / spend : 0,
        conversionRate: clicks > 0 ? (conversions / clicks) * 100 : 0,
      } satisfies AdInsight;
    });
}

function pickActionRaw(
  actions: Array<{ action_type: string; value: string }> | undefined,
  ...types: string[]
): number {
  if (!actions) return 0;
  for (const type of types) {
    const found = actions.find((a) => a.action_type === type);
    if (found) return parseMetaNum(found.value);
  }
  return 0;
}

