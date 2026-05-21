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
 *  - instagram_permalink_url : Instagram post URL (present when ad ran on Instagram)
 *
 * Fields intentionally OMITTED (cause #100 on most accounts):
 *  - creative.image_url          (not a top-level creative field)
 *  - creative.picture            (requires special permission)
 *  - effective_instagram_story_url (requires Instagram permission)
 *  - call_to_action.value.link   (restricted)
 *  - child_attachments.picture   (requires special permission)
 *  - child_attachments{id}       (id is NOT a valid subfield — causes #100)
 */

interface MetaAdRaw {
  id: string;
  name: string;
  campaign_id: string;
  campaign?: { name: string };
  adset_name?: string;
  preview_shareable_link?: string;
  created_time?: string;
  creative?: {
    id?: string;
    thumbnail_url?: string;
    video_id?: string;                          // present on video ads
    instagram_permalink_url?: string;           // Instagram post permalink (if available)
    object_story_spec?: {
      link_data?: {
        link?:              string;
        message?:           string;
        name?:              string;
        description?:       string;
        child_attachments?: Array<Record<string, unknown>>; // carousel slides — no {id} subfield (causes #100)
      };
      video_data?: {
        image_url?: string;
        message?:   string;
        title?:     string;
      };
    };
  };
}

function detectMediaType(ad: MetaAdRaw): MetaCampaignCreative["mediaType"] {
  const spec = ad.creative?.object_story_spec;
  if (spec?.link_data?.child_attachments && spec.link_data.child_attachments.length > 0) return "carousel";
  if (spec?.video_data || ad.creative?.video_id) return "video";
  if (ad.creative?.thumbnail_url) return "image";
  return "unknown";
}

/**
 * GET /api/meta/creatives?accessToken=EAAx...&adAccountId=act_123
 *
 * Returns ALL active/paused ads with thumbnail, preview link, media type.
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
        "created_time",
        "creative{id,thumbnail_url,video_id,instagram_permalink_url,object_story_spec{link_data{link,message,name,description,child_attachments},video_data{image_url,message,title}}}",
      ].join(","),
      effective_status: JSON.stringify(["ACTIVE", "PAUSED"]),
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

        const thumbnailUrl =
          ad.creative?.thumbnail_url ??
          spec?.video_data?.image_url ??
          "";

        const adsLibraryUrl = `https://www.facebook.com/ads/library/?id=${ad.id}`;
        const adLink =
          ad.preview_shareable_link ??
          spec?.link_data?.link ??
          adsLibraryUrl;

        const body =
          spec?.link_data?.message ??
          spec?.video_data?.message ??
          undefined;

        const headline =
          spec?.link_data?.name ??
          spec?.video_data?.title ??
          undefined;

        return {
          adId:         ad.id,
          adName:       ad.name,
          campaignId:   ad.campaign_id,
          campaignName: ad.campaign?.name ?? ad.campaign_id ?? "",
          adsetName:    ad.adset_name ?? "",
          thumbnailUrl,
          previewUrl:   ad.preview_shareable_link ?? "",
          adLink,
          instagramUrl: ad.creative?.instagram_permalink_url ?? undefined,
          mediaType:    detectMediaType(ad),
          createdTime:  ad.created_time,
          body,
          headline,
        } satisfies MetaCampaignCreative;
      });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Falha ao conectar com Meta API." }, { status: 502 });
  }
}
