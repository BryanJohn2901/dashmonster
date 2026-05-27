import { NextRequest, NextResponse } from "next/server";

const META_API_VERSION = "v21.0";

/**
 * GET /api/meta/video-source?videoId=XXX&accessToken=YYY
 *
 * Returns the native .mp4 CDN URL and poster thumbnail for a Meta video.
 * `source` is a signed CDN URL valid ~24h — playable in a <video> element.
 * `picture` is a poster frame (~640px).
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
        new URLSearchParams({ access_token: accessToken, fields: "source,picture" }).toString(),
      { cache: "no-store" },
    );
    const json = await res.json() as {
      source?:  string;
      picture?: string;
      error?:   { message?: string };
    };

    if (!res.ok || json.error) {
      return NextResponse.json(
        { error: json.error?.message ?? `Meta API error ${res.status}` },
        { status: 502 },
      );
    }

    return NextResponse.json({
      videoSrc:     json.source  ?? null,
      thumbnailUrl: json.picture ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar com Meta API." }, { status: 502 });
  }
}
