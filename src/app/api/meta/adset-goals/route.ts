import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/trackingAuth";

const META_API_VERSION = "v21.0";

// promoted_object da Meta — descreve o evento que a campanha otimiza.
interface PromotedObject {
  pixel_id?: string;
  custom_event_type?: string;  // PURCHASE | LEAD | COMPLETE_REGISTRATION | OTHER | ...
  custom_event_str?: string;   // nome do evento custom quando custom_event_type = OTHER
  custom_conversion_id?: string;
}

interface AdsetGoalRaw {
  id: string;
  campaign_id: string;
  optimization_goal?: string;
  promoted_object?: PromotedObject;
  effective_status?: string;
}

// Resposta: objetivo resolvido por campanha (representante = conjunto ACTIVE quando houver).
export interface CampaignGoalDTO {
  optimizationGoal?: string;
  customEventType?: string;
  customEventStr?: string;
}

/**
 * GET /api/meta/adset-goals?accessToken=...&adAccountId=act_123&campaignIds=1,2,3
 *
 * Devolve { [campaignId]: { optimizationGoal, customEventType, customEventStr } } —
 * o objetivo REAL de cada campanha (optimization_goal + promoted_object dos conjuntos).
 * É a fonte da verdade pra contar o "Resultado" igual à coluna Resultados da Meta.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;
  const sp          = request.nextUrl.searchParams;
  const accessToken = request.headers.get("x-meta-token");
  const adAccountId = sp.get("adAccountId");
  const campaignIds = sp.get("campaignIds"); // opcional, CSV

  if (!accessToken || !adAccountId) {
    return NextResponse.json({ error: "accessToken e adAccountId são obrigatórios." }, { status: 400 });
  }

  const accountId = adAccountId.replace(/^act_/, "");
  const params = new URLSearchParams({
    access_token:     accessToken,
    fields:           "id,campaign_id,optimization_goal,promoted_object,effective_status",
    effective_status: JSON.stringify(["ACTIVE", "PAUSED"]),
    limit:            "500",
  });
  if (campaignIds) {
    const ids = campaignIds.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length > 0) {
      params.set("filtering", JSON.stringify([{ field: "campaign.id", operator: "IN", value: ids }]));
    }
  }

  const adsets: AdsetGoalRaw[] = [];
  let nextUrl: string | null =
    `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/adsets?${params.toString()}`;

  while (nextUrl) {
    const res  = await fetch(nextUrl, { cache: "no-store" });
    const json = await res.json() as {
      data?: AdsetGoalRaw[];
      paging?: { next?: string };
      error?: { message?: string };
    };
    if (!res.ok || json.error) {
      return NextResponse.json({ error: json.error?.message ?? `Meta API error ${res.status}` }, { status: 502 });
    }
    adsets.push(...(json.data ?? []));
    nextUrl = json.paging?.next ?? null;
  }

  // Reduz pra 1 objetivo por campanha. Prefere conjunto ACTIVE; senão o primeiro visto.
  const byCampaign: Record<string, CampaignGoalDTO> = {};
  const chosenActive: Record<string, boolean> = {};
  for (const a of adsets) {
    if (!a.campaign_id) continue;
    const isActive = a.effective_status === "ACTIVE";
    if (byCampaign[a.campaign_id] && (chosenActive[a.campaign_id] || !isActive)) continue;
    byCampaign[a.campaign_id] = {
      optimizationGoal: a.optimization_goal,
      customEventType:  a.promoted_object?.custom_event_type,
      customEventStr:   a.promoted_object?.custom_event_str,
    };
    chosenActive[a.campaign_id] = isActive;
  }

  return NextResponse.json(byCampaign);
}
