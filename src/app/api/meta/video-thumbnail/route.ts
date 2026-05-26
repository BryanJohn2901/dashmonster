import { NextRequest, NextResponse } from "next/server";

const META_API_VERSION = "v21.0";

/**
 * GET /api/meta/video-thumbnail?videoId=XXX&accessToken=YYY
 *
 * Fetches the poster frame (cover image) of a Meta video ad.
 * Uses /{videoId}?fields=picture — returns the video thumbnail at a usable resolution
 * (~640px), unlike thumbnail_url on the AdCreative which returns ~64px.
 *
 * Returns: { thumbnailUrl: string | null }
 */
export async function GET(request: NextRequest) {
  const sp          = request.nextUrl.searchParams;
  const videoId     = sp.get("videoId");
  const accessToken = sp.get("accessToken");

  if (!videoId || !accessToken) {
    return NextResponse.json(
      { error: "videoId e accessToken são obrigatórios." },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${videoId}?` +
        new URLSearchParams({ access_token: accessToken, fields: "picture" }).toString(),
      { cache: "no-store" },
    );
    const json = await res.json() as {
      picture?: string;
      error?:   { message?: string };
    };

    if (!res.ok || json.error) {
      return NextResponse.json(
        { error: json.error?.message ?? `Meta API error ${res.status}` },
        { status: 502 },
      );
    }

    return NextResponse.json({ thumbnailUrl: json.picture ?? null });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar com Meta API." }, { status: 502 });
  }
}
