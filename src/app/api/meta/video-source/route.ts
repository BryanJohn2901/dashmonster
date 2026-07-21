import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/trackingAuth";

import { META_API_VERSION } from "@/lib/meta";

/**
 * GET /api/meta/video-source?videoId=XXX&accessToken=YYY
 *
 * Returns the native .mp4 CDN URL and best poster thumbnail for a Meta video.
 * `source` is a signed CDN URL valid ~24h — playable in a <video> element.
 * `thumbnails` may include larger frames; fallback to `picture`.
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
        new URLSearchParams({ access_token: accessToken, fields: "source,thumbnails,picture" }).toString(),
      { cache: "no-store" },
    );
    const json = await res.json() as {
      source?:  string;
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

    return NextResponse.json({
      videoSrc:     json.source  ?? null,
      thumbnailUrl: bestThumb,
    });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar com Meta API." }, { status: 502 });
  }
}
