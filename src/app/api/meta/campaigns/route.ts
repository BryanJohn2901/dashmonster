import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/trackingAuth";

const META_API_VERSION = "v21.0";

export interface MetaCampaign {
  id: string;
  name: string;
  status: string;        // ACTIVE | PAUSED | DELETED | ARCHIVED
  objective: string;     // e.g. OUTCOME_SALES, OUTCOME_LEADS, LINK_CLICKS
  created_time: string;  // ISO 8601
}

/**
 * GET /api/meta/campaigns?accessToken=EAAxxxx&adAccountId=act_123456789
 *
 * Returns ALL campaigns (ACTIVE + PAUSED) for the given ad account,
 * following pagination cursors.
 *
 * Equivalent to:
 *   GET /{act_id}/campaigns?fields=id,name,status,objective,created_time
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;
  const sp          = request.nextUrl.searchParams;
  const accessToken = request.headers.get("x-meta-token");
  const adAccountId = sp.get("adAccountId");

  if (!accessToken || !adAccountId) {
    return NextResponse.json(
      { error: "accessToken e adAccountId são obrigatórios." },
      { status: 400 },
    );
  }

  // Strip act_ prefix — we construct the URL with it explicitly
  const accountId = adAccountId.replace(/^act_/, "");

  const allCampaigns: MetaCampaign[] = [];
  let nextUrl: string | null =
    `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/campaigns?` +
    new URLSearchParams({
      access_token:     accessToken,
      fields:           "id,name,status,objective,created_time",
      effective_status: JSON.stringify(["ACTIVE", "PAUSED"]),
      limit:            "200",
    }).toString();

  while (nextUrl) {
    const res  = await fetch(nextUrl, { cache: "no-store" });
    const json = await res.json() as {
      data?:   MetaCampaign[];
      paging?: { next?: string };
      error?:  { message?: string; code?: number };
    };

    if (!res.ok || json.error) {
      const msg = json.error?.message ?? `Meta API error ${res.status}`;
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    allCampaigns.push(...(json.data ?? []));
    nextUrl = json.paging?.next ?? null;
  }

  // Sort: ACTIVE first, then alphabetically
  allCampaigns.sort((a, b) => {
    if (a.status !== b.status) {
      if (a.status === "ACTIVE") return -1;
      if (b.status === "ACTIVE") return 1;
    }
    return a.name.localeCompare(b.name, "pt-BR");
  });

  return NextResponse.json(allCampaigns);
}
