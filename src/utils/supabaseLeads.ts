import { RealtimeChannel } from "@supabase/supabase-js";
import { LeadRow, SourceChannel } from "@/types/campaign";
import { supabaseClient } from "@/lib/supabase";
import { getCompanyContext } from "@/hooks/useCompany";
import { fetchLeadsSheetData, leadDedupeKey } from "@/utils/googleSheets";

/** Chave em companies.settings onde fica a URL da planilha de leads. */
export const LEADS_SHEET_URL_KEY = "leads_sheet_url";

interface SupabaseLeadRow {
  id: string;
  date: string;
  origem: string;
  produto: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  source: SourceChannel;
}

const LEADS_SELECT = "id, date, origem, produto, full_name, email, phone, source";

const todayLocal = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const mapLeadRow = (row: SupabaseLeadRow): LeadRow => ({
  id: row.id,
  createdTime: row.date,
  fullName: row.full_name,
  email: row.email,
  phone: row.phone,
  origem: row.origem,
  produto: row.produto ?? undefined,
  source: row.source,
});

/** Busca os leads da empresa ativa (lista da aba Leads). */
export const fetchLeads = async (): Promise<LeadRow[]> => {
  if (!supabaseClient) throw new Error("Supabase não configurado.");

  const { data, error } = await supabaseClient
    .from("leads")
    .select(LEADS_SELECT)
    .order("date", { ascending: false });

  if (error) {
    // Tabela ainda não criada (migration 028 pendente) → não bloqueia o app.
    if (/leads/i.test(error.message) && /(does not exist|schema|relation)/i.test(error.message)) {
      return [];
    }
    throw new Error(`Erro ao buscar leads: ${error.message}`);
  }

  return (data ?? []).map((row) => mapLeadRow(row as SupabaseLeadRow));
};

/**
 * Upsert idempotente de leads (planilha ao vivo / backfill). A `dedupe_key`
 * garante que re-sincronizar a mesma planilha não duplica linhas.
 */
export const upsertLeads = async (leads: LeadRow[]): Promise<number> => {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  if (leads.length === 0) return 0;

  const { company } = await getCompanyContext();

  // Dedup no próprio lote — chaves repetidas quebram o upsert ("cannot affect
  // row a second time"). Mantém a última ocorrência.
  const byKey = new Map<string, LeadRow & { dedupe_key: string }>();
  for (const lead of leads) {
    const dedupe_key = leadDedupeKey(lead);
    byKey.set(dedupe_key, { ...lead, dedupe_key });
  }

  const payload = Array.from(byKey.values()).map((lead) => ({
    date: lead.createdTime || todayLocal(),
    origem: lead.origem,
    produto: lead.produto ?? null,
    full_name: lead.fullName,
    email: lead.email,
    phone: lead.phone,
    source: lead.source,
    dedupe_key: lead.dedupe_key,
    ...(company ? { company_id: company.id } : {}),
  }));

  const { data, error } = await supabaseClient
    .from("leads")
    .upsert(payload, { onConflict: "company_id,dedupe_key" })
    .select("id");

  if (error) throw new Error(`Erro ao salvar leads: ${error.message}`);
  return data?.length ?? 0;
};

/** URL da planilha de leads configurada na empresa ativa (vazia se não houver). */
export const getLeadsSheetUrl = async (): Promise<string> => {
  const { company } = await getCompanyContext();
  const url = company?.settings?.[LEADS_SHEET_URL_KEY];
  return typeof url === "string" ? url.trim() : "";
};

/**
 * Puxa a planilha de leads (ao vivo) e faz upsert no banco. Idempotente —
 * pode rodar em intervalo / ao abrir a aba sem duplicar. Retorna nº gravado.
 */
export const syncLeadsSheet = async (): Promise<number> => {
  const url = await getLeadsSheetUrl();
  if (!url) return 0;
  const leads = await fetchLeadsSheetData(url);
  return upsertLeads(leads);
};

/** Realtime: a aba Leads reflete inserts ao vivo (planilha / webhook). */
export const subscribeLeads = (onChange: () => Promise<unknown>): RealtimeChannel => {
  if (!supabaseClient) throw new Error("Supabase não configurado.");

  return supabaseClient
    .channel("leads-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "leads" },
      () => { void onChange(); },
    )
    .subscribe();
};
