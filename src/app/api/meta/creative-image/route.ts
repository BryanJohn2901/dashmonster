import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/trackingAuth";

import { META_API_VERSION } from "@/lib/meta";

/**
 * GET /api/meta/creative-image?creativeId=XXX&accessToken=YYY
 *
 * Fetches the AdCreative's image_url — the original-resolution image the
 * advertiser uploaded, not the low-res thumbnail_url (~64px) from the ads batch.
 *
 * Returns: { imageUrl: string | null }
 * - imageUrl: null for video ads (no static image_url at creative level)
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;
  const sp          = request.nextUrl.searchParams;
  const creativeId  = sp.get("creativeId");
  const accessToken = request.headers.get("x-meta-token");

  if (!creativeId || !accessToken) {
    return NextResponse.json(
      { error: "creativeId e accessToken são obrigatórios." },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${creativeId}?` +
        new URLSearchParams({ access_token: accessToken, fields: "image_url" }).toString(),
      { cache: "no-store" },
    );
    const json = await res.json() as {
      image_url?: string;
      error?:     { message?: string };
    };

    if (!res.ok || json.error) {
      return NextResponse.json(
        { error: json.error?.message ?? `Meta API error ${res.status}` },
        { status: 502 },
      );
    }

    return NextResponse.json({ imageUrl: json.image_url ?? null });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar com Meta API." }, { status: 502 });
  }
}
