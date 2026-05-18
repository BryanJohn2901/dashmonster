import { NextRequest, NextResponse } from "next/server";
import type { MetaCampaignCreative } from "@/utils/metaApi";

const META_API_VERSION = "v21.0";

interface MetaAdRaw {
  id: string;
  name: string;
  campaign_id: string;
  campaign?: { name: string };
  adset_id?: string;
  adset_name?: string;
  preview_shareable_link?: string;
  creative?: {
    thumbnail_url?: string;
    image_url?: string;
    object_story_spec?: {
      link_data?: {
        link?: string;
        child_attachments?: Array<{ image_url?: string }>;
      };
      video_data?: { image_url?: string };
    };
  };
}

function detectMediaType(ad: MetaAdRaw): MetaCampaignCreative["mediaType"] {
  const spec = ad.creative?.object_story_spec;
  if (spec?.video_data) return "video";
  if ((spec?.link_data?.child_attachments?.length ?? 0) > 0) return "carousel";
  if (ad.creative?.thumbnail_url || ad.creative?.image_url) return "image";
  return "unknown";
}

/**
 * GET /api/meta/creatives?accessToken=EAAx...&adAccountId=act_123
 *
 * Returns ALL active/paused/archived ads with thumbnail, preview link, media type.
 * Each ad is an individual entry (no grouping by campaign).
 *
 * Note: `picture` field is intentionally omitted — it requires special permissions
 * and throws error #100 on most accounts. Use thumbnail_url / image_url instead.
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
      access_token:     accessToken,
      fields: [
        "name",
        "campaign_id",
        "campaign{name}",
        "adset_id",
        "adset_name",
        "preview_shareable_link",
        "creative{thumbnail_url,image_url,object_story_spec{link_data{link,child_attachments{image_url}},video_data{image_url}}}",
      ].join(","),
      effective_status: JSON.stringify(["ACTIVE", "PAUSED", "ARCHIVED"]),
      limit:            "200",
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
        const carouselImage = spec?.link_data?.child_attachments?.[0]?.image_url;
        const thumbnailUrl =
          ad.creative?.thumbnail_url ??
          ad.creative?.image_url ??
          spec?.video_data?.image_url ??
          carouselImage ??
          "";

        const adsLibraryUrl = `https://www.facebook.com/ads/library/?id=${ad.id}`;
        const previewUrl = ad.preview_shareable_link ?? "";
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
          previewUrl,
          adLink,
          mediaType:    detectMediaType(ad),
        } satisfies MetaCampaignCreative;
      });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Falha ao conectar com Meta API." }, { status: 502 });
  }
}
