import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/trackingAuth";

const META_API_VERSION = "v21.0";

export interface MetaAdAccount {
  id: string;
  name: string;
  account_status: number; // 1 = active
  currency: string;
}

/**
 * GET /api/meta/accounts?accessToken=EAAxxxx
 * Returns ALL ad accounts accessible by the token, following pagination cursors.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  const accessToken = request.headers.get("x-meta-token");

  if (!accessToken) {
    return NextResponse.json({ error: "accessToken é obrigatório." }, { status: 400 });
  }

  const allAccounts: MetaAdAccount[] = [];
  let nextUrl: string | null = `https://graph.facebook.com/${META_API_VERSION}/me/adaccounts?${new URLSearchParams({
    access_token: accessToken,
    fields: "id,name,account_status,currency",
    limit: "200",
  })}`;

  // Follow pagination cursors until all pages are fetched
  while (nextUrl) {
    const res  = await fetch(nextUrl);
    const json = await res.json() as {
      data?:   MetaAdAccount[];
      paging?: { cursors?: { after?: string }; next?: string };
      error?:  { message?: string; code?: number };
    };

    if (!res.ok || json.error) {
      const msg = json.error?.message ?? `Meta API error ${res.status}`;
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    allAccounts.push(...(json.data ?? []));

    // Continue only if Meta provides a next page URL
    nextUrl = json.paging?.next ?? null;
  }

  // Sort: active first, then alphabetically
  allAccounts.sort((a, b) => {
    if (a.account_status !== b.account_status) return b.account_status - a.account_status;
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json(allAccounts);
}
