import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchMetaInsightsServer } from "@/lib/metaSync";
import { metaInsightsToCampaignData } from "@/lib/metaTransform";
import type { CampaignData } from "@/types/campaign";

export const runtime = "nodejs";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET;

// Janela de re-sync: 7 dias cobrem atualizações de atribuição da Meta
// (conversões/receita chegam com atraso) sem puxar histórico inteiro toda hora.
const LOOKBACK_DAYS = 7;

interface CompanyRow {
  id: string;
  meta_access_token: string;
}

interface EntryRow {
  ad_account_id: string;
  selected_campaign_ids: string[] | null;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Sincroniza uma empresa: contas habilitadas → insights → upsert campaign_metrics. */
async function syncCompany(
  sb: ReturnType<typeof supabaseAdmin>,
  company: CompanyRow,
  dateFrom: string,
  dateTo: string,
): Promise<{ companyId: string; synced: number; accounts: number; error?: string }> {
  const { data: entries, error: entriesErr } = await sb
    .from("user_account_entries")
    .select("ad_account_id, selected_campaign_ids")
    .eq("company_id", company.id)
    .eq("is_enabled", true);

  if (entriesErr) return { companyId: company.id, synced: 0, accounts: 0, error: entriesErr.message };
  if (!entries || entries.length === 0) return { companyId: company.id, synced: 0, accounts: 0 };

  // Dedup de contas por (conta + filtro de campanhas)
  const seen = new Set<string>();
  const accountItems: Array<{ adAccountId: string; campaignIds?: string[] }> = [];
  for (const e of entries as EntryRow[]) {
    if (!e.ad_account_id) continue;
    const ids = (e.selected_campaign_ids ?? []).map(String).filter(Boolean);
    const key = `${e.ad_account_id}::${ids.slice().sort().join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    accountItems.push({ adAccountId: e.ad_account_id, campaignIds: ids.length ? ids : undefined });
  }

  // Coleta insights de todas as contas
  const all: CampaignData[] = [];
  for (const { adAccountId, campaignIds } of accountItems) {
    try {
      const rows = await fetchMetaInsightsServer(adAccountId, company.meta_access_token, dateFrom, dateTo, { campaignIds });
      all.push(...metaInsightsToCampaignData(rows, adAccountId));
    } catch (e) {
      // Uma conta com erro (token sem acesso, etc.) não derruba a empresa inteira
      console.warn(`[meta sync-all] empresa ${company.id} conta ${adAccountId}:`, e instanceof Error ? e.message : e);
    }
  }

  if (all.length === 0) return { companyId: company.id, synced: 0, accounts: accountItems.length };

  // Dedup por id, depois soma campanhas homônimas no mesmo (date, campaignName)
  const byId = new Map<string, CampaignData>();
  for (const c of all) if (!byId.has(c.id)) byId.set(c.id, c);

  const byKey = new Map<string, CampaignData>();
  for (const item of byId.values()) {
    const key = `${item.date}::${item.campaignName}`;
    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, { ...item }); continue; }
    prev.investment  += item.investment;
    prev.clicks      += item.clicks;
    prev.impressions += item.impressions;
    prev.conversions += item.conversions;
    prev.leads        = (prev.leads ?? 0) + (item.leads ?? 0);
    prev.pageViews    = (prev.pageViews ?? 0) + (item.pageViews ?? 0);
    prev.revenue     += item.revenue;
  }

  const payload = Array.from(byKey.values()).map((item) => ({
    date:          item.date,
    campaign_name: item.campaignName,
    investment:    item.investment,
    clicks:        item.clicks,
    impressions:   item.impressions,
    conversions:   item.conversions,
    leads:         item.leads ?? 0,
    page_views:    item.pageViews ?? 0,
    revenue:       item.revenue,
    source:        "meta" as const,
    company_id:    company.id,
  }));

  let { error } = await sb
    .from("campaign_metrics")
    .upsert(payload, { onConflict: "company_id,date,campaign_name,source" });

  // Fallback: migration 024 não rodou → unique antigo sem company_id
  if (error && /no unique|exclusion constraint/i.test(error.message)) {
    ({ error } = await sb
      .from("campaign_metrics")
      .upsert(payload, { onConflict: "date,campaign_name,source" }));
  }

  if (error) return { companyId: company.id, synced: 0, accounts: accountItems.length, error: error.message };
  return { companyId: company.id, synced: payload.length, accounts: accountItems.length };
}

/**
 * POST (ou GET) /api/meta/sync-all
 * Sincroniza os dados Meta Ads de todas as empresas com token configurado.
 * Disparado pela Vercel Cron. Protegido por CRON_SECRET (Authorization: Bearer).
 */
export async function POST(request: NextRequest) {
  // Fail-closed: só a Vercel Cron (que manda Authorization: Bearer <CRON_SECRET>).
  // Antes `if (auth && CRON_SECRET && ...)` DEIXAVA PASSAR sem header nenhum →
  // qualquer um disparava um sync completo (service_role em todas as empresas).
  const auth = request.headers.get("authorization");
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const sb = supabaseAdmin();

  const { data: companies, error: loadErr } = await sb
    .from("companies")
    .select("id, meta_access_token")
    .not("meta_access_token", "is", null);

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });

  const active = (companies as CompanyRow[] ?? []).filter(
    (c) => c.meta_access_token && c.meta_access_token.trim() !== "",
  );
  if (active.length === 0) {
    return NextResponse.json({ companies: 0, synced: 0, results: [] });
  }

  const now      = new Date();
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - LOOKBACK_DAYS);
  const dateFrom = ymd(fromDate);
  const dateTo   = ymd(now);

  const results = await Promise.all(active.map((c) => syncCompany(sb, c, dateFrom, dateTo)));

  const synced = results.reduce((acc, r) => acc + r.synced, 0);
  console.log(`[meta sync-all] empresas=${active.length} registros=${synced}`);

  return NextResponse.json({ companies: active.length, synced, dateFrom, dateTo, results });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
