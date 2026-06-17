import { RealtimeChannel } from "@supabase/supabase-js";
import { CampaignData, SourceChannel } from "@/types/campaign";
import { supabaseClient } from "@/lib/supabase";
import { getCompanyContext } from "@/hooks/useCompany";
import { calculateDerivedMetrics } from "@/utils/metrics";

interface SupabaseCampaignRow {
  id: string;
  date: string;
  campaign_name: string;
  investment: number;
  clicks: number;
  impressions: number;
  conversions: number;
  leads: number;
  page_views: number;
  revenue: number;
  source: SourceChannel;
}

export interface SharedDataSource {
  type: SourceChannel;
  label: string;
}

const mapSupabaseRow = (row: SupabaseCampaignRow, index: number): CampaignData => {
  return calculateDerivedMetrics(
    {
      date: row.date,
      campaignName: row.campaign_name,
      investment: Number(row.investment ?? 0),
      clicks: Number(row.clicks ?? 0),
      impressions: Number(row.impressions ?? 0),
      conversions: Number(row.conversions ?? 0),
      leads: Number(row.leads ?? 0),
      pageViews: Number(row.page_views ?? 0),
      revenue: Number(row.revenue ?? 0),
      // Proveniência da linha — dirige a quebra por canal no overview
      // (origem derivada de `source` via DEFAULT_ORIGIN_BY_SOURCE).
      source: (row.source ?? "meta") as SourceChannel,
    },
    index,
  );
};

const SELECT_FULL =
  "id, date, campaign_name, investment, clicks, impressions, conversions, leads, page_views, revenue, source";
const SELECT_WITH_LEADS =
  "id, date, campaign_name, investment, clicks, impressions, conversions, leads, revenue, source";
const SELECT_LEGACY =
  "id, date, campaign_name, investment, clicks, impressions, conversions, revenue, source";

export const LEADS_MIGRATION_FILE = "013_campaign_metrics_leads.sql";
export const PAGE_VIEWS_MIGRATION_FILE = "020_campaign_metrics_page_views.sql";

function isMissingLeadsColumnError(message: string): boolean {
  return /leads/i.test(message) && /(column|schema|does not exist|PGRST204)/i.test(message);
}
function isMissingPageViewsColumnError(message: string): boolean {
  return /page_views/i.test(message) && /(column|schema|does not exist|PGRST204)/i.test(message);
}

export interface FetchCampaignsResult {
  campaigns: CampaignData[];
  /** false quando a coluna `leads` ainda não existe (migration 013 pendente). */
  hasLeadsColumn: boolean;
}

export const fetchSupabaseCampaigns = async (): Promise<FetchCampaignsResult> => {
  if (!supabaseClient) {
    throw new Error("Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  // 1) Tenta com todas as colunas (leads + page_views).
  const full = await supabaseClient
    .from("campaign_metrics")
    .select(SELECT_FULL)
    .order("date", { ascending: true });

  if (!full.error) {
    return {
      campaigns: (full.data ?? []).map((row, index) => mapSupabaseRow(row as SupabaseCampaignRow, index)),
      hasLeadsColumn: true,
    };
  }

  // 2) page_views ausente (migration 020 pendente) → busca com leads, page_views=0.
  if (isMissingPageViewsColumnError(full.error.message)) {
    const withLeads = await supabaseClient
      .from("campaign_metrics")
      .select(SELECT_WITH_LEADS)
      .order("date", { ascending: true });

    if (!withLeads.error) {
      return {
        campaigns: (withLeads.data ?? []).map((row, index) =>
          mapSupabaseRow({ ...(row as Omit<SupabaseCampaignRow, "page_views">), page_views: 0 }, index),
        ),
        hasLeadsColumn: true,
      };
    }
  }

  // 3) leads ausente (migration 013 pendente) → legacy, leads e page_views = 0.
  if (isMissingLeadsColumnError(full.error.message)) {
    const legacy = await supabaseClient
      .from("campaign_metrics")
      .select(SELECT_LEGACY)
      .order("date", { ascending: true });

    if (legacy.error) {
      throw new Error(`Erro ao buscar dados no Supabase: ${legacy.error.message}`);
    }

    return {
      campaigns: (legacy.data ?? []).map((row, index) =>
        mapSupabaseRow({ ...(row as Omit<SupabaseCampaignRow, "leads" | "page_views">), leads: 0, page_views: 0 }, index),
      ),
      hasLeadsColumn: false,
    };
  }

  throw new Error(`Erro ao buscar dados no Supabase: ${full.error.message}`);
};

export const subscribeSupabaseCampaigns = (
  onChange: () => Promise<unknown>,
): RealtimeChannel => {
  if (!supabaseClient) {
    throw new Error("Supabase não configurado.");
  }

  return supabaseClient
    .channel("campaign-metrics-realtime")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "campaign_metrics",
      },
      () => {
        void onChange();
      },
    )
    .subscribe();
};

