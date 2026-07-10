import { META_API_VERSION } from "@/lib/meta";
import type { MetaInsight } from "@/lib/metaTransform";

// ─── Fetch de Meta Insights server-side ────────────────────────────────────────
// Mesma lógica de /api/meta/insights, isolada para reuso pela rota e pelo cron
// (api/meta/sync-all). Pagina via paging.next até esgotar.

export interface FetchInsightsServerOpts {
  level?: "campaign" | "adset" | "ad";
  timeIncrement?: "1" | "all_days";
  campaignIds?: string[];
  /** Busca insights de UM anúncio (/{adId}/insights) — leve, não estoura o
   *  limite de dados da Meta em conta grande. */
  adId?: string;
}

const BASE_FIELDS = [
  "campaign_name",
  "campaign_id",
  "impressions",
  "reach",
  "clicks",
  "inline_link_clicks",
  "spend",
  "cpm",
  "ctr",
  "inline_link_click_ctr",
  "date_start",
  "date_stop",
  "actions",
  "action_values",
];

/**
 * Busca insights da Meta para uma conta e período. Lança Error em falha da API.
 *
 * @param adAccountId  com ou sem prefixo "act_" — normalizado internamente.
 */
export async function fetchMetaInsightsServer(
  adAccountId: string,
  accessToken: string,
  dateFrom: string,
  dateTo: string,
  opts: FetchInsightsServerOpts = {},
): Promise<MetaInsight[]> {
  const accountId = adAccountId.replace(/^act_/, "");
  const level = opts.level ?? "campaign";

  const fields = [...BASE_FIELDS];
  if (level === "adset") fields.push("adset_name", "adset_id");
  if (level === "ad")    fields.push("ad_id", "ad_name", "adset_name", "adset_id");

  const params = new URLSearchParams({
    access_token:   accessToken,
    fields:         fields.join(","),
    time_range:     JSON.stringify({ since: dateFrom, until: dateTo }),
    level,
    time_increment: opts.timeIncrement ?? "1",
    limit:          "500",
  });

  if (opts.campaignIds && opts.campaignIds.length > 0) {
    const ids = opts.campaignIds.map((id) => String(id).trim()).filter(Boolean);
    if (ids.length > 0) {
      params.set(
        "filtering",
        JSON.stringify([{ field: "campaign.id", operator: "IN", value: ids }]),
      );
    }
  }

  const node = opts.adId ? opts.adId : `act_${accountId}`;
  const all: MetaInsight[] = [];
  let nextUrl: string | null =
    `https://graph.facebook.com/${META_API_VERSION}/${node}/insights?${params.toString()}`;

  while (nextUrl) {
    const res  = await fetch(nextUrl, { cache: "no-store" });
    const json = await res.json() as {
      data?:   MetaInsight[];
      paging?: { next?: string };
      error?:  { message?: string };
    };

    if (!res.ok || json.error) {
      throw new Error(json.error?.message ?? `Meta API error ${res.status}`);
    }

    all.push(...(json.data ?? []));
    nextUrl = json.paging?.next ?? null;
  }

  return all;
}
