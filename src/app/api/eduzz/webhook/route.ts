import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hashLower, hashPhone } from "@/lib/metaHash";
import { insertEventsLogRow } from "@/lib/eventsLogInsert";
import { sendMetaCapiEvent } from "@/lib/metaCapi";
import { resolveDefaultPixel, resolvePixelById } from "@/lib/resolvePixel";

/**
 * Webhook de vendas Eduzz
 * ─────────────────────────────────────────────────────────────────────────────
 * Aceita 2 formatos, detectados automaticamente pelo formato do corpo da
 * requisição — o usuário escolhe qual cadastrar na Eduzz, os dois funcionam
 * na MESMA URL:
 *
 *   1) Postback antigo (MyEduzz → Ferramentas → Notificações): campos soltos
 *      (trans_value, cus_email, tracker_utm_source...). Formato que já existia.
 *   2) Webhook moderno (Órbita → Webhooks → evento "Fatura paga", myeduzz.invoice_paid):
 *      JSON estruturado (data.buyer/data.utm/data.tracker/data.price). Só ele
 *      garante telefone do comprador e os campos tracker_trk* de correlação.
 *
 *   URL (qualquer um dos 2): https://<seu-dominio>/api/eduzz/webhook?secret=<SEGREDO_DA_CONFIG>
 *
 * O <SEGREDO_DA_CONFIG> é criado na aba Tracking → Configuração → Vendas
 * (Eduzz) — migration 041, tabela `eduzz_webhook_configs` (várias configs
 * nomeadas por empresa, RLS owner+manager). Identifica a empresa dona da
 * venda igual nos 2 formatos — não usamos o `producer.originSecret` que o
 * formato moderno manda dentro do payload, pra manter 1 só mecanismo.
 *
 * Cada venda paga faz 2 coisas, sempre as 2:
 *   a) acumula uma linha diária em campaign_metrics (source="eduzz", revenue,
 *      conversions=1) — comportamento que já existia, inalterado.
 *   b) grava um evento "Purchase" em events_log e manda pra Meta Conversions
 *      API, igual a qualquer outro evento do pixel (Lead/PageView) — ver
 *      `recordSale()` abaixo. SÓ o formato moderno tem telefone do comprador;
 *      o antigo manda o que tiver (normalmente só email).
 *
 * Correlação com uma visita rastreada (pra mandar a Purchase com mais contexto
 * pra Meta — fbp/fbc, event_source_url real — em vez de um evento "solto"):
 *   1. `tracker_trk`/`tracker.code1` — se o link de checkout foi configurado
 *      pra ecoar o `_dm_uid` do visitante (cookie do nosso pixel.js) nesse
 *      campo, é match exato e direto por fingerprint_id.
 *   2. Email do comprador — busca o Lead mais recente da empresa com esse
 *      mesmo lead_email em events_log (já gravado em texto puro desde a
 *      migration 031). É o caminho que funciona SEM nenhuma config extra na
 *      Eduzz, só precisa do nosso próprio pixel já ter capturado o Lead antes.
 *   3. Telefone do comprador — mesma ideia, comparação exata (sem normalizar
 *      máscara — ver limitação no CLAUDE.md desta pasta).
 *   4. Sem match: fingerprint sintético (hash do email/telefone/id da
 *      transação) — agrupa compras repetidas da mesma pessoa mesmo sem
 *      histórico de visita, mas a Purchase vai pra Meta sem fbp/fbc/url.
 */

const EDUZZ_SOURCE = "eduzz" as const;

// Status que contam como venda concretizada (formato antigo).
const PAID_STATUSES = new Set(["3", "paid", "pago", "aprovada", "approved", "completed"]);

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── Parsing defensivo do formato antigo (nomes variam por versão) ───────────

type RawPayload = Record<string, unknown>;

