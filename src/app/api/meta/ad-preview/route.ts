import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/trackingAuth";

const META_API_VERSION = "v21.0";

/**
 * GET /api/meta/ad-preview?adId=...&accessToken=...
 *
 * Fetches the official Meta ad preview iframe for MOBILE_FEED_STANDARD format.
 * Uses the /{ad-id}/previews edge — no special permissions required.
 * Returns: { iframeSrc: string, width: number, height: number }
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;
  const sp          = request.nextUrl.searchParams;
  const adId        = sp.get("adId");
  const accessToken = request.headers.get("x-meta-token");

  if (!adId || !accessToken) {
    return NextResponse.json({ error: "adId e accessToken são obrigatórios." }, { status: 400 });
  }

  const url =
    `https://graph.facebook.com/${META_API_VERSION}/${adId}/previews?` +
    new URLSearchParams({
      access_token: accessToken,
      ad_format:    "MOBILE_FEED_STANDARD",
    }).toString();

  try {
    const res  = await fetch(url, { cache: "no-store" });
    const json = await res.json() as {
      data?:  Array<{ body?: string; width?: number; height?: number }>;
      error?: { message?: string };
    };

    if (!res.ok || json.error) {
      return NextResponse.json(
        { error: json.error?.message ?? `Meta API error ${res.status}` },
        { status: 502 },
      );
    }

    const first = json.data?.[0];
    if (!first?.body) {
      return NextResponse.json({ error: "Nenhum preview disponível." }, { status: 404 });
    }

    // Extract iframe src from the HTML body string
    const match = first.body.match(/src="([^"]+)"/);
    const iframeSrc = match?.[1] ? match[1].replace(/&amp;/g, "&") : null;

    if (!iframeSrc) {
      return NextResponse.json({ error: "Não foi possível extrair o iframe." }, { status: 500 });
    }

    return NextResponse.json({
      iframeSrc,
      width:  first.width  ?? 476,
      height: first.height ?? 693,
    });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar com Meta API." }, { status: 502 });
  }
}
