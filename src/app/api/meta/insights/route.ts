import { NextRequest, NextResponse } from "next/server";
import { fetchMetaInsightsServer } from "@/lib/metaSync";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sp          = request.nextUrl.searchParams;
  const accessToken = sp.get("accessToken");
  const adAccountId = sp.get("adAccountId");
  const dateFrom    = sp.get("dateFrom");
  const dateTo      = sp.get("dateTo");
  const campaignIds   = sp.get("campaignIds");                   // optional: comma-separated
  const level         = (sp.get("level") ?? "campaign") as "campaign" | "adset" | "ad";
  const timeIncrement = (sp.get("timeIncrement") ?? "1") as "1" | "all_days";

  if (!accessToken || !adAccountId || !dateFrom || !dateTo) {
    return NextResponse.json({ error: "Parâmetros obrigatórios ausentes." }, { status: 400 });
  }

  try {
    const data = await fetchMetaInsightsServer(adAccountId, accessToken, dateFrom, dateTo, {
      level,
      timeIncrement,
      campaignIds: campaignIds ? campaignIds.split(",") : undefined,
    });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao conectar com Meta API." },
      { status: 502 },
    );
  }
}