const pick = (obj: RawPayload, ...keys: string[]): unknown => {
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

// ─── Formato unificado, depois de detectar/parsear qualquer um dos 2 ─────────

interface SaleEvent {
  transactionId: string;
  value: number;
  currency: string;
  productName: string;
  date: string; // YYYY-MM-DD, pra campaign_metrics
  paidAtIso: string | null; // ISO completo, pro event_time da CAPI
  email: string | null;
  phone: string | null;
  name: string | null;
  trackerCode: string | null;
  paymentMethod: string | null;
  utm: { source: string | null; medium: string | null; campaign: string | null; content: string | null; term: string | null };
  address: { city: string | null; state: string | null; country: string | null; zip: string | null };
}

function parseLegacyPayload(body: RawPayload): SaleEvent | { ignored: string } {
  const status = String(pick(body, "trans_status", "status", "trans_statusmessage") ?? "").toLowerCase();
  if (status && !PAID_STATUSES.has(status)) return { ignored: `status=${status}` };

  const value = toNumber(pick(body, "trans_paid", "trans_value", "trans_paidvalue", "value", "amount"));
  if (value <= 0) return { ignored: "sem valor" };

  return {
    transactionId: String(pick(body, "trans_cod", "trans_orderid", "trans_key") ?? `legacy-${Date.now()}`),
    value,
    currency: "BRL", // postback antigo é exclusivo do mercado BR, não manda moeda
    productName: String(pick(body, "product_name", "product_cod", "produto", "content_title") ?? "Eduzz").trim(),
    date: toDate(pick(body, "trans_paiddate", "trans_createdate", "date")),
    paidAtIso: null,
    email: (pick(body, "cus_email") as string | undefined)?.trim() || null,
    phone: (pick(body, "cus_cel", "cus_tel", "cus_tel2") as string | undefined)?.trim() || null,
    name: (pick(body, "cus_name") as string | undefined)?.trim() || null,
    trackerCode: (pick(body, "tracker_trk", "tracker_trk2", "tracker_trk3") as string | undefined)?.trim() || null,
    paymentMethod: (pick(body, "trans_paymentmethod") as string | undefined) ?? null,
    utm: {
      source: (pick(body, "tracker_utm_source") as string | undefined) ?? null,
      medium: (pick(body, "tracker_utm_medium") as string | undefined) ?? null,
      campaign: (pick(body, "tracker_utm_campaign") as string | undefined) ?? null,
      content: (pick(body, "tracker_utm_content") as string | undefined) ?? null,
      term: null, // formato antigo não manda utm_term
    },
    address: { city: null, state: null, country: null, zip: null },
  };
}

interface EduzzModernPayload {
  event?: string;
  data?: {
    status?: string;
    buyer?: { name?: string; email?: string; phone?: string; cellphone?: string; address?: { city?: string; state?: string; country?: string; zipCode?: string } };
    utm?: { source?: string; medium?: string; campaign?: string; content?: string; term?: string };
    tracker?: { code1?: string; code2?: string; code3?: string };
    price?: { value?: number; currency?: string };
    paid?: { value?: number; currency?: string };
    transaction?: { id?: string; key?: string };
    items?: { name?: string }[];
    paymentMethod?: string;
    paidAt?: string;
  };
}

function isModernPayload(body: RawPayload): boolean {
  return typeof body.event === "string" && typeof body.data === "object" && body.data !== null && "buyer" in (body.data as object);
}

function parseModernPayload(body: EduzzModernPayload): SaleEvent | { ignored: string } {
  if (body.event !== "myeduzz.invoice_paid") return { ignored: `event=${body.event ?? "desconhecido"}` };
  const data = body.data ?? {};
  const value = toNumber(data.paid?.value ?? data.price?.value);
  if (value <= 0) return { ignored: "sem valor" };

  return {
    transactionId: data.transaction?.id || data.transaction?.key || `modern-${Date.now()}`,
    value,
    currency: data.paid?.currency || data.price?.currency || "BRL",
    productName: data.items?.[0]?.name?.trim() || "Eduzz",
    date: toDate(data.paidAt),
    paidAtIso: data.paidAt ?? null,
    email: data.buyer?.email?.trim() || null,
    phone: data.buyer?.cellphone?.trim() || data.buyer?.phone?.trim() || null,
    name: data.buyer?.name?.trim() || null,
    trackerCode: data.tracker?.code1?.trim() || data.tracker?.code2?.trim() || data.tracker?.code3?.trim() || null,
    paymentMethod: data.paymentMethod ?? null,
    utm: {
      source: data.utm?.source ?? null,
      medium: data.utm?.medium ?? null,
      campaign: data.utm?.campaign ?? null,
      content: data.utm?.content ?? null,
      term: data.utm?.term ?? null,
    },
    address: {
      city: data.buyer?.address?.city ?? null,
      state: data.buyer?.address?.state ?? null,
      country: data.buyer?.address?.country ?? null,
      zip: data.buyer?.address?.zipCode ?? null,
    },
  };
}

// ─── Purchase → events_log + Meta CAPI ────────────────────────────────────────

// "fn"/"ln" pro user_data da Meta — mesma ideia de split que o pixel.js usa
// num campo único de nome completo (1º espaço separa nome do resto).
function splitName(name: string | null): { fn?: string; ln?: string } {
  if (!name) return {};
  const parts = name.trim().split(/\s+/);
  return { fn: hashLower(parts[0]), ln: parts.length > 1 ? hashLower(parts.slice(1).join(" ")) : undefined };
}

async function findMatchByFingerprint(db: SupabaseClient, companyId: string, fingerprintId: string) {
  const { data } = await db
    .from("events_log")
    .select("fingerprint_id, event_url, pixel_id, fbp, fbc, country, country_region, city, postal_code")
    .eq("company_id", companyId)
    .eq("fingerprint_id", fingerprintId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function findMatchByColumn(db: SupabaseClient, companyId: string, column: "lead_email" | "lead_phone", value: string) {
  const { data, error } = await db
    .from("events_log")
    .select("fingerprint_id, event_url, pixel_id, fbp, fbc, country, country_region, city, postal_code")
    .eq("company_id", companyId)
    .ilike(column, value)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null; // coluna fbp/fbc (migration 040) pode não existir ainda — não trava a venda
  return data ?? null;
}

type VisitMatch = Awaited<ReturnType<typeof findMatchByFingerprint>>;

// Tenta achar a visita que gerou essa venda, na ordem: tracker code (match
// exato e direto) → email → telefone. Sem isso, a Purchase vai pra Meta sem
// fbp/fbc/event_source_url — funciona, mas com Match Quality pior.
async function resolveVisitMatch(db: SupabaseClient, companyId: string, sale: SaleEvent): Promise<VisitMatch> {
  if (sale.trackerCode) {
    const byTracker = await findMatchByFingerprint(db, companyId, sale.trackerCode);
    if (byTracker) return byTracker;
  }
  if (sale.email) {
    const byEmail = await findMatchByColumn(db, companyId, "lead_email", sale.email);
    if (byEmail) return byEmail;
  }
  if (sale.phone) {
    const byPhone = await findMatchByColumn(db, companyId, "lead_phone", sale.phone);
    if (byPhone) return byPhone;
  }
  return null;
}

async function recordSale(db: SupabaseClient, companyId: string, sale: SaleEvent) {
  const match = await resolveVisitMatch(db, companyId, sale);

  const fingerprintId =
    match?.fingerprint_id ||
    sale.trackerCode ||
    createHash("sha256").update(sale.email || sale.phone || sale.transactionId).digest("hex");

  const resolvedPixel = match?.pixel_id
    ? await resolvePixelById(db, companyId, match.pixel_id as string)
    : await resolveDefaultPixel(db, companyId);
  const metaConfigured = Boolean(resolvedPixel.meta_pixel_id && resolvedPixel.meta_capi_token);

  const country = (match?.country as string | null) ?? sale.address.country;
  const countryRegion = (match?.country_region as string | null) ?? sale.address.state;
  const city = (match?.city as string | null) ?? sale.address.city;
  const postalCode = (match?.postal_code as string | null) ?? sale.address.zip;
  const fbp = (match?.fbp as string | null) ?? null;
  const fbc = (match?.fbc as string | null) ?? null;

  const { data: inserted, error: insertError } = await insertEventsLogRow(db, {
    company_id: companyId,
    event_name: "Purchase",
    fingerprint_id: fingerprintId,
    event_url: match?.event_url ?? null,
    user_data: { em: hashLower(sale.email), ph: hashPhone(sale.phone) },
    lead_email: sale.email,
    lead_phone: sale.phone,
    lead_name: sale.name,
    // Mesmo campo que humanizeFieldKey()/extra_fields já usa pro Lead — o
    // dashboard (TrackingEventsView) exibe "produto" como rótulo bonito no
    // card da Purchase, sem precisar de coluna nova só pra isso.
    extra_fields: { produto: sale.productName },
    capi_status: metaConfigured ? "pending" : "skipped",
    country,
    country_region: countryRegion,
    city,
    postal_code: postalCode,
    event_id: sale.transactionId,
    pixel_id: resolvedPixel.pixelId,
    utm_source: sale.utm.source,
    utm_medium: sale.utm.medium,
    utm_campaign: sale.utm.campaign,
    utm_content: sale.utm.content,
    utm_term: sale.utm.term,
    value: sale.value,
    currency: sale.currency,
    external_transaction_id: sale.transactionId,
    source: EDUZZ_SOURCE,
    payment_method: sale.paymentMethod,
    fbp,
    fbc,
  });

  if (insertError || !inserted) {
    console.error("[eduzz webhook] falha ao gravar events_log:", insertError?.message);
    return;
  }
  if (!metaConfigured) return;

  const eventTime = sale.paidAtIso ? Math.floor(new Date(sale.paidAtIso).getTime() / 1000) : Math.floor(Date.now() / 1000);

  await sendMetaCapiEvent(db, {
    metaPixelId: resolvedPixel.meta_pixel_id!,
    metaCapiToken: resolvedPixel.meta_capi_token!,
    testEventCode: resolvedPixel.meta_test_event_code,
    eventLogId: inserted.id,
    eventData: {
      event_name: "Purchase",
      event_time: Number.isFinite(eventTime) ? eventTime : Math.floor(Date.now() / 1000),
      // Id da transação na Eduzz — único e estável, exatamente o que a Meta
      // recomenda usar como event_id em Purchase (não tem fbq pareado pra
      // deduplicar, mas serve pra nunca reenviar a mesma venda 2x na Meta
      // mesmo se a gente decidir reprocessar/reenviar manualmente no futuro).
      event_id: sale.transactionId,
      // Evento gerado pelo nosso backend a partir de uma notificação de
      // pagamento, não por uma ação literal no navegador no momento da
      // compra — "website" exigiria client_user_agent, que não temos aqui
      // (a Meta não suporta otimizar evento offline/app, mas Purchase via
      // backend de pagamento é justamente o caso de uso de system_generated).
      action_source: "system_generated",
      event_source_url: match?.event_url || undefined,
      user_data: {
        em: hashLower(sale.email),
        ph: hashPhone(sale.phone),
        ...splitName(sale.name),
        fbp: fbp || undefined,
        fbc: fbc || undefined,
        country: hashLower(country),
        st: hashLower(countryRegion),
        ct: hashLower(city),
        zp: hashLower(postalCode),
        external_id: hashLower(fingerprintId),
      },
      custom_data: {
        value: sale.value,
        currency: sale.currency,
        content_name: sale.productName,
        order_id: sale.transactionId,
      },
    },
  });
}

// ─── Idempotência ──────────────────────────────────────────────────────────────

// Eduzz pode reenviar a mesma notificação (retry de rede) — sem isso, a mesma
// venda viraria 2 Purchase na Meta e contaria receita em dobro em
// campaign_metrics. Se a coluna ainda não existir (migration 040 pendente),
// segue sem checar — mesmo risco que já existia antes desta feature.
async function alreadyProcessed(db: SupabaseClient, companyId: string, transactionId: string): Promise<boolean> {
  const { data, error } = await db
    .from("events_log")
    .select("id")
    .eq("company_id", companyId)
    .eq("external_transaction_id", transactionId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret")?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Segredo ausente." }, { status: 401 });
  }

  let body: RawPayload;
  try {
    body = (await request.json()) as RawPayload;
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const db = adminClient();
  if (!db) {
    return NextResponse.json({ error: "Servidor sem service_role configurado." }, { status: 500 });
  }

  // Identifica a empresa dona pelo segredo — mesmo mecanismo pros 2 formatos
  // (não usamos producer.originSecret do formato moderno, pra manter só 1
  // jeito de identificar a empresa). migration 041: o segredo agora vive em
  // eduzz_webhook_configs (várias configs nomeadas por empresa), não mais
  // direto em companies.settings. Se a tabela ainda não existir (migration
  // pendente), cai pro campo legado — mesmo padrão de resiliência de sempre.
  const configRes = await db.from("eduzz_webhook_configs").select("company_id").eq("secret", secret).maybeSingle();

  let companyId: string | null = null;
  if (configRes.error?.message?.includes("eduzz_webhook_configs")) {
    const legacy = await db.from("companies").select("id").eq("settings->>eduzz_webhook_secret", secret).maybeSingle();
    companyId = (legacy.data?.id as string | undefined) ?? null;
  } else {
    companyId = (configRes.data?.company_id as string | undefined) ?? null;
  }

  if (!companyId) {
    return NextResponse.json({ error: "Segredo não corresponde a nenhuma empresa." }, { status: 403 });
  }

  const sale = isModernPayload(body) ? parseModernPayload(body as EduzzModernPayload) : parseLegacyPayload(body);
  if ("ignored" in sale) {
    return NextResponse.json({ received: true, ignored: sale.ignored });
  }

  if (await alreadyProcessed(db, companyId, sale.transactionId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Acumula no dia/produto: lê a linha existente, soma e faz upsert
  // (uma notificação = uma venda; várias vendas do mesmo produto somam).
  const { data: existing } = await db
    .from("campaign_metrics")
    .select("revenue, conversions")
    .eq("company_id", companyId)
    .eq("date", sale.date)
    .eq("campaign_name", sale.productName)
    .eq("source", EDUZZ_SOURCE)
    .maybeSingle();

  const metricsPayload = {
    company_id: companyId,
    date: sale.date,
    campaign_name: sale.productName,
    investment: 0,
    clicks: 0,
    impressions: 0,
    conversions: Number(existing?.conversions ?? 0) + 1,
    leads: 0,
    revenue: Number(existing?.revenue ?? 0) + sale.value,
    source: EDUZZ_SOURCE,
  };

  let { error: upsertError } = await db
    .from("campaign_metrics")
    .upsert(metricsPayload, { onConflict: "company_id,date,campaign_name,source" });

  // Fallback p/ o unique antigo (migration 024 não aplicada).
  if (upsertError && /no unique|exclusion constraint/i.test(upsertError.message)) {
    ({ error: upsertError } = await db
      .from("campaign_metrics")
      .upsert(metricsPayload, { onConflict: "date,campaign_name,source" }));
  }

  if (upsertError) {
    console.error("[eduzz webhook] upsert campaign_metrics:", upsertError.message);
  }

  // Purchase em events_log + Meta CAPI nunca pode derrubar a resposta —
  // se a Eduzz não receber 200 rápido, ela reenfileira a notificação.
  try {
    await recordSale(db, companyId, sale);
  } catch (err) {
    console.error("[eduzz webhook] falha ao registrar Purchase:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ received: true, produto: sale.productName, date: sale.date, revenue: sale.value });
}
