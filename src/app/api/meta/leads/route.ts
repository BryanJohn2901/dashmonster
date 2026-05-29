import { NextRequest, NextResponse } from "next/server";

const META_API_VERSION = "v21.0";
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

interface RawLead {
  id: string;
  created_time: string;
  field_data: Array<{ name: string; values: string[] }>;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
}

export interface MetaLeadRow {
  id: string;
  createdTime: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  campaignId: string;
  campaignName: string;
  adsetName: string;
  rawFields: Record<string, string>;
}

function parseLead(raw: RawLead, fallbackCampaignId: string): MetaLeadRow {
  const fields: Record<string, string> = {};
  for (const { name, values } of raw.field_data ?? []) {
    fields[name] = values[0] ?? "";
  }
  return {
    id:           raw.id,
    createdTime:  raw.created_time,
    fullName:     fields.full_name ?? fields.name ?? null,
    email:        fields.email ?? null,
    phone:        fields.phone_number ?? fields.phone ?? null,
    campaignId:   raw.campaign_id ?? fallbackCampaignId,
    campaignName: raw.campaign_name ?? "",
    adsetName:    raw.adset_name ?? "",
    rawFields:    fields,
  };
}

export async function GET(req: NextRequest) {
  const sp           = req.nextUrl.searchParams;
  const accessToken  = sp.get("accessToken");
  const campaignIds  = sp.get("campaignIds");
  const dateFrom     = sp.get("dateFrom");
  const dateTo       = sp.get("dateTo");

  if (!accessToken || !campaignIds) {
    return NextResponse.json({ error: "accessToken e campaignIds são obrigatórios." }, { status: 400 });
  }

  const ids = campaignIds.split(",").map((s) => s.trim()).filter(Boolean);

  const filtering: Record<string, unknown>[] = [];
  if (dateFrom) {
    filtering.push({
      field:    "time_created",
      operator: "GREATER_THAN",
      value:    Math.floor(new Date(dateFrom + "T00:00:00").getTime() / 1000),
    });
  }
  if (dateTo) {
    filtering.push({
      field:    "time_created",
      operator: "LESS_THAN",
      value:    Math.floor(new Date(dateTo + "T23:59:59").getTime() / 1000),
    });
  }

  const allLeads: MetaLeadRow[] = [];
  const errors: string[] = [];

  await Promise.all(
    ids.map(async (campaignId) => {
      try {
        const params = new URLSearchParams({
          access_token: accessToken,
          fields:       "id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name",
          limit:        "1000",
        });
        if (filtering.length > 0) {
          params.set("filtering", JSON.stringify(filtering));
        }

        const res  = await fetch(`${META_BASE}/${campaignId}/leads?${params}`);
        const json = (await res.json()) as { data?: RawLead[]; error?: { message: string } };

        if (json.error) {
          errors.push(`${campaignId}: ${json.error.message}`);
          return;
        }

        allLeads.push(...(json.data ?? []).map((l) => parseLead(l, campaignId)));
      } catch (e) {
        errors.push(`${campaignId}: ${e instanceof Error ? e.message : "Erro desconhecido"}`);
      }
    }),
  );

  allLeads.sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());

  return NextResponse.json({
    leads:  allLeads,
    total:  allLeads.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
