import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/trackingAuth";

const META_API_VERSION = "v21.0";

export interface PixelEventTotal {
  name: string;
  total: number;
}

export interface PixelFunnelResponse {
  funnel: {
    pageView: number;
    lead: number;
    initiateCheckout: number;
    addPaymentInfo: number;
    purchase: number;
  };
  events: PixelEventTotal[];
}

// Meta returns pixel events under multiple action_type aliases — pick the highest value.
function pickAction(actions: Record<string, number>, ...keys: string[]): number {
  return Math.max(0, ...keys.map((k) => actions[k] ?? 0));
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;
  const sp          = request.nextUrl.searchParams;
  const adAccountId = sp.get("adAccountId");
  const accessToken = request.headers.get("x-meta-token");
  const dateFrom    = sp.get("dateFrom");
  const dateTo      = sp.get("dateTo");

  if (!adAccountId || !accessToken || !dateFrom || !dateTo) {
    return NextResponse.json({ error: "Parâmetros obrigatórios ausentes." }, { status: 400 });
  }

  const accountId = adAccountId.replace(/^act_/, "");

  const params = new URLSearchParams({
    access_token: accessToken,
    fields:       "actions",
    level:        "account",
    time_range:   JSON.stringify({ since: dateFrom, until: dateTo }),
  });

  const url = `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/insights?${params}`;

  try {
    const res  = await fetch(url, { cache: "no-store" });
    const json = await res.json() as {
      data?:  Array<{ actions?: Array<{ action_type: string; value: string }> }>;
      error?: { message?: string };
    };

    if (!res.ok || json.error) {
      return NextResponse.json(
        { error: json.error?.message ?? `Meta API error ${res.status}` },
        { status: 502 },
      );
    }

    // Aggregate all action_type values across rows into a flat map
    const totals: Record<string, number> = {};
    for (const row of json.data ?? []) {
      for (const action of row.actions ?? []) {
        const v = parseFloat(action.value) || 0;
        totals[action.action_type] = (totals[action.action_type] ?? 0) + v;
      }
    }

    const events: PixelEventTotal[] = Object.entries(totals)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);

    const response: PixelFunnelResponse = {
      funnel: {
        pageView:         pickAction(totals, "page_view", "offsite_conversion.fb_pixel_page_view"),
        lead:             pickAction(totals, "lead", "offsite_conversion.fb_pixel_lead"),
        initiateCheckout: pickAction(totals, "initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"),
        addPaymentInfo:   pickAction(totals, "add_payment_info", "offsite_conversion.fb_pixel_add_payment_info"),
        purchase:         pickAction(totals, "purchase", "offsite_conversion.fb_pixel_purchase"),
      },
      events,
    };

    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: "Falha ao conectar com Meta API." }, { status: 502 });
  }
}
