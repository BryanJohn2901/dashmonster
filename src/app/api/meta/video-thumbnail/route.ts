import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/trackingAuth";

const META_API_VERSION = "v21.0";

/**
 * GET /api/meta/video-thumbnail?videoId=XXX&accessToken=YYY
 *
 * Fetches the poster frame (cover image) of a Meta video ad.
 * Uses /{videoId}?fields=thumbnails,picture and picks the highest-resolution thumbnail.
 * Falls back to `picture` when the thumbnails list is unavailable.
 *
 * Returns: { thumbnailUrl: string | null }
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;
  const sp          = request.nextUrl.searchParams;
  const videoId     = sp.get("videoId");
  const accessToken = request.headers.get("x-meta-token");

  if (!videoId || !accessToken) {
    return NextResponse.json(
      { error: "videoId e accessToken são obrigatórios." },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${videoId}?` +
        new URLSearchParams({ access_token: accessToken, fields: "thumbnails,picture" }).toString(),
      { cache: "no-store" },
    );
    const json = await res.json() as {
      thumbnails?: { data?: Array<{ uri?: string; width?: number; height?: number }> };
      picture?: string;
      error?:   { message?: string };
    };

    if (!res.ok || json.error) {
      return NextResponse.json(
        { error: json.error?.message ?? `Meta API error ${res.status}` },
        { status: 502 },
      );
    }

    const bestThumb =
      json.thumbnails?.data
        ?.filter((t) => Boolean(t.uri))
        .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.uri
      ?? json.picture
      ?? null;

    return NextResponse.json({ thumbnailUrl: bestThumb });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar com Meta API." }, { status: 502 });
  }
}
