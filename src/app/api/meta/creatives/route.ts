import { NextRequest, NextResponse } from "next/server";
import type { MetaCampaignCreative } from "@/utils/metaApi";

const META_API_VERSION = "v21.0";

interface MetaAdRaw {
  id: string;
  name: string;
  campaign_id: string;
  campaign?: { name: string };
  adset?: { name: string };
  preview_shareable_link?: string;
  creative?: {
    thumbnail_url?: string;
    image_url?: string;
    picture?: string;
    instagram_permalink_url?: string;
    effective_instagram_story_url?: string;
    object_story_spec?: {
      link_data?: {
        link?: string;
        picture?: string;
        child_attachments?: Array<{ picture?: string; image_url?: string }>;
      };
      video_data?: { call_to_action?: { value?: { link?: string } }; image_url?: string };
    };
  };
}

function detectMediaType(ad: MetaAdRaw): MetaCampaignCreative["mediaType"] {
  const spec = ad.creative?.object_story_spec;
  if (spec?.video_data) return "video";
  if ((spec?.link_data?.child_attachments?.length ?? 0) > 0) return "carousel";
  if (ad.creative?.thumbnail_url || ad.creative?.image_url || ad.creative?.picture) return "image";
  return "unknown";
}

/**
 * GET /api/meta/creatives?accessToken=EAAx...&adAccountId=act_123
 *
 * Returns ALL active/paused ads with thumbnail, preview link, media type.
 * Each ad is an individual entry (no grouping by campaign).
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
        "adset{name}",
        "preview_shareable_link",
        "creative{thumbnail_url,image_url,picture,instagram_permalink_url,effective_instagram_story_url,object_story_spec{link_data{link,picture,child_attachments{picture,image_url}},video_data{image_url,call_to_action{value{link}}}}}",
      ].join(","),
      effective_status: JSON.stringify(["ACTIVE", "PAUSED"]),
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
      .filter((ad) => ad.campaign?.name)
      .map((ad) => {
        const spec = ad.creative?.object_story_spec;
        const carouselPicture =
          spec?.link_data?.child_attachments?.[0]?.picture ??
          spec?.link_data?.child_attachments?.[0]?.image_url;
        const thumbnailUrl =
          ad.creative?.thumbnail_url ??
          ad.creative?.picture ??
          ad.creative?.image_url ??
          spec?.video_data?.image_url ??
          spec?.link_data?.picture ??
          carouselPicture ??
          "";

        const adsLibraryUrl = `https://www.facebook.com/ads/library/?id=${ad.id}`;
        const previewUrl = ad.preview_shareable_link ?? "";
        const adLink =
          ad.preview_shareable_link ??
          ad.creative?.instagram_permalink_url ??
          ad.creative?.effective_instagram_story_url ??
          spec?.link_data?.link ??
          spec?.video_data?.call_to_action?.value?.link ??
          adsLibraryUrl;

        return {
          adId:         ad.id,
          adName:       ad.name,
          campaignId:   ad.campaign_id,
          campaignName: ad.campaign?.name ?? "",
          adsetName:    ad.adset?.name ?? "",
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
