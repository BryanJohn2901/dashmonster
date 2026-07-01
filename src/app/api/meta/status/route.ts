import { NextRequest, NextResponse } from "next/server";

const META_API_VERSION = "v21.0";

export interface MetaEntityStatus {
  id:               string;
  name:             string;
  status:           string; // ACTIVE | PAUSED | DELETED | ARCHIVED  (toggle próprio)
  effective_status: string; // Estado real considerando hierarquia pai → filho:
                            // ACTIVE | PAUSED | CAMPAIGN_PAUSED | ADSET_PAUSED |
                            // DISAPPROVED | PENDING_REVIEW | WITH_ISSUES | …
}

/**
 * GET /api/meta/status?accessToken=EAAxxx&adAccountId=act_123&level=adset|ad[&campaignIds=1,2,3]
 *
 * Retorna status E effective_status de conjuntos de anúncio ou anúncios.
 * effective_status já propaga a pausa do pai (CAMPAIGN_PAUSED, ADSET_PAUSED)
 * — é o campo que o Gerenciador de Anúncios usa pra indicar se algo está realmente
 * ativo ou pausado, independente de quem iniciou a pausa.
 */
export async function GET(request: NextRequest) {
  const sp              = request.nextUrl.searchParams;
  const accessToken     = sp.get("accessToken");
  const adAccountId     = sp.get("adAccountId");
  const level           = sp.get("level");
  const campaignIdsParam = sp.get("campaignIds");

  if (!accessToken || !adAccountId || (level !== "adset" && level !== "ad")) {
    return NextResponse.json(
      { error: "accessToken, adAccountId e level (adset|ad) são obrigatórios." },
      { status: 400 },
    );
  }

  const accountId = adAccountId.replace(/^act_/, "");
  const edge       = level === "adset" ? "adsets" : "ads";

  // Inclui ADSET_PAUSED/CAMPAIGN_PAUSED no filtro para que anúncios pausados pelo
  // pai também sejam retornados — sem isso a Meta omite essas entidades da resposta.
  const effectiveStatusFilter = level === "adset"
    ? ["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED"]
    : ["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"];

  const params: Record<string, string> = {
    access_token:     accessToken,
    fields:           "id,name,status,effective_status",
    effective_status: JSON.stringify(effectiveStatusFilter),
    limit:            "500",
  };
  const ids = campaignIdsParam ? campaignIdsParam.split(",").filter(Boolean) : [];
  if (ids.length > 0) {
    params.filtering = JSON.stringify([{ field: "campaign.id", operator: "IN", value: ids }]);
  }

  const allItems: MetaEntityStatus[] = [];
  let nextUrl: string | null =
    `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/${edge}?` +
    new URLSearchParams(params).toString();

  while (nextUrl) {
    const res  = await fetch(nextUrl, { cache: "no-store" });
    const json = await res.json() as {
      data?:   MetaEntityStatus[];
      paging?: { next?: string };
      error?:  { message?: string };
    };

    if (!res.ok || json.error) {
      const msg = json.error?.message ?? `Meta API error ${res.status}`;
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    allItems.push(...(json.data ?? []));
    nextUrl = json.paging?.next ?? null;
  }

  return NextResponse.json(allItems);
}
