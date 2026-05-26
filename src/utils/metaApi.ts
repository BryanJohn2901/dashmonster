import type { CampaignData } from "@/types/campaign";
import { saveMetaTokenToDB } from "@/utils/supabaseProfiles";

/**
 * Parses a Meta API numeric string ("400.00", "9000000") correctly.
 * Meta always uses US decimal format (dot as decimal separator), NOT Brazilian format.
 * Using parseBR/safeNumber here would strip the decimal dot and inflate values 100x
 * (e.g. "400.00" → parseBR → "40000" → 40000 instead of 400).
 */
function parseMetaNum(v: string | number | undefined | null): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

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

  const res  = await fetch(`/api/meta/campaigns?${new URLSearchParams({ adAccountId, accessToken })}`);
  const body = await res.json() as MetaCampaign[] | { error: string };
  if (!res.ok) throw new Error((body as { error: string }).error ?? `Meta API error ${res.status}`);
  return body as MetaCampaign[];
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
  const res  = await fetch(`/api/meta/accounts?${new URLSearchParams({ accessToken })}`);
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

// ─── Insights ─────────────────────────────────────────────────────────────────

interface MetaAction {
  action_type: string;
  value: string; // numeric string
}

export interface MetaInsight {
  campaign_name: string;
  campaign_id:   string;
  ad_id?:        string;  // present when level="ad"
  ad_name?:      string;  // present when level="ad"
  adset_name?:   string;  // present when level="adset" or "ad"
  impressions:   string | number; // Meta API returns numeric strings
  reach:         string | number;
  clicks:        string | number; // all clicks (including reactions, shares — do NOT use for link metrics)
  inline_link_clicks?: string | number; // link clicks only — matches Meta Ads Manager "Cliques no link"
  spend:         string | number; // investment in account currency
  cpm:           string | number;
  ctr:           string | number; // all-click CTR percentage — e.g. "2.34" means 2.34%
  inline_link_click_ctr?: string | number; // link CTR — matches Meta Ads Manager default CTR column
  date_start:    string;
  date_stop:     string;
  actions?:       MetaAction[]; // conversion counts
  action_values?: MetaAction[]; // conversion revenue values
}

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

  const params = new URLSearchParams({ adAccountId, dateFrom, dateTo, accessToken });
  if (opts.campaignIds && opts.campaignIds.length > 0) {
    params.set("campaignIds", opts.campaignIds.join(","));
  }
  if (opts.level)         params.set("level",         opts.level);
  if (opts.timeIncrement) params.set("timeIncrement", opts.timeIncrement);

  const res = await fetch(`/api/meta/insights?${params.toString()}`);

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
  const params: Record<string, string> = { adAccountId, accessToken };
  if (cursor) params.cursor = cursor;
  const res  = await fetch(`/api/meta/creatives?${new URLSearchParams(params)}`);
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
    adAccountId, accessToken, dateFrom, dateTo,
    level: "ad",
    timeIncrement: "all_days",
  });

  const res = await fetch(`/api/meta/insights?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Meta API error ${res.status}`);
  }

  const rows = (await res.json()) as MetaInsight[];

  return rows
    .filter((r) => r.ad_id)
    .map((r) => {
      const spend       = parseFloat(String(r.spend))       || 0;
      const impressions = parseFloat(String(r.impressions)) || 0;
      const clicks      = r.inline_link_clicks != null
        ? parseFloat(String(r.inline_link_clicks)) || 0
        : parseFloat(String(r.clicks)) || 0;
      const ctrPct      = r.inline_link_click_ctr != null
        ? parseFloat(String(r.inline_link_click_ctr))
        : parseFloat(String(r.ctr)) || 0;
      const cpm         = parseFloat(String(r.cpm)) || 0;

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
    if (found) return parseFloat(found.value) || 0;
  }
  return 0;
}

// ─── Transformation ──────────────────────────────────────────────────────────

/**
 * Returns the value of the FIRST matching action_type found (for mutually-exclusive
 * purchase hierarchies: purchase > omni_purchase > fb_pixel_purchase).
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
 * Converts Meta Insights API rows into CampaignData records compatible
 * with the DashMonster dashboard.
 *
 * Conversion counting: purchase > omni_purchase > offsite_conversion.fb_pixel_purchase
 * Revenue:            action_values for the same types
 */
export function metaInsightsToCampaignData(
  insights: MetaInsight[],
  adAccountId: string,
): CampaignData[] {
  return insights.map((row) => {
    // parseMetaNum must be used here — Meta returns US decimal strings ("400.00").
    // Using parseBR/safeNumber would strip the dot and inflate values 100x.
    const investment  = parseMetaNum(row.spend);
    const impressions = parseMetaNum(row.impressions);

    // Prefer inline_link_clicks (link clicks only, matches Meta Ads Manager "Cliques").
    // Fall back to all clicks if inline_link_clicks is absent (e.g. older API responses).
    const clicks = row.inline_link_clicks != null
      ? parseMetaNum(row.inline_link_clicks)
      : parseMetaNum(row.clicks);

    // Conversions — try most specific purchase types first
    const conversions = pickAction(
      row.actions,
      "purchase",
      "omni_purchase",
      "offsite_conversion.fb_pixel_purchase",
    );

    // Revenue — from action_values (monetary value of purchases)
    const revenue = pickAction(
      row.action_values,
      "purchase",
      "omni_purchase",
      "offsite_conversion.fb_pixel_purchase",
    );

    // Leads — first match wins (same priority as Meta Ads Manager default column).
    // "onsite_conversion.lead_grouped" = grouped leads (Meta's primary metric, most complete).
    // "lead" = raw lead form completions (fallback for campaigns without grouped events).
    // "offsite_conversion.fb_pixel_lead" = pixel-tracked off-site leads (last resort).
    // IMPORTANT: these types are REDUNDANT at campaign level — Meta includes both
    // "lead" and "onsite_conversion.lead_grouped" with the same value. Summing = double-count.
    const leads = pickAction(
      row.actions,
      "onsite_conversion.lead_grouped",
      "lead",
      "offsite_conversion.fb_pixel_lead",
    );

    // CTR: Meta returns percentage strings ("2.34" = 2.34%).
    // Convert to decimal (0–1 range) for storage; recalculated as % when read from DB.
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
      revenue,
      ctr,
      cpc:            clicks      > 0 ? investment / clicks      : 0,
      cpa:            conversions > 0 ? investment / conversions : 0,
      roas:           investment  > 0 ? revenue    / investment  : 0,
      conversionRate: clicks      > 0 ? (conversions / clicks) * 100 : 0,
    };
  });
}
