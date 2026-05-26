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
  campaign?: { name: string; start_time?: string };
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
/**
 * GET /api/meta/creatives?accessToken=EAAx...&adAccountId=act_123[&cursor=ENCODED_URL]
 *
 * Retorna UMA página (200 anúncios) por chamada para possibilitar carregamento
 * progressivo no cliente — o usuário vê os primeiros criativos em ~3 segundos
 * em vez de esperar 2 min pelo loop completo de 14+ páginas.
 *
 * Resposta: { data: MetaCampaignCreative[]; nextCursor?: string }
 * - nextCursor: URL da próxima página da Meta API (já encodada em base64)
 *              Ausente quando não há mais páginas.
 */
export async function GET(request: NextRequest) {
  const sp          = request.nextUrl.searchParams;
  const accessToken = sp.get("accessToken");
  const adAccountId = sp.get("adAccountId");
  const cursorB64   = sp.get("cursor");   // base64-encoded next-page URL from Meta

  if (!accessToken || !adAccountId) {
    return NextResponse.json(
      { error: "accessToken e adAccountId são obrigatórios." },
      { status: 400 },
    );
  }

  // Build the URL for the first page OR decode the cursor for subsequent pages.
  const accountId = adAccountId.replace(/^act_/, "");
  const pageUrl: string = cursorB64
    ? Buffer.from(cursorB64, "base64").toString("utf-8")
    : `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/ads?` +
      new URLSearchParams({
        access_token: accessToken,
        fields: [
          "name",
          "campaign_id",
          "campaign{name,start_time}",
          "adset_name",
          "preview_shareable_link",
          "created_time",
          "creative{id,thumbnail_url,video_id,instagram_permalink_url,object_story_spec{link_data{link,message,name,description,child_attachments},video_data{image_url,message,title}}}",
        ].join(","),
        effective_status: JSON.stringify(["ACTIVE", "PAUSED"]),
        limit: "200",
      }).toString();

  try {
    const res  = await fetch(pageUrl, { cache: "no-store" });
    const json = await res.json() as {
      data?:   MetaAdRaw[];
      paging?: { next?: string };
      error?:  { message?: string };
    };

    if (!res.ok || json.error) {
      const msg = json.error?.message ?? `Meta API error ${res.status}`;
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const rawAds = json.data ?? [];
    const result: MetaCampaignCreative[] = rawAds
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
          createdTime:        ad.created_time,
          campaignStartTime:  ad.campaign?.start_time ?? undefined,
          body,
          headline,
          creativeId:         ad.creative?.id ?? undefined,
        } satisfies MetaCampaignCreative;
      });

    // Encode next-page URL in base64 so it's safe to pass as a query param.
    const nextRaw    = json.paging?.next;
    const nextCursor = nextRaw ? Buffer.from(nextRaw, "utf-8").toString("base64") : undefined;

    return NextResponse.json({ data: result, ...(nextCursor ? { nextCursor } : {}) });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar com Meta API." }, { status: 502 });
  }
}