export const replaceSupabaseCampaigns = async (
  campaigns: CampaignData[],
  source: SourceChannel,
): Promise<void> => {
  if (!supabaseClient) {
    throw new Error("Supabase não configurado.");
  }

  // Multi-fonte: apaga só as linhas DESTA fonte. As demais (Meta, Eduzz, etc.)
  // coexistem — antes este delete limpava a tabela inteira.
  const { error: deleteError } = await supabaseClient
    .from("campaign_metrics")
    .delete()
    .eq("source", source);

  if (deleteError) {
    throw new Error(`Erro ao limpar dados antigos: ${deleteError.message}`);
  }

  if (campaigns.length === 0) {
    return;
  }

  // RLS multi-tenant (migration 021): insert exige company_id da empresa do usuário
  const { company } = await getCompanyContext();

  const payload = campaigns.map((item) => ({
    date: item.date,
    campaign_name: item.campaignName,
    investment: item.investment,
    clicks: item.clicks,
    impressions: item.impressions,
    conversions: item.conversions,
    leads: item.leads ?? 0,
    page_views: item.pageViews ?? 0,
    revenue: item.revenue,
    source,
    ...(company ? { company_id: company.id } : {}),
  }));

  let { error: insertError } = await supabaseClient
    .from("campaign_metrics")
    .insert(payload);

  // migration 020 pendente → reenvia sem page_views (não bloqueia o salvamento).
  if (insertError && isMissingPageViewsColumnError(insertError.message)) {
    const legacyPayload = payload.map(({ page_views: _pv, ...rest }) => rest);
    ({ error: insertError } = await supabaseClient.from("campaign_metrics").insert(legacyPayload));
  }

  if (insertError) {
    throw new Error(`Erro ao salvar campanhas no Supabase: ${insertError.message}`);
  }
};

export const saveSharedDataSource = async (source: SharedDataSource): Promise<void> => {
  if (!supabaseClient) {
    throw new Error("Supabase não configurado.");
  }

  const { error } = await supabaseClient
    .from("dashboard_data_source")
    .upsert(
      {
        id: true,
        source_type: source.type,
        source_label: source.label,
      },
      { onConflict: "id" },
    );

  if (error) {
    throw new Error(`Erro ao salvar fonte de dados compartilhada: ${error.message}`);
  }
};

export const fetchSharedDataSource = async (): Promise<SharedDataSource | null> => {
  if (!supabaseClient) {
    throw new Error("Supabase não configurado.");
  }

  const { data, error } = await supabaseClient
    .from("dashboard_data_source")
    .select("source_type, source_label")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar fonte de dados compartilhada: ${error.message}`);
  }

  if (!data) return null;

  return {
    type: data.source_type,
    label: data.source_label,
  };
};

// ─── Meta daily upsert ────────────────────────────────────────────────────────

export interface MetaSyncResult {
  synced: number;
  dateFrom: string;
  dateTo: string;
}

/**
 * Upserts daily campaign data into campaign_metrics for a single source without
 * touching rows of other sources. Requires the unique constraint
 * (date, campaign_name, source) — see migration 005.
 */
const upsertCampaignsBySource = async (
  campaigns: CampaignData[],
  source: SourceChannel,
): Promise<MetaSyncResult> => {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  if (campaigns.length === 0) return { synced: 0, dateFrom: "", dateTo: "" };

  const dates = campaigns.map((c) => c.date).sort();

  // RLS multi-tenant (migration 021): upsert exige company_id da empresa do usuário
  const { company } = await getCompanyContext();

  // Dedup por (date, campaign_name): campanhas homônimas em ACTs diferentes
  // somam métricas — upsert com chave repetida no mesmo lote quebra com
  // "ON CONFLICT DO UPDATE command cannot affect row a second time".
  const byKey = new Map<string, CampaignData>();
  for (const item of campaigns) {
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
    date: item.date,
    campaign_name: item.campaignName,
    investment: item.investment,
    clicks: item.clicks,
    impressions: item.impressions,
    conversions: item.conversions,
    leads: item.leads ?? 0,
    page_views: item.pageViews ?? 0,
    revenue: item.revenue,
    source,
    ...(company ? { company_id: company.id } : {}),
  }));

  // migration 024: unique inclui company_id (campanhas homônimas entre
  // empresas não colidem). Fallback para o unique antigo se a 024 não rodou.
  const conflictKey = company ? "company_id,date,campaign_name,source" : "date,campaign_name,source";

  let { data, error } = await supabaseClient
    .from("campaign_metrics")
    .upsert(payload, { onConflict: conflictKey })
    .select("id");

  if (error && company && /no unique|exclusion constraint/i.test(error.message)) {
    ({ data, error } = await supabaseClient
      .from("campaign_metrics")
      .upsert(payload, { onConflict: "date,campaign_name,source" })
      .select("id"));
  }

  // migration 020 pendente → reenvia sem page_views (sync segue funcionando).
  if (error && isMissingPageViewsColumnError(error.message)) {
    const legacyPayload = payload.map(({ page_views: _pv, ...rest }) => rest);
    ({ data, error } = await supabaseClient
      .from("campaign_metrics")
      .upsert(legacyPayload, { onConflict: conflictKey })
      .select("id"));
  }

  if (error) {
    if (isMissingLeadsColumnError(error.message)) {
      throw new Error(
        `Execute a migration ${LEADS_MIGRATION_FILE} no Supabase SQL Editor e depois use "Atualizar Meta" para re-sincronizar com leads.`,
      );
    }
    throw new Error(`Erro ao sincronizar: ${error.message}`);
  }

  return {
    synced: data?.length ?? 0,
    dateFrom: dates[0],
    dateTo: dates[dates.length - 1],
  };
};

/** Upsert não-destrutivo de dados Meta (preserva linhas de outras fontes). */
export const upsertMetaCampaigns = (campaigns: CampaignData[]): Promise<MetaSyncResult> =>
  upsertCampaignsBySource(campaigns, "meta");

/** Backfill de vendas Eduzz via CSV/planilha (o webhook grava server-side). */
export const upsertEduzzSales = (campaigns: CampaignData[]): Promise<MetaSyncResult> =>
  upsertCampaignsBySource(campaigns, "eduzz");

export const subscribeSharedDataSource = (onChange: () => Promise<void>): RealtimeChannel => {
  if (!supabaseClient) {
    throw new Error("Supabase não configurado.");
  }

  return supabaseClient
    .channel("dashboard-source-realtime")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "dashboard_data_source",
      },
      () => {
        void onChange();
      },
    )
    .subscribe();
};
