import { NextRequest, NextResponse } from "next/server";
import type { MetaCampaignCreative } from "@/utils/metaApi";

const META_API_VERSION = "v21.0";

/**
 * Fields that are GUARANTEED to exist on the AdCreative object (v21.0):
 *  - thumbnail_url        : thumbnail for all creative types (image, video, carousel)
 *  - object_story_spec    : ad story content — always present for page-post ads
 *    - link_data.link     : destination URL
 *    - link_data.child_attachments : carousel items (existence = carousel type)
 *    - video_data.image_url : poster frame for video ads
 *
 * Fields intentionally OMITTED (cause #100 on most accounts):
 *  - creative.image_url          (not a top-level creative field)
 *  - creative.picture            (requires special permission)
 *  - instagram_permalink_url     (requires Instagram permission)
 *  - effective_instagram_story_url (requires Instagram permission)
 *  - call_to_action.value.link   (restricted)
 *  - child_attachments.picture   (requires special permission)
 *  - child_attachments.image_url (not a valid field on child_attachments)
 */

interface MetaAdRaw {
  id: string;
  name: string;
  campaign_id: string;
  campaign?: { name: string };
  adset_name?: string;
  preview_shareable_link?: string;
  creative?: {
    id?: string;
    thumbnail_url?: string;
    object_story_spec?: {
      link_data?: {
        link?: string;
      };
      video_data?: { image_url?: string };
    };
  };
}

function detectMediaType(ad: MetaAdRaw): MetaCampaignCreative["mediaType"] {
  const spec = ad.creative?.object_story_spec;
  if (spec?.video_data) return "video";
  if (ad.creative?.thumbnail_url) return "image";
  return "unknown";
}

/**
 * GET /api/meta/creatives?accessToken=EAAx...&adAccountId=act_123
 *
 * Returns ALL active/paused/archived ads with thumbnail, preview link, media type.
 */
export async function GET(request: NextRequest) {
  const sp          = request.nextUrl.searchParams;
  const accessToken = sp.get("accessToken");
  const adAccountId = sp.get("adAccountId");

  if (!accessToken || !adAccountId) {
    return NextResponse.json(
      { error: "accessToken e adAccountId são obrigatórios." },
      { status: 400 },
    );
  }

  const accountId = adAccountId.replace(/^act_/, "");
  const allAds: MetaAdRaw[] = [];

  let nextUrl: string | null =
    `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/ads?` +
    new URLSearchParams({
      access_token: accessToken,
      fields: [
        "name",
        "campaign_id",
        "campaign{name}",
        "adset_name",
        "preview_shareable_link",
        // thumbnail_url: universal field — works for image, video, carousel
        // object_story_spec: safe subfields only
        "creative{id,thumbnail_url,object_story_spec{link_data{link},video_data{image_url}}}",
      ].join(","),
      effective_status: JSON.stringify(["ACTIVE", "PAUSED", "ARCHIVED"]),
      limit: "200",
    }).toString();

  try {
    while (nextUrl) {
      const res  = await fetch(nextUrl, { cache: "no-store" });
      const json = await res.json() as {
        data?:   MetaAdRaw[];
        paging?: { next?: string };
        error?:  { message?: string };
      };

      if (!res.ok || json.error) {
        const msg = json.error?.message ?? `Meta API error ${res.status}`;
        return NextResponse.json({ error: msg }, { status: 502 });
      }

      allAds.push(...(json.data ?? []));
      nextUrl = json.paging?.next ?? null;
    }

    const result: MetaCampaignCreative[] = allAds
      .filter((ad) => ad.id && ad.name)
      .map((ad) => {
        const spec = ad.creative?.object_story_spec;

        // thumbnail_url is the primary source for all creative types.
        // For video ads, also fall back to video_data.image_url (poster frame).
        const thumbnailUrl =
          ad.creative?.thumbnail_url ??
          spec?.video_data?.image_url ??
          "";

        const adsLibraryUrl = `https://www.facebook.com/ads/library/?id=${ad.id}`;
        const adLink =
          ad.preview_shareable_link ??
          spec?.link_data?.link ??
          adsLibraryUrl;

        return {
          adId:         ad.id,
          adName:       ad.name,
          campaignId:   ad.campaign_id,
          campaignName: ad.campaign?.name ?? ad.campaign_id ?? "",
          adsetName:    ad.adset_name ?? "",
          thumbnailUrl,
          previewUrl:   ad.preview_shareable_link ?? "",
          adLink,
          mediaType:    detectMediaType(ad),
        } satisfies MetaCampaignCreative;
      });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Falha ao conectar com Meta API." }, { status: 502 });
  }
}
