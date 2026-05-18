import { RealtimeChannel } from "@supabase/supabase-js";
import { CampaignData } from "@/types/campaign";
import { supabaseClient } from "@/lib/supabase";
import { calculateDerivedMetrics } from "@/utils/metrics";

interface SupabaseCampaignRow {
  id: string;
  date: string;
  campaign_name: string;
  investment: number;
  clicks: number;
  impressions: number;
  conversions: number;
  revenue: number;
  source: "csv" | "google_sheets" | "meta";
}

export interface SharedDataSource {
  type: "csv" | "google_sheets" | "meta";
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
      leads: Number((row as { leads?: number }).leads ?? 0),
      revenue: Number(row.revenue ?? 0),
    },
    index,
  );
};

export const fetchSupabaseCampaigns = async (): Promise<CampaignData[]> => {
  if (!supabaseClient) {
    throw new Error("Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  const { data, error } = await supabaseClient
    .from("campaign_metrics")
    .select(
      "id, date, campaign_name, investment, clicks, impressions, conversions, revenue, source",
    )
    .order("date", { ascending: true });

  if (error) {
    throw new Error(`Erro ao buscar dados no Supabase: ${error.message}`);
  }

  return (data ?? []).map((row, index) => mapSupabaseRow(row, index));
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
  source: "csv" | "google_sheets" | "meta",
): Promise<void> => {
  if (!supabaseClient) {
    throw new Error("Supabase não configurado.");
  }

  const { error: deleteError } = await supabaseClient
    .from("campaign_metrics")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (deleteError) {
    throw new Error(`Erro ao limpar dados antigos: ${deleteError.message}`);
  }

  if (campaigns.length === 0) {
    return;
  }

  const payload = campaigns.map((item) => ({
    date: item.date,
    campaign_name: item.campaignName,
    investment: item.investment,
    clicks: item.clicks,
    impressions: item.impressions,
    conversions: item.conversions,
    revenue: item.revenue,
    source,
  }));

  const { error: insertError } = await supabaseClient
    .from("campaign_metrics")
    .insert(payload);

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
 * Upserts Meta Ads daily data into campaign_metrics without touching other rows.
 * Requires the unique constraint (date, campaign_name, source) — see migration 005.
 */
export const upsertMetaCampaigns = async (campaigns: CampaignData[]): Promise<MetaSyncResult> => {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  if (campaigns.length === 0) return { synced: 0, dateFrom: "", dateTo: "" };

  const dates = campaigns.map((c) => c.date).sort();

  const payload = campaigns.map((item) => ({
    date: item.date,
    campaign_name: item.campaignName,
    investment: item.investment,
    clicks: item.clicks,
    impressions: item.impressions,
    conversions: item.conversions,
    revenue: item.revenue,
    source: "meta" as const,
  }));

  const { data, error } = await supabaseClient
    .from("campaign_metrics")
    .upsert(payload, { onConflict: "date,campaign_name,source" })
    .select("id");

  if (error) throw new Error(`Erro ao sincronizar: ${error.message}`);

  return {
    synced: data?.length ?? 0,
    dateFrom: dates[0],
    dateTo: dates[dates.length - 1],
  };
};

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
