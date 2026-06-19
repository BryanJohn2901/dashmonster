import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hashLower, hashPhone, hashNormalized } from "@/lib/metaHash";
import { insertEventsLogRow } from "@/lib/eventsLogInsert";
import { sendMetaCapiEvent } from "@/lib/metaCapi";
import { resolveDefaultPixel, resolvePixelById, type ResolvedPixel } from "@/lib/resolvePixel";

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
  /** ID de assinatura/contrato recorrente, se houver — repete em toda renovação da mesma assinatura. Genérico (não exclusivo da Eduzz) pra outras plataformas reaproveitarem o mesmo campo no futuro. */
  recurrenceKey: string | null;
  /** Número da parcela (boleto parcelado) — 1 = primeira parcela/venda nova, >1 = continuação de uma venda já contada. */
  installmentNumber: number | null;
  /** Total de parcelas (ex.: boleto em 3x) — só pra exibição, a Eduzz não manda isso pra cartão (parcelamento de cartão é da operadora, invisível pra plataforma). */
  installments: number | null;
  /** true quando essa fatura é um order bump (produto extra do checkout), não a venda principal — vem como notificação própria, com seu próprio transactionId/valor/produto. */
  isOrderBump: boolean;
  /** transactionId da venda principal a que esse order bump pertence (data.orderBump.mainSaleId) — null pra venda principal e pro formato antigo (sem suporte). */
  mainSaleTransactionId: string | null;
  /** Itens da fatura (data.items no formato moderno) — usado pra montar content_ids/contents/num_items na Meta CAPI (recomendado pra otimização de catálogo, não afeta Event Match Quality). Formato antigo não manda itens estruturados, cai pra 1 item sintético com productId null. */
  items: { productId: string | null; parentId: string | null; name: string; value: number }[];
  /** parentId do item principal (items[0]) — "curso pai", estável entre variantes de oferta/parcelamento do mesmo produto. Usado pro mapeamento opcional produto→pixel (migration 048). null no formato antigo (sem itens estruturados). */
  productParentId: string | null;
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
    // Postback antigo não manda contrato/parcela — sem suporte a detecção de
    // recorrência/parcelamento nesse formato (limitação documentada no CLAUDE.md).
    recurrenceKey: null,
    installmentNumber: null,
    installments: null,
    // Postback antigo não manda o campo orderBump — sem suporte a essa detecção nesse formato.
    isOrderBump: false,
    mainSaleTransactionId: null,
    // Nem itens estruturados nem productId/parentId — 1 item sintético só com o nome/valor já parseados acima.
    items: [{ productId: null, parentId: null, name: String(pick(body, "product_name", "product_cod", "produto", "content_title") ?? "Eduzz").trim(), value }],
    productParentId: null,
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
    items?: { productId?: string; parentId?: string; name?: string; price?: { value?: number; currency?: string } }[];
    paymentMethod?: string;
    paidAt?: string;
    /** Presente quando o produto é uma assinatura/contrato recorrente — `id` repete em toda renovação. */
    contract?: { id?: string; isUnlimitedInstallments?: boolean };
    /** Presente quando o pagamento é boleto parcelado — cada parcela paga manda seu próprio invoice_paid. */
    bankSlipInstallment?: { installmentNumber?: number; totalInstallments?: number };
    /** Order bump: o produto extra do checkout chega como notificação invoice_paid própria (próprio transaction.id/price), não dentro do payload da venda principal — `isMainSale: false` identifica essa fatura como o bump, `mainSaleId` referencia o transaction.id da venda principal. */
    orderBump?: { has?: boolean; isMainSale?: boolean; mainSaleId?: number | string | null };
  };
}

function isModernPayload(body: RawPayload): boolean {
  return typeof body.event === "string" && typeof body.data === "object" && body.data !== null && "buyer" in (body.data as object);
}

