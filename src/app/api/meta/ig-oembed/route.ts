import { NextRequest, NextResponse } from "next/server";

const META_API_VERSION = "v21.0";

/**
 * GET /api/meta/ig-oembed?url=IG_URL&accessToken=TOKEN
 *
 * Wraps graph.facebook.com instagram_oembed endpoint.
 * Returns { thumbnailUrl?: string } — higher-res thumbnail (~640px) for
 * Instagram posts compared to Meta Ads thumbnail_url (~256px).
 *
 * Token: existing Meta Ads user access token works — no extra scope needed.
 */
export async function GET(request: NextRequest) {
  const sp          = request.nextUrl.searchParams;
  const url         = sp.get("url");
  const accessToken = sp.get("accessToken");

  if (!url || !accessToken) {
    return NextResponse.json({ error: "url e accessToken são obrigatórios." }, { status: 400 });
  }

  try {
    const apiUrl = `https://graph.facebook.com/${META_API_VERSION}/instagram_oembed?` +
      new URLSearchParams({
        url,
        access_token: accessToken,
        fields: "thumbnail_url,author_name,title",
      }).toString();

    const res  = await fetch(apiUrl, { cache: "no-store" });
    const json = await res.json() as {
      thumbnail_url?: string;
      author_name?:   string;
      title?:         string;
      error?:         { message?: string };
    };

    if (!res.ok || json.error) {
      return NextResponse.json(
        { error: json.error?.message ?? `oEmbed API error ${res.status}` },
        { status: 502 },
      );
    }

    return NextResponse.json({ thumbnailUrl: json.thumbnail_url ?? null });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar com Meta oEmbed API." }, { status: 502 });
  }
}
