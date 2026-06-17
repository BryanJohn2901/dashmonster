import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Webhook de vendas Eduzz
 * ─────────────────────────────────────────────────────────────────────────────
 * Configure no Eduzz → Ferramentas → Notificações (myeduzz) apontando para:
 *
 *   URL: https://<seu-dominio>/api/eduzz/webhook?secret=<SEGREDO_DA_EMPRESA>
 *
 * O <SEGREDO_DA_EMPRESA> é definido na aba Integrações (companies.settings →
 * eduzz_webhook_secret) e identifica a empresa dona da venda. Sem service_role
 * a escrita seria bloqueada pelo RLS multi-tenant.
 *
 * Cada venda paga vira uma linha diária em campaign_metrics
 * (source="eduzz", revenue=valor, conversions=1) agregada por (data, produto).
 */

// Eduzz não tem objetivo de cliques/impressões — só receita e conversão.
const EDUZZ_SOURCE = "eduzz" as const;

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Payload Eduzz (defensivo — nomes variam por versão de notificação) ────────
type EduzzPayload = Record<string, unknown>;

const pick = (obj: EduzzPayload, ...keys: string[]): unknown => {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return undefined;
};

const toNumber = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/\s|R\$/g, "").replace(/\.(?=\d{3})/g, "").replace(",", "."));
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
};

const toDate = (v: unknown): string => {
  const raw = typeof v === "string" ? v : "";
  // aceita "YYYY-MM-DD" ou "YYYY-MM-DD HH:mm:ss" ou "DD/MM/YYYY"
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Status que contam como venda concretizada. */
const PAID_STATUSES = new Set(["3", "paid", "pago", "aprovada", "approved", "completed"]);

export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret")?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Segredo ausente." }, { status: 401 });
  }

  let body: EduzzPayload;
  try {
    body = (await request.json()) as EduzzPayload;
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const db = adminClient();
  if (!db) {
    return NextResponse.json({ error: "Servidor sem service_role configurado." }, { status: 500 });
  }

  // Identifica a empresa dona pelo segredo guardado em companies.settings.
  const { data: company, error: companyError } = await db
    .from("companies")
    .select("id")
    .eq("settings->>eduzz_webhook_secret", secret)
    .maybeSingle();

  if (companyError || !company) {
    return NextResponse.json({ error: "Segredo não corresponde a nenhuma empresa." }, { status: 403 });
  }

  // Só contabiliza venda paga; demais status respondem 200 (Eduzz não reenfileira).
  const status = String(pick(body, "trans_status", "status", "trans_statusmessage") ?? "").toLowerCase();
  if (status && !PAID_STATUSES.has(status)) {
    return NextResponse.json({ received: true, ignored: `status=${status}` });
  }

  const revenue = toNumber(pick(body, "trans_value", "trans_paidvalue", "value", "amount"));
  const produto = String(pick(body, "product_name", "product_cod", "produto", "content_title") ?? "Eduzz").trim();
  const date    = toDate(pick(body, "trans_paiddate", "trans_createdate", "date"));

  if (revenue <= 0) {
    return NextResponse.json({ received: true, ignored: "sem valor" });
  }

  // Acumula no dia/produto: lê a linha existente, soma e faz upsert
  // (uma notificação = uma venda; várias vendas do mesmo produto somam).
  const { data: existing } = await db
    .from("campaign_metrics")
    .select("revenue, conversions")
    .eq("company_id", company.id)
    .eq("date", date)
    .eq("campaign_name", produto)
    .eq("source", EDUZZ_SOURCE)
    .maybeSingle();

  const payload = {
    company_id:    company.id,
    date,
    campaign_name: produto,
    investment:    0,
    clicks:        0,
    impressions:   0,
    conversions:   Number(existing?.conversions ?? 0) + 1,
    leads:         0,
    revenue:       Number(existing?.revenue ?? 0) + revenue,
    source:        EDUZZ_SOURCE,
  };

  let { error: upsertError } = await db
    .from("campaign_metrics")
    .upsert(payload, { onConflict: "company_id,date,campaign_name,source" });

  // Fallback p/ o unique antigo (migration 024 não aplicada).
  if (upsertError && /no unique|exclusion constraint/i.test(upsertError.message)) {
    ({ error: upsertError } = await db
      .from("campaign_metrics")
      .upsert(payload, { onConflict: "date,campaign_name,source" }));
  }

  if (upsertError) {
    console.error("[eduzz webhook] upsert:", upsertError.message);
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ received: true, produto, date, revenue });
}