function parseModernPayload(body: EduzzModernPayload): SaleEvent | { ignored: string } {
  if (body.event !== "myeduzz.invoice_paid") return { ignored: `event=${body.event ?? "desconhecido"}` };
  const data = body.data ?? {};
  // price = valor CHEIO do item (o que o usuário quer ver) vs paid = valor
  // efetivamente pago NESSA fatura — divergem em boleto parcelado (paid é só
  // a parcela) e às vezes em desconto/parcial. Sempre usar price primeiro.
  const value = toNumber(data.price?.value ?? data.paid?.value);
  if (value <= 0) return { ignored: "sem valor" };
  const productName = data.items?.[0]?.name?.trim() || "Eduzz";

  return {
    transactionId: data.transaction?.id || data.transaction?.key || `modern-${Date.now()}`,
    value,
    currency: data.price?.currency || data.paid?.currency || "BRL",
    productName,
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
    recurrenceKey: data.contract?.id ?? null,
    installmentNumber: data.bankSlipInstallment?.installmentNumber ?? null,
    installments: data.bankSlipInstallment?.totalInstallments ?? null,
    isOrderBump: Boolean(data.orderBump?.has && data.orderBump?.isMainSale === false),
    mainSaleTransactionId: data.orderBump?.mainSaleId != null ? String(data.orderBump.mainSaleId) : null,
    items: data.items?.length
      ? data.items.map((item) => ({ productId: item.productId ?? null, parentId: item.parentId ?? null, name: item.name?.trim() || "Eduzz", value: toNumber(item.price?.value) }))
      : [{ productId: null, parentId: null, name: productName, value }],
    productParentId: data.items?.[0]?.parentId ?? null,
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

// Colunas adicionadas em migrations diferentes (fbp/fbc=040, client_ip/ua=047)
// podem não existir ainda no banco — por isso há SELECTs de fallback abaixo.
// Tipo único pra todas as variantes casarem (campos ausentes ficam undefined).
interface VisitMatch {
  fingerprint_id: string | null;
  event_url: string | null;
  pixel_id: string | null;
  fbp?: string | null;
  fbc?: string | null;
  country?: string | null;
  country_region?: string | null;
  city?: string | null;
  postal_code?: string | null;
  client_ip_address?: string | null;
  client_user_agent?: string | null;
}

const MATCH_SELECT_FULL =
  "fingerprint_id, event_url, pixel_id, fbp, fbc, country, country_region, city, postal_code, client_ip_address, client_user_agent";
// Progressivamente menor, conforme a migration ainda não rodou.
const MATCH_SELECT_NO_CLIENT = "fingerprint_id, event_url, pixel_id, fbp, fbc, country, country_region, city, postal_code";
const MATCH_SELECT_MINIMAL = "fingerprint_id, event_url, pixel_id, country, country_region, city, postal_code";

// Roda a mesma query com SELECTs cada vez menores até uma não reclamar de
// coluna ausente — não pode travar a venda só porque a migration está pendente.
async function runMatchQuery(
  db: SupabaseClient,
  filter: (q: ReturnType<ReturnType<SupabaseClient["from"]>["select"]>) => unknown,
): Promise<VisitMatch | null> {
  for (const select of [MATCH_SELECT_FULL, MATCH_SELECT_NO_CLIENT, MATCH_SELECT_MINIMAL]) {
    const { data, error } = (await filter(db.from("events_log").select(select))) as {
      data: VisitMatch | null;
      error: { message?: string } | null;
    };
    if (!error) return data ?? null;
    const missingColumn = /column .* does not exist|fbp|fbc|client_ip_address|client_user_agent/i.test(error.message ?? "");
    if (!missingColumn) return null; // erro de verdade (não é coluna ausente) — não insiste
  }
  return null;
}

async function findMatchByFingerprint(db: SupabaseClient, companyId: string, fingerprintId: string): Promise<VisitMatch | null> {
  return runMatchQuery(db, (q) =>
    q.eq("company_id", companyId).eq("fingerprint_id", fingerprintId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  );
}

async function findMatchByColumn(db: SupabaseClient, companyId: string, column: "lead_email" | "lead_phone", value: string): Promise<VisitMatch | null> {
  return runMatchQuery(db, (q) =>
    q.eq("company_id", companyId).ilike(column, value).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  );
}

// Tenta achar a visita que gerou essa venda, na ordem: tracker code (match
// exato e direto) → email → telefone. Sem isso, a Purchase vai pra Meta sem
// fbp/fbc/event_source_url — funciona, mas com Match Quality pior.
async function resolveVisitMatch(db: SupabaseClient, companyId: string, sale: SaleEvent): Promise<VisitMatch | null> {
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

// Mapeamento opcional "produto → pixel" (migration 048/049, `eduzz_product_pixel_map`)
// — só existe se o usuário cadastrar explicitamente. A chave (`eduzz_product_key`)
// aceita TANTO productId quanto parentId — o usuário cola o que tiver à mão
// (ex.: o productId que aparece no payload/relatório), sem precisar saber a
// diferença entre os dois. Testamos contra todos os candidatos da venda:
// productId de cada item + o parentId do item principal.
function candidateProductKeys(sale: SaleEvent): string[] {
  const keys = sale.items.map((i) => i.productId).filter((id): id is string => Boolean(id));
  if (sale.productParentId) keys.push(sale.productParentId);
  return [...new Set(keys)];
}

async function findMappedPixelId(db: SupabaseClient, companyId: string, sale: SaleEvent): Promise<string | null> {
  const keys = candidateProductKeys(sale);
  if (keys.length === 0) return null;
  const { data, error } = await db
    .from("eduzz_product_pixel_map")
    .select("pixel_id")
    .eq("company_id", companyId)
    .in("eduzz_product_key", keys)
    .limit(1)
    .maybeSingle();
  // Migration 048/049 pendente ou produto sem mapeamento — cai pro comportamento de sempre.
  if (error || !data) return null;
  return data.pixel_id as string;
}

// Empresa tem PELO MENOS 1 produto mapeado? Se sim, vira allowlist: só os
// produtos cadastrados aqui mandam pra Meta, todo o resto é ignorado de
// propósito (pedido explícito do usuário — "se eu configurar, envia só o
// que eu configurar"). Sem nenhuma linha cadastrada, esse modo nunca liga,
// e o comportamento de sempre (visita → pixel padrão) continua intacto.
async function companyHasProductMapping(db: SupabaseClient, companyId: string): Promise<boolean> {
  const { data, error } = await db.from("eduzz_product_pixel_map").select("id").eq("company_id", companyId).limit(1);
  return !error && Boolean(data?.length);
}

async function recordSale(db: SupabaseClient, companyId: string, sale: SaleEvent) {
  const match = await resolveVisitMatch(db, companyId, sale);

  const fingerprintId =
    match?.fingerprint_id ||
    sale.trackerCode ||
    createHash("sha256").update(sale.email || sale.phone || sale.transactionId).digest("hex");

  // Resolução do pixel, em ordem: 1) mapeamento explícito do produto (vence
  // sempre que existir — escolha deliberada do usuário) → 2) allowlist: se a
  // empresa tem QUALQUER produto mapeado mas este não bateu, ignora de
  // propósito (nem usa a visita correlacionada — é a regra "só o que eu
  // configurar") → 3) sem nenhum mapeamento cadastrado na empresa, comportamento
  // de sempre: pixel da visita correlacionada, senão o pixel padrão.
  const mappedPixelId = await findMappedPixelId(db, companyId, sale);
  let resolvedPixel: ResolvedPixel;
  if (mappedPixelId) {
    resolvedPixel = await resolvePixelById(db, companyId, mappedPixelId);
  } else if (await companyHasProductMapping(db, companyId)) {
    resolvedPixel = { companyId, pixelId: null, meta_pixel_id: null, meta_capi_token: null, dominio_autorizado: null, meta_test_event_code: null };
  } else if (match?.pixel_id) {
    resolvedPixel = await resolvePixelById(db, companyId, match.pixel_id as string);
  } else {
    resolvedPixel = await resolveDefaultPixel(db, companyId);
  }
  const metaConfigured = Boolean(resolvedPixel.meta_pixel_id && resolvedPixel.meta_capi_token);

  // Endereço da Eduzz (data.buyer.address) é o endereço real do comprador
  // nessa compra — mais confiável que o geo-IP da visita (que pode ser de
  // semanas atrás, rede diferente, ou a Vercel não ter resolvido o IP). Visita
  // correlacionada só preenche o que a Eduzz não mandou (postback antigo sem
  // endereço, ou formato moderno com algum campo do address vazio).
  const country = sale.address.country ?? (match?.country as string | null);
  const countryRegion = sale.address.state ?? (match?.country_region as string | null);
  const city = sale.address.city ?? (match?.city as string | null);
  const postalCode = sale.address.zip ?? (match?.postal_code as string | null);
  const fbp = (match?.fbp as string | null) ?? null;
  const fbc = (match?.fbc as string | null) ?? null;
  // IP/UA da visita correlacionada (migration 047) — sinais fortes de match
  // reaproveitados na Purchase. Sem match, ficam null (venda sem navegador).
  const clientIp = (match?.client_ip_address as string | null) ?? null;
  const clientUserAgent = (match?.client_user_agent as string | null) ?? null;

  const { data: inserted, error: insertError } = await insertEventsLogRow(db, {
    company_id: companyId,
    event_name: "Purchase",
    fingerprint_id: fingerprintId,
    event_url: match?.event_url ?? null,
    user_data: { em: hashLower(sale.email), ph: hashPhone(sale.phone) },
    lead_email: sale.email,
    lead_phone: sale.phone,
    lead_name: sale.name,
    // product_name (coluna, migration 044) é a fonte de verdade pra relatório
    // futuro (mesma string que vai em campaign_metrics.campaign_name) — mantém
    // extra_fields.produto também só pra não quebrar telas/migrations antigas
    // que ainda leem de lá.
    product_name: sale.productName,
    // Guardado só pra alimentar a lista de "produtos detectados" na tela de
    // configuração do mapeamento produto→pixel (migration 048) — não tem
    // nenhum papel na lógica de resolução de pixel desta própria venda (essa
    // já usa sale.productParentId direto, sem precisar reconsultar o banco).
    product_parent_id: sale.productParentId,
    product_item_id: sale.items[0]?.productId ?? null,
    extra_fields: { produto: sale.productName },
    capi_status: metaConfigured ? "pending" : "skipped",
    country,
    country_region: countryRegion,
    city,
    postal_code: postalCode,
    event_id: sale.transactionId,
    pixel_id: resolvedPixel.pixelId,
    recurrence_key: sale.recurrenceKey,
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
    installments: sale.installments,
    is_order_bump: sale.isOrderBump,
    main_sale_transaction_id: sale.mainSaleTransactionId,
    fbp,
    fbc,
    client_ip_address: clientIp,
    client_user_agent: clientUserAgent,
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
        // IP/UA da visita correlacionada (crus, não hasheados) — só presentes
        // quando a venda casou com uma visita rastreada; reforçam o match.
        client_ip_address: clientIp || undefined,
        client_user_agent: clientUserAgent || undefined,
        country: hashLower(country),
        st: hashNormalized(countryRegion),
        ct: hashNormalized(city),
        zp: hashNormalized(postalCode),
        external_id: hashLower(fingerprintId),
      },
      custom_data: {
        value: sale.value,
        currency: sale.currency,
        content_name: sale.productName,
        order_id: sale.transactionId,
        // content_ids/content_type/contents/num_items: recomendados pela Meta
        // pra Purchase (ajudam otimização de campanha/catálogo), não afetam
        // Event Match Quality — vêm de data.items, ausentes no formato antigo
        // (item sintético sem productId, então content_ids fica vazio).
        ...buildCommerceCustomData(sale.items),
        // Liga a Purchase à assinatura, pra Meta poder agrupar cobranças
        // recorrentes da mesma assinatura (só na 1ª cobrança — renovação
        // nunca chega aqui, recordRenewal() não chama a Meta).
        subscription_id: sale.recurrenceKey ?? undefined,
      },
    },
  });
}

// content_ids só inclui itens com productId real (formato antigo não tem) —
// senão a Meta recebe um array de nulls, pior que não mandar o campo.
function buildCommerceCustomData(items: SaleEvent["items"]) {
  const contentIds = items.map((i) => i.productId).filter((id): id is string => Boolean(id));
  return {
    content_type: contentIds.length ? "product" : undefined,
    content_ids: contentIds.length ? contentIds : undefined,
    contents: contentIds.length
      ? items.filter((i) => i.productId).map((i) => ({ id: i.productId, quantity: 1, item_price: i.value }))
      : undefined,
    num_items: items.length || undefined,
  };
}

// ─── Recorrência/parcelamento ──────────────────────────────────────────────────

// Parcela de boleto (>1) é só continuação de um pagamento já contado por
// completo na parcela 1 — sem revenue novo, sem registro novo, ignora 100%.
function isInstallmentContinuation(sale: SaleEvent): boolean {
  return Boolean(sale.installmentNumber && sale.installmentNumber > 1);
}

// Renovação de assinatura JÁ vista antes (mesmo recurrence_key) — diferente
// da parcela: é receita nova de verdade (cobrança do mês), só não deve gerar
// Purchase pra Meta (evita ruído de "venda nova" todo mês — pedido explícito).
// `recordRenewal()` ainda guarda o valor pra relatório futuro de MRR/LTV.
async function isKnownRecurrence(db: SupabaseClient, companyId: string, recurrenceKey: string): Promise<boolean> {
  const { data, error } = await db
    .from("events_log")
    .select("id")
    .eq("company_id", companyId)
    .eq("recurrence_key", recurrenceKey)
    .limit(1)
    .maybeSingle();
  // Erro de coluna ausente (migration 042 pendente) não bloqueia — sem essa
  // checagem, renovação é tratada como venda nova (mesmo risco de sempre).
  return !error && Boolean(data);
}

// Acumula no dia/produto: lê a linha existente, soma e faz upsert (uma
// notificação = uma venda OU uma renovação; tanto faz pra esse total).
async function upsertCampaignMetrics(db: SupabaseClient, companyId: string, sale: SaleEvent): Promise<void> {
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
}

// Renovação de assinatura: NUNCA manda pra Meta (decisão de produto — só a 1ª
// cobrança é "venda nova" pra fins de otimização de campanha), mas guarda o
// valor em campaign_metrics (receita recorrente entra no total normal) e um
// registro em events_log com event_name="Renewal" (não "Purchase" — não entra
// no isCustomer/timeline de venda do dashboard atual, é só dado pra um
// relatório futuro de MRR/LTV agrupar por recurrence_key). capi_status fica
// fixo em "skipped": nem tentamos configurar pixel pra isso.
async function recordRenewal(db: SupabaseClient, companyId: string, sale: SaleEvent): Promise<void> {
  await upsertCampaignMetrics(db, companyId, sale);
  await insertEventsLogRow(db, {
    company_id: companyId,
    event_name: "Renewal",
    fingerprint_id: sale.recurrenceKey || sale.transactionId,
    user_data: {},
    lead_email: sale.email,
    lead_phone: sale.phone,
    lead_name: sale.name,
    product_name: sale.productName,
    capi_status: "skipped",
    event_id: sale.transactionId,
    recurrence_key: sale.recurrenceKey,
    value: sale.value,
    currency: sale.currency,
    external_transaction_id: sale.transactionId,
    source: EDUZZ_SOURCE,
    payment_method: sale.paymentMethod,
    installments: sale.installments,
  });
}

// ─── Reembolso/chargeback ──────────────────────────────────────────────────────

// Só formato moderno manda esses eventos. Atualiza o status da linha já
// gravada (pela 1ª cobrança) em vez de criar uma nova — não reverte nada na
// Meta ainda (escopo combinado: só guardar o dado, pra um relatório futuro de
// receita líquida poder excluir vendas revertidas). Se não achar a linha
// (webhook de reembolso chegou sem a gente ter visto o invoice_paid antes,
// raro), não tem o que atualizar — só confirma recebimento.
const REVERSAL_EVENTS: Record<string, "refunded" | "chargeback"> = {
  "myeduzz.invoice_refunded": "refunded",
  "myeduzz.invoice_chargeback": "chargeback",
};

async function handleReversal(db: SupabaseClient, companyId: string, body: EduzzModernPayload, status: "refunded" | "chargeback") {
  const transactionId = body.data?.transaction?.id || body.data?.transaction?.key;
  if (!transactionId) return NextResponse.json({ received: true, ignored: "sem transaction id" });

  const { error } = await db
    .from("events_log")
    .update({ status })
    .eq("company_id", companyId)
    .eq("external_transaction_id", transactionId);

  // Coluna ausente (migration 045 pendente) não derruba a resposta — só
  // significa que essa reversão não fica registrada até a migration rodar.
  if (error) console.error(`[eduzz webhook] falha ao marcar ${status}:`, error.message);

  return NextResponse.json({ received: true, status });
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

  // Reembolso/chargeback: atualiza o status da venda já gravada, não cria
  // nada novo. Só o formato moderno manda esses eventos.
  if (isModernPayload(body)) {
    const modernBody = body as EduzzModernPayload;
    const reversalStatus = modernBody.event ? REVERSAL_EVENTS[modernBody.event] : undefined;
    if (reversalStatus) {
      return handleReversal(db, companyId, modernBody, reversalStatus);
    }
  }

  const sale = isModernPayload(body) ? parseModernPayload(body as EduzzModernPayload) : parseLegacyPayload(body);
  if ("ignored" in sale) {
    return NextResponse.json({ received: true, ignored: sale.ignored });
  }

  if (isInstallmentContinuation(sale)) {
    return NextResponse.json({ received: true, ignored: `parcela ${sale.installmentNumber} (já contamos a venda na parcela 1)` });
  }

  if (await alreadyProcessed(db, companyId, sale.transactionId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Renovação de assinatura: guarda a receita (campaign_metrics + events_log
  // "Renewal", pra relatório futuro de MRR/LTV) mas NUNCA manda pra Meta —
  // só a 1ª cobrança é "venda nova" pra fins de otimização de campanha.
  if (sale.recurrenceKey && (await isKnownRecurrence(db, companyId, sale.recurrenceKey))) {
    try {
      await recordRenewal(db, companyId, sale);
    } catch (err) {
      console.error("[eduzz webhook] falha ao registrar renovação:", err instanceof Error ? err.message : err);
    }
    return NextResponse.json({ received: true, renewal: true, produto: sale.productName, revenue: sale.value });
  }

  await upsertCampaignMetrics(db, companyId, sale);

  // Purchase em events_log + Meta CAPI nunca pode derrubar a resposta —
  // se a Eduzz não receber 200 rápido, ela reenfileira a notificação.
  try {
    await recordSale(db, companyId, sale);
  } catch (err) {
    console.error("[eduzz webhook] falha ao registrar Purchase:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ received: true, produto: sale.productName, date: sale.date, revenue: sale.value });
}
