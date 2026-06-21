import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hashLower, hashPhone, hashNormalized } from "@/lib/metaHash";
import { insertEventsLogRow } from "@/lib/eventsLogInsert";
import { sendMetaCapiEvent } from "@/lib/metaCapi";
import { resolvePixelById, type ResolvedPixel } from "@/lib/resolvePixel";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

// Mapa de país → ISO-2 (a Meta espera código de 2 letras hasheado; a Eduzz
// manda "Brasil"/"Brazil"/"BR"/"US"/null sem padrão). Sem normalizar, o hash
// de "brazil" não casa com o que a Meta espera (derruba o Event Match Quality)
// e a bandeira no dashboard quebra (espera ISO-2). Já-ISO-2 passa direto;
// nome conhecido vira o código; desconhecido vira null (melhor que hash errado).
const COUNTRY_TO_ISO2: Record<string, string> = {
  brasil: "BR", brazil: "BR",
  "estados unidos": "US", "united states": "US", usa: "US", eua: "US",
  portugal: "PT", argentina: "AR", chile: "CL", colombia: "CO", mexico: "MX",
  paraguai: "PY", paraguay: "PY", uruguai: "UY", uruguay: "UY", peru: "PE",
  espanha: "ES", spain: "ES",
};

function normalizeCountry(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^[a-z]{2}$/i.test(trimmed)) return trimmed.toUpperCase();
  const key = trimmed
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return COUNTRY_TO_ISO2[key] ?? null;
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
  /** Valor CHEIO da venda — em boleto parcelado já vem multiplicado por `installments` (migration 053+052: ver `invoiceValue` abaixo pra valor só dessa fatura/parcela). */
  value: number;
  /** Valor só DESSA fatura/notificação, sem multiplicar nada — em boleto parcelado é o valor de 1 parcela; nos outros casos é igual a `value` (não há multiplicação). Usado pra gravar parcelas 2+ com o valor certo (não o total). */
  invoiceValue: number;
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
  /** data.installments (campo RAIZ, genérico — não é bankSlipInstallment) — "Número de parcelas" segundo a doc da Eduzz, sem mais detalhe sobre a relação com boleto/PSL/cartão. Só captura pra investigar com dado real (migration 051), não usa pra calcular nada ainda — não confundir com `installments` acima (esse é só de boleto parcelado, já usado pra exibição). */
  totalInstallmentsRaw: number | null;
  /** data.contract.isUnlimitedInstallments — flag da Eduzz pro modo PSL (parcelamento sem exigir limite cheio do cartão na 1ª parcela; "sem limite" é do CARTÃO, não da duração — o contrato tem nº de parcelas finito mesmo assim). Só captura (migration 051). */
  contractUnlimitedInstallments: boolean | null;
}

function parseLegacyPayload(body: RawPayload): SaleEvent | { ignored: string } {
  const status = String(pick(body, "trans_status", "status", "trans_statusmessage") ?? "").toLowerCase();
  if (status && !PAID_STATUSES.has(status)) return { ignored: `status=${status}` };

  const value = toNumber(pick(body, "trans_paid", "trans_value", "trans_paidvalue", "value", "amount"));
  if (value <= 0) return { ignored: "sem valor" };

  return {
    transactionId: String(pick(body, "trans_cod", "trans_orderid", "trans_key") ?? `legacy-${Date.now()}`),
    value,
    invoiceValue: value, // postback antigo não tem boleto parcelado detectável, nunca multiplica
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
    totalInstallmentsRaw: null,
    contractUnlimitedInstallments: null,
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
    /** Presente quando o produto é uma assinatura/contrato recorrente — `id` repete em toda renovação. NÃO tem campo de nº de parcelas aqui (isso existe só nos webhooks contract_created/contract_updated, schema diferente) — pra invoice_paid, o nº de parcelas geral vem do campo `installments` raiz abaixo. */
    contract?: { id?: string; isUnlimitedInstallments?: boolean };
    /** Campo raiz, genérico pra QUALQUER forma de pagamento (não é exclusivo de boleto) — "Número de parcelas". Doc da Eduzz não detalha a relação com bankSlipInstallment/PSL, só captura pra investigar com dado real (migration 051). */
    installments?: number;
    /** Presente quando o pagamento é boleto parcelado — cada parcela paga manda seu próprio invoice_paid. */
    bankSlipInstallment?: { installmentNumber?: number; totalInstallments?: number };
    /** Order bump: o produto extra do checkout chega como notificação invoice_paid própria (próprio transaction.id/price), não dentro do payload da venda principal — `isMainSale: false` identifica essa fatura como o bump, `mainSaleId` referencia o transaction.id da venda principal. */
    orderBump?: { has?: boolean; isMainSale?: boolean; mainSaleId?: number | string | null };
  };
}

// ─── Eventos de contrato (myeduzz.contract_created/contract_updated) ──────────
//
// Schema BEM diferente do invoice_paid: tem `data.customer` (não `data.buyer`),
// e é o ÚNICO lugar onde vem o nº de parcelas contratadas + se o contrato tem
// fim definido. "Ficha do contrato" guardada em `eduzz_contracts` (migration
// 052), consultada depois em cada invoice_paid pelo `contract.id` (=
// recurrence_key) pra saber quanto multiplicar — ver `findContractInfo()`.
interface EduzzContractPayload {
  event?: string;
  data?: {
    /** email do comprador — junto com `products[0].id`, é o que permite achar de volta o contrato certo quando uma venda chega "órfã" (ver `findContractByCustomerAndProduct`). Schema próprio desse evento, não confundir com `data.buyer` do invoice_paid. */
    customer?: { email?: string };
    /** produto vendido nesse contrato — `products[0].id` é o mesmo valor de `items[0].productId` no invoice_paid correspondente. */
    products?: { id?: string }[];
    contract?: {
      id?: string;
      /** "sem limite" é sobre o LIMITE DO CARTÃO do comprador (não precisa do valor cheio disponível na 1ª cobrança) — não sobre a duração do contrato. O nº de parcelas é finito mesmo com isso true (confirmado na doc de ajuda da Eduzz). */
      isUnlimitedInstallments?: boolean;
      recurrence?: {
        /** true = contrato tem fim definido (PSL ou prazo fixo) — dá pra multiplicar price × charges.total. false = assinatura aberta (cancela quando quiser), sem total fixo. */
        isFinite?: boolean;
        price?: { value?: number; currency?: string };
        /** nº de cobranças recorrentes — current = cobrança atual (1-based), total = total contratado. NÃO confundir com `contract.payment.installments` (forma de pagamento da cobrança em si, ex.: pix à vista = 1). */
        charges?: { current?: number; total?: number };
        /** janela de vigência do contrato — usada (junto com email+produto) pra desambiguar quando o mesmo comprador reassinou o MESMO produto mais de 1 vez ao longo do tempo (2 contratos diferentes, mesmo email+produto). */
        startsAt?: string;
        finishesAt?: string;
      };
    };
  };
}

const CONTRACT_EVENTS = new Set(["myeduzz.contract_created", "myeduzz.contract_updated"]);
// Colunas das migrations 055/056 — eduzz_contracts pode ainda não ter
// recebido a migration mais recente; remove a 1ª que o erro do Postgres
// mencionar e tenta de novo, até não sobrar nenhuma conhecida (mesmo padrão
// de OPTIONAL_COLUMN_GROUPS de insertEventsLogRow, só que coluna por coluna
// em vez de grupo, porque cada uma é independente/de migration própria).
const OPTIONAL_CONTRACT_COLUMNS = ["current_charge", "customer_email", "product_id", "starts_at", "finishes_at"];

async function upsertContractInfo(db: SupabaseClient, companyId: string, body: EduzzContractPayload): Promise<void> {
  const contract = body.data?.contract;
  if (!contract?.id) return;

  const total = contract.recurrence?.charges?.total ?? null;
  const isFinite = contract.recurrence?.isFinite ?? null;
  const current = contract.recurrence?.charges?.current ?? null;
  const chargeValue = contract.recurrence?.price?.value ?? null;
  const customerEmail = body.data?.customer?.email?.trim().toLowerCase() ?? null;
  const productId = body.data?.products?.[0]?.id ?? null;
  const startsAt = contract.recurrence?.startsAt ?? null;
  const finishesAt = contract.recurrence?.finishesAt ?? null;

  const contractRow: Record<string, unknown> = {
    company_id: companyId,
    contract_id: contract.id,
    total_installments: total,
    is_finite: isFinite,
    is_unlimited_installments: contract.isUnlimitedInstallments ?? null,
    charge_value: chargeValue,
    currency: contract.recurrence?.price?.currency ?? null,
    current_charge: current,
    customer_email: customerEmail,
    product_id: productId,
    starts_at: startsAt,
    finishes_at: finishesAt,
  };
  let { error } = await db.from("eduzz_contracts").upsert(contractRow, { onConflict: "company_id,contract_id" });
  // migrations 055/056 podem ainda não ter rodado no Supabase — mesmo padrão
  // de resiliência de insertEventsLogRow: regrava sem a(s) coluna(s) nova(s)
  // em vez de perder a ficha inteira do contrato. Loop porque o Postgres só
  // reporta 1 coluna ausente por vez — se mais de uma migration estiver
  // pendente, precisa de mais de 1 retry.
  while (error) {
    const missingCol = OPTIONAL_CONTRACT_COLUMNS.find((col) => col in contractRow && error?.message?.includes(col));
    if (!missingCol) break;
    delete contractRow[missingCol];
    ({ error } = await db.from("eduzz_contracts").upsert(contractRow, { onConflict: "company_id,contract_id" }));
  }
  if (error) console.error("[eduzz webhook] falha ao gravar eduzz_contracts:", error.message);

  // Resolve a RACE: a Eduzz não garante ordem de entrega, então o invoice_paid
  // da 1ª cobrança pode chegar ANTES do contract_created/updated. Quando isso
  // acontece, recordSale() já gravou a Purchase com o valor da cobrança (não o
  // do contrato) e installments null. Agora que a ficha chegou, corrige
  // retroativamente as linhas dessa assinatura. (Não reenvia pra Meta — o
  // evento da 1ª cobrança já foi; corrige só dashboard/relatório.)
  await backfillContractValues(db, companyId, contract.id, total, isFinite, current, chargeValue, customerEmail, productId, startsAt, finishesAt);
}

// Backfill retroativo das linhas já gravadas de uma assinatura, quando a ficha
// do contrato (nº de parcelas) só chega depois da 1ª cobrança. Defensivo:
// tolera coluna/linha ausente, nunca lança (é best-effort de exibição).
async function backfillContractValues(
  db: SupabaseClient,
  companyId: string,
  contractId: string,
  total: number | null,
  isFinite: boolean | null,
  current: number | null,
  chargeValue: number | null,
  customerEmail: string | null,
  productId: string | null,
  startsAt: string | null,
  finishesAt: string | null,
): Promise<void> {
  // Cura venda ÓRFÃ (recurrence_key NULL) que deveria pertencer a esse
  // contrato — caso o invoice_paid tenha chegado ANTES da ficha E sem
  // contract.id (os 2 problemas juntos; se a ficha já existia quando a venda
  // chegou, quem cura é findContractByCustomerAndProduct() direto no POST).
  // Roda INDEPENDENTE de total/isFinite — vincular o recurrence_key certo já
  // vale a pena mesmo sem saber o total ainda; as correções de valor/parcelas
  // abaixo, depois de vinculado (.eq("recurrence_key", contractId) volta a
  // achar essa linha), terminam o resto. Só cura quando exatamente 1 órfã
  // bate email+produto+vigência — nunca adivinha (mesmo critério de sempre).
  // Deliberado NÃO curar todas de uma vez quando há 2+ órfãs do mesmo
  // contrato (cobranças seguidas que TODAS chegaram sem contract.id, antes da
  // ficha existir): `purchaseRes` mais abaixo espera NO MÁXIMO 1 linha
  // "Purchase" por recurrence_key (`.maybeSingle()`) — curar todas ia exigir
  // também reclassificar as demais pra "Renewal" em ordem cronológica, risco
  // de corromper dado pra um caso composto raríssimo. Fica sem curar (estado
  // atual, sem piorar nada) até alguém revisar manualmente.
  if (customerEmail && productId) {
    const orphanRes = await db
      .from("events_log")
      .select("id, created_at")
      .eq("company_id", companyId)
      .eq("event_name", "Purchase")
      .is("recurrence_key", null)
      .ilike("lead_email", customerEmail)
      .eq("product_item_id", productId);
    if (!orphanRes.error && orphanRes.data) {
      const orphanCandidates = (orphanRes.data as { id: string; created_at: string }[]).filter((row) => {
        const t = new Date(row.created_at).getTime();
        const startsOk = !startsAt || new Date(startsAt).getTime() <= t;
        const finishesOk = !finishesAt || new Date(finishesAt).getTime() >= t;
        return startsOk && finishesOk;
      });
      if (orphanCandidates.length === 1) {
        await db.from("events_log").update({ recurrence_key: contractId }).eq("id", orphanCandidates[0].id);
      }
    }
  }

  if (!isFinite || !total || total <= 1) return;

  // Total de parcelas pra EXIBIÇÃO em todas as linhas da assinatura que ainda
  // não tinham (gravadas antes da ficha existir).
  const fillRes = await db
    .from("events_log")
    .update({ installments: total })
    .eq("company_id", companyId)
    .eq("recurrence_key", contractId)
    .is("installments", null);
  if (fillRes.error) {
    console.error("[eduzz webhook] backfill installments:", fillRes.error.message);
    return;
  }

  // A 1ª cobrança (Purchase) deveria mostrar o valor CHEIO do contrato. Se foi
  // gravada antes da ficha, ficou com o valor da cobrança (value ===
  // installment_value, ou seja, sem multiplicação). Recalcula só nesse caso —
  // nunca toca em Renewal (cuja `value` É a receita real daquela cobrança).
  const purchaseRes = await db
    .from("events_log")
    .select("id, value, installment_value")
    .eq("company_id", companyId)
    .eq("recurrence_key", contractId)
    .eq("event_name", "Purchase")
    .maybeSingle();

  const purchase = purchaseRes?.data as { id: string; value: number; installment_value: number | null } | null | undefined;
  if (purchase?.installment_value != null && Number(purchase.value) === Number(purchase.installment_value)) {
    // Mesma lógica de recordSale()/displayValue: ofertas com "1ª parcela com
    // desconto" têm `installment_value` (cobrança real, promocional) diferente
    // de `chargeValue` (preço normal das demais parcelas, ficha do contrato) —
    // multiplicar `installment_value × total` direto subestima o valor real do
    // contrato. Com `chargeValue` conhecido, assume só ESSA cobrança como a
    // "diferente"; sem ele, cai pro cálculo antigo (aproximação).
    const correctedValue =
      chargeValue != null ? Number(purchase.installment_value) + (total - 1) * chargeValue : Number(purchase.installment_value) * total;
    await db.from("events_log").update({ value: correctedValue }).eq("id", purchase.id);
  }

  // `installment_number` da linha mais recente pode estar DESATUALIZADO: ele é
  // contado pelas linhas já gravadas (countRecurrenceCharges), mas a Eduzz não
  // garante entrega de TODAS as cobranças — se uma renovação no meio do caminho
  // não chegou como webhook, a contagem fica atrasada pra sempre. `charges.current`
  // do contract_updated é a verdade da Eduzz nesse instante; corrige só a linha
  // mais recente (as anteriores já refletem a numeração real de quando foram
  // gravadas, não deve reescrever histórico).
  // SÓ AUMENTA, nunca rebaixa: a Eduzz não garante ordem entre
  // contract_updated e invoice_paid, então esse `current` pode ser de um
  // contract_updated ATRASADO (de uma cobrança anterior) chegando depois de já
  // termos gravado (via Math.max em recordRenewal) um número mais avançado.
  if (current && current >= 1) {
    const latestRes = await db
      .from("events_log")
      .select("id, installment_number")
      .eq("company_id", companyId)
      .eq("recurrence_key", contractId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const latest = latestRes?.data as { id: string; installment_number: number | null } | null | undefined;
    if (latest && (latest.installment_number ?? 0) < current) {
      await db.from("events_log").update({ installment_number: current }).eq("id", latest.id);
    }
  }
}

// Consultada em recordSale()/recordRenewal() pra saber o valor CHEIO (total de
// parcelas) e a cobrança ATUAL ("current_charge", migration 055) de uma venda
// recorrente (assinatura/PSL). `total` só vem quando o contrato tem fim
// definido E nº de parcelas conhecido; `current` vem direto do último
// contract_created/updated processado (mais confiável que contar linhas — ver
// `current_charge` abaixo). Sem ficha pra esse contractId ainda (ou coluna
// migration 055 não rodada), devolve os 2 null — chamador cai pro
// comportamento de sempre (valor da cobrança normal / contar linhas).
async function findContractInfo(
  db: SupabaseClient,
  companyId: string,
  contractId: string,
): Promise<{ total: number | null; current: number | null; chargeValue: number | null }> {
  let { data, error } = await db
    .from("eduzz_contracts")
    .select("total_installments, is_finite, current_charge, charge_value")
    .eq("company_id", companyId)
    .eq("contract_id", contractId)
    .maybeSingle();
  // migration 055 (current_charge/charge_value) pode ainda não ter rodado —
  // sem isso, o SELECT inteiro falha e a gente perdia até o `total` (que já
  // funcionava antes dessas colunas existirem). Regrava sem elas em vez de
  // regredir.
  if (error?.message?.includes("current_charge") || error?.message?.includes("charge_value")) {
    ({ data, error } = await db
      .from("eduzz_contracts")
      .select("total_installments, is_finite")
      .eq("company_id", companyId)
      .eq("contract_id", contractId)
      .maybeSingle());
  }
  if (error || !data) return { total: null, current: null, chargeValue: null };
  return {
    total: data.is_finite && data.total_installments ? (data.total_installments as number) : null,
    current: (data as { current_charge?: number | null }).current_charge ?? null,
    chargeValue: (data as { charge_value?: number | null }).charge_value ?? null,
  };
}

// "Cura" de venda recorrente que chegou ÓRFÃ — a Eduzz às vezes manda
// myeduzz.invoice_paid com `contract: null` mesmo pra produto recorrente cujo
// contrato já existe (confirmado com payload real, bug de dados do lado da
// Eduzz, não falha de ordem de entrega). Sem recurrence_key a venda nunca é
// reconhecida como renovação — só como "venda nova" (dobra conversão,
// renovação vira "1ª compra" pra Meta). Tenta achar o contrato certo por
// email+produto, mas SÓ aplica quando isso resulta em EXATAMENTE 1 candidato
// — nunca adivinha. Email sozinho seria ambíguo (mesmo cliente pode ter N
// assinaturas de produtos diferentes); produto sozinho idem (mesmo produto,
// N clientes). Quando a ficha tem `starts_at`/`finishes_at` (migration 056),
// também exige que a data da fatura caia dentro da vigência — desambigua o
// caso de o mesmo cliente reassinar o MESMO produto em períodos diferentes
// (2 contratos, mesmo email+produto, vigências que não se sobrepõem).
async function findContractByCustomerAndProduct(
  db: SupabaseClient,
  companyId: string,
  email: string,
  productId: string,
  invoiceDateIso: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("eduzz_contracts")
    .select("contract_id, starts_at, finishes_at")
    .eq("company_id", companyId)
    .eq("customer_email", email.trim().toLowerCase())
    .eq("product_id", productId);
  if (error || !data) return null;

  const invoiceTime = new Date(invoiceDateIso).getTime();
  const candidates = (data as { contract_id: string; starts_at: string | null; finishes_at: string | null }[]).filter((c) => {
    const startsOk = !c.starts_at || new Date(c.starts_at).getTime() <= invoiceTime;
    const finishesOk = !c.finishes_at || new Date(c.finishes_at).getTime() >= invoiceTime;
    return startsOk && finishesOk;
  });

  return candidates.length === 1 ? candidates[0].contract_id : null;
}

// Fallback de countRecurrenceCharges() — conta quantas linhas (Purchase +
// Renewal) já existem com esse recurrence_key e soma 1, pra numerar a cobrança
// atual quando a ficha do contrato ainda não tem `current_charge` conhecido
// (contract_created/updated nunca chegou, ou chegou só DEPOIS dessa venda).
// Subestima se alguma cobrança anterior nunca chegou como webhook — por isso
// `findContractInfo().current` é preferido quando disponível (ver recordRenewal).
// Sem migration 042 (recurrence_key) rodada, o erro vira `data: null` e devolve
// 0 — mesma resiliência de sempre, não trava a venda.
async function countRecurrenceCharges(db: SupabaseClient, companyId: string, recurrenceKey: string): Promise<number> {
  const { data, error } = await db.from("events_log").select("id").eq("company_id", companyId).eq("recurrence_key", recurrenceKey);
  if (error || !data) return 0;
  return (data as unknown[]).length;
}

function isModernPayload(body: RawPayload): boolean {
  return typeof body.event === "string" && typeof body.data === "object" && body.data !== null && "buyer" in (body.data as object);
}

function parseModernPayload(body: EduzzModernPayload): SaleEvent | { ignored: string } {
  if (body.event !== "myeduzz.invoice_paid") return { ignored: `event=${body.event ?? "desconhecido"}` };
  const data = body.data ?? {};
  // price/paid: confirmado na doc oficial da Eduzz que os 2 são "valor da
  // FATURA", não da compra inteira — em boleto parcelado, cada parcela é uma
  // fatura própria, então os 2 trazem só o valor daquela parcela (engano
  // anterior: code comment dizia que "price" já era o valor cheio, não é).
  // Sempre usar price primeiro só porque diverge de paid em caso de
  // desconto/parcial dentro da MESMA fatura — não resolve parcelamento.
  const invoiceValue = toNumber(data.price?.value ?? data.paid?.value);
  if (invoiceValue <= 0) return { ignored: "sem valor" };
  // Boleto parcelado: cada parcela paga manda seu próprio invoice_paid com o
  // valor só daquela parcela — multiplica pelo nº de parcelas pra chegar no
  // valor cheio da compra. Seguro fazer aqui (e não só na parcela 1) porque
  // parcela > 1 é descartada por isInstallmentContinuation() antes de usar
  // esse `value` pra qualquer coisa — não tem risco de somar em dobro.
  const totalInstallments = data.bankSlipInstallment?.totalInstallments;
  const value = totalInstallments && totalInstallments > 1 ? invoiceValue * totalInstallments : invoiceValue;
  const productName = data.items?.[0]?.name?.trim() || "Eduzz";

  return {
    transactionId: data.transaction?.id || data.transaction?.key || `modern-${Date.now()}`,
    value,
    invoiceValue,
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
    totalInstallmentsRaw: data.installments ?? null,
    contractUnlimitedInstallments: data.contract?.isUnlimitedInstallments ?? null,
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

// Catálogo Eduzz: produto (parentId, vínculo de pixel mora aqui) → ofertas
// (productId, 1 por preço/parcelamento do mesmo produto — migration 050).
// 100% auto-preenchido a cada venda, sem precisar de nenhum cadastro manual
// pra o produto aparecer na tela de configuração.
async function upsertProductCatalog(db: SupabaseClient, companyId: string, sale: SaleEvent): Promise<void> {
  if (!sale.productParentId) return; // postback antigo não manda itens estruturados — sem catálogo possível.

  // Nome provisório = título da oferta (até o usuário renomear) — só na 1ª
  // vez que esse produto aparece; updates seguintes NUNCA sobrescrevem um
  // nome que o usuário já possa ter customizado (por isso ignoreDuplicates).
  await db
    .from("eduzz_products")
    .upsert(
      { company_id: companyId, parent_id: sale.productParentId, name: sale.productName },
      { onConflict: "company_id,parent_id", ignoreDuplicates: true },
    );

  const offerId = sale.items[0]?.productId;
  if (offerId) {
    // Oferta é só leitura pra UI — sempre seguro atualizar o nome (nunca é
    // editado manualmente, não tem customização do usuário pra perder).
    await db
      .from("eduzz_product_offers")
      .upsert(
        { company_id: companyId, parent_id: sale.productParentId, product_id: offerId, name: sale.productName },
        { onConflict: "company_id,product_id" },
      );
  }
}

async function findProductPixelId(db: SupabaseClient, companyId: string, parentId: string | null): Promise<string | null> {
  if (!parentId) return null;
  const { data, error } = await db.from("eduzz_products").select("pixel_id").eq("company_id", companyId).eq("parent_id", parentId).maybeSingle();
  // Migration 050 pendente, produto nunca visto, ou visto mas sem pixel escolhido ainda.
  if (error || !data?.pixel_id) return null;
  return data.pixel_id as string;
}

// Mesma fórmula usada nas 3 "famílias" de venda (Purchase/Renewal/Installment)
// — é o que decide em qual "visitante" do histórico essa linha aparece
// agrupada. Usar `sale.email`/`sale.phone` (não o transactionId sozinho) é o
// que garante que renovação/parcela da MESMA pessoa caia no MESMO histórico
// que a 1ª compra, mesmo com transactionId diferente em cada notificação.
function computeFingerprintId(match: VisitMatch | null, sale: SaleEvent): string {
  return (
    match?.fingerprint_id ||
    sale.trackerCode ||
    createHash("sha256").update(sale.email || sale.phone || sale.transactionId).digest("hex")
  );
}

async function recordSale(db: SupabaseClient, companyId: string, sale: SaleEvent) {
  const match = await resolveVisitMatch(db, companyId, sale);
  await upsertProductCatalog(db, companyId, sale);

  const fingerprintId = computeFingerprintId(match, sale);

  // Pixel SEMPRE vem do catálogo (escolha deliberada do usuário, produto →
  // pixel) — decisão confirmada com o usuário: nenhuma venda manda pra Meta
  // sem o produto ter um pixel escolhido explicitamente. Não cai mais pra
  // visita correlacionada nem pro "pixel padrão" da empresa — sem isso, o
  // dado entrava na Meta meio "no escuro" antes do usuário decidir conscientemente.
  const productPixelId = await findProductPixelId(db, companyId, sale.productParentId);
  const resolvedPixel: ResolvedPixel = productPixelId
    ? await resolvePixelById(db, companyId, productPixelId)
    : { companyId, pixelId: null, meta_pixel_id: null, meta_capi_token: null, dominio_autorizado: null, meta_test_event_code: null };
  const metaConfigured = Boolean(resolvedPixel.meta_pixel_id && resolvedPixel.meta_capi_token);

  // Endereço da Eduzz (data.buyer.address) é o endereço real do comprador
  // nessa compra — mais confiável que o geo-IP da visita (que pode ser de
  // semanas atrás, rede diferente, ou a Vercel não ter resolvido o IP). Visita
  // correlacionada só preenche o que a Eduzz não mandou (postback antigo sem
  // endereço, ou formato moderno com algum campo do address vazio).
  // País normalizado pra ISO-2 (a Eduzz manda "Brasil"/"Brazil" sem padrão; a
  // visita já vem ISO-2 do geo-IP da Vercel) — sem isso o hash de country não
  // casa na Meta e a bandeira do dashboard quebra.
  const country = normalizeCountry(sale.address.country) ?? (match?.country as string | null);
  const countryRegion = sale.address.state ?? (match?.country_region as string | null);
  const city = sale.address.city ?? (match?.city as string | null);
  const postalCode = sale.address.zip ?? (match?.postal_code as string | null);
  const fbp = (match?.fbp as string | null) ?? null;
  const fbc = (match?.fbc as string | null) ?? null;
  // IP/UA da visita correlacionada (migration 047) — sinais fortes de match
  // reaproveitados na Purchase. Sem match, ficam null (venda sem navegador).
  const clientIp = (match?.client_ip_address as string | null) ?? null;
  const clientUserAgent = (match?.client_user_agent as string | null) ?? null;

  // Assinatura/PSL: sale.value aqui é só o valor DESSA cobrança (ex.: R$10) —
  // upsertCampaignMetrics() (chamado MAIS ABAIXO, depois do insert em
  // events_log, por idempotência) soma esse valor real na receita mensal,
  // então NÃO reatribuímos sale.value (ia dobrar a contagem quando as
  // renovações seguintes somarem de novo). Em vez
  // disso, calcula um valor separado SÓ pra mostrar no card da venda e mandar
  // pra Meta na 1ª cobrança — "esse contrato vale R$120 (12x de R$10)", sem
  // tocar na receita mensal que já está certa. Sem contrato conhecido (não
  // recorrente, ou contract_created/updated nunca chegou pra esse contractId),
  // cai pro valor normal — comportamento de sempre, sem inventar total.
  const contractInfo = sale.recurrenceKey
    ? await findContractInfo(db, companyId, sale.recurrenceKey)
    : { total: null, current: null, chargeValue: null };
  const contractTotalInstallments = contractInfo.total;
  // Bug real confirmado em produção: ofertas com "1ª parcela com desconto"
  // (ex.: 50% off só na 1ª) têm `sale.value` (valor cobrado AGORA) diferente
  // do `charge_value` da ficha (preço normal das demais parcelas) —
  // `sale.value * total` superestimava ou (mais comum) subestimava muito o
  // valor real do contrato (ex.: 19x de R$197 com a 1ª a R$98,50: o cálculo
  // antigo dava R$1.871,50 em vez dos R$3.644,50 reais). Quando a ficha tem
  // `charge_value` e ele difere do valor cobrado nessa fatura, assume que só
  // ESSA cobrança é a "diferente" (promoção pontual) e as outras `total - 1`
  // valem o preço normal; sem `charge_value` conhecido, cai pro cálculo
  // antigo (aproximação, melhor que nada).
  const displayValue = !contractTotalInstallments
    ? sale.value
    : contractInfo.chargeValue != null
      ? sale.value + (contractTotalInstallments - 1) * contractInfo.chargeValue
      : sale.value * contractTotalInstallments;

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
    // Itemização da venda, pra relatório futuro (ex.: receita por oferta) —
    // o catálogo (eduzz_products/eduzz_product_offers, migration 050) é a
    // fonte de verdade pra UI/resolução de pixel; isso aqui é só o "log" por venda.
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
    value: displayValue,
    currency: sale.currency,
    external_transaction_id: sale.transactionId,
    source: EDUZZ_SOURCE,
    payment_method: sale.paymentMethod,
    // Total de parcelas pra EXIBIÇÃO: vem de `sale.installments` (boleto
    // parcelado, bankSlipInstallment) OU da ficha do contrato (assinatura/PSL,
    // `contractTotalInstallments` já calculado acima pro displayValue) — os 2
    // nunca coexistem na mesma venda, então não tem ambiguidade em usar um só campo.
    installments: sale.installments ?? contractTotalInstallments,
    // Parcela 1 (boleto OU 1ª cobrança de assinatura) também grava
    // `installment_number` (=1), pra simetria com as linhas "Installment"/
    // "Renewal" das parcelas/cobranças seguintes — um dashboard futuro pode
    // juntar tudo (`external_transaction_id = X OR main_sale_transaction_id =
    // X OR recurrence_key = X`) e ordenar por `installment_number` sem
    // tratamento especial pra parcela 1.
    // `contractInfo.current` (ficha do contrato, migration 055) é preferido ao
    // "sempre 1": se essa é a 1ª venda que CAPTURAMOS desse contrato mas a
    // Eduzz já está na cobrança 13 (cobranças anteriores nunca chegaram como
    // webhook — caso real visto em produção), o nº certo é 13, não 1.
    installment_number: sale.installmentNumber ?? contractInfo.current ?? (sale.recurrenceKey ? 1 : null),
    // Valor SÓ dessa parcela/cobrança (migration 054) — diferente de `value`
    // (acima) quando a venda é parcelada: `value` já é o total multiplicado,
    // `invoiceValue` é cru, sem multiplicar nada (pra boleto, o que essa 1ª
    // parcela realmente cobrou; pra assinatura sem multiplicação nenhuma
    // acontecendo em `sale.value`, os 2 acabam iguais).
    installment_value: sale.invoiceValue,
    is_order_bump: sale.isOrderBump,
    main_sale_transaction_id: sale.mainSaleTransactionId,
    fbp,
    fbc,
    client_ip_address: clientIp,
    client_user_agent: clientUserAgent,
    total_installments_raw: sale.totalInstallmentsRaw,
    contract_unlimited_installments: sale.contractUnlimitedInstallments,
  });

  if (insertError || !inserted) {
    console.error("[eduzz webhook] falha ao gravar events_log:", insertError?.message);
    return;
  }

  // Receita só é contabilizada DEPOIS da linha de events_log existir — ela é a
  // âncora de idempotência (`alreadyProcessed`). Se as métricas fossem somadas
  // antes do insert e o insert falhasse, um retry da Eduzz (alreadyProcessed
  // ainda false, sem linha) somaria a receita 2x. Insert-primeiro garante que
  // qualquer retry cai no caminho de duplicado e não conta de novo.
  await upsertCampaignMetrics(db, companyId, sale);

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
        // Valor CHEIO (já multiplicado pelo nº de parcelas do contrato, quando
        // conhecido — ver displayValue acima) — decisão explícita: a Meta deve
        // saber o valor real do negócio na 1ª cobrança, não só a 1ª parcela,
        // mesmo que isso reporte mais receita do que já entrou de fato nessa
        // cobrança (ajuda a otimização de campanha a achar compradores de
        // ticket alto; não afeta campaign_metrics, que mede receita REALIZADA).
        value: displayValue,
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

// Acumula no dia/produto: lê a linha existente, soma e faz upsert.
// `countConversion`: venda nova (Purchase) conta como conversão; renovação de
// assinatura entra como RECEITA mas NÃO como conversão nova (senão o número de
// conversões infla a cada cobrança recorrente — uma renovação não é uma venda
// nova pra fins de relatório/otimização).
async function upsertCampaignMetrics(db: SupabaseClient, companyId: string, sale: SaleEvent, countConversion = true): Promise<void> {
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
    conversions: Number(existing?.conversions ?? 0) + (countConversion ? 1 : 0),
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
  // Mesma correlação de visita que recordSale() faz — sem isso, o fingerprint
  // calculado aqui (antes: sale.recurrenceKey || transactionId) não batia com
  // o fingerprint da 1ª cobrança, e a renovação aparecia como um "visitante"
  // separado no histórico em vez de cair junto com o resto das compras da
  // mesma pessoa.
  const match = await resolveVisitMatch(db, companyId, sale);
  const fingerprintId = computeFingerprintId(match, sale);

  // Mesma ficha do contrato que recordSale() consulta (total de parcelas, se
  // conhecido) — aqui só pra exibição, não muda o valor (renovação sempre usa
  // sale.value, o valor real dessa cobrança). chargeNumber usa o MAIOR entre
  // `contractInfo.current` (ficha) e a contagem de linhas+1: a Eduzz NÃO
  // garante ordem entre contract_updated e invoice_paid da MESMA cobrança —
  // se o contract_updated dessa cobrança ainda não chegou, a ficha pode estar
  // mostrando o nº da cobrança ANTERIOR (atrasada), e nesse caso a contagem de
  // linhas (que captura toda cobrança sem gap) já está mais avançada que a
  // ficha. Math.max cobre os 2 sentidos do race sem nunca subestimar.
  const contractInfo = sale.recurrenceKey
    ? await findContractInfo(db, companyId, sale.recurrenceKey)
    : { total: null, current: null, chargeValue: null };
  const contractTotalInstallments = contractInfo.total;
  const chargeNumber = sale.recurrenceKey
    ? Math.max(contractInfo.current ?? 0, (await countRecurrenceCharges(db, companyId, sale.recurrenceKey)) + 1)
    : null;

  const { error } = await insertEventsLogRow(db, {
    company_id: companyId,
    event_name: "Renewal",
    fingerprint_id: fingerprintId,
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
    installments: sale.installments ?? contractTotalInstallments,
    installment_number: chargeNumber,
    // Renovação nunca multiplica nada — `value` já É o valor dessa cobrança,
    // igual a `installment_value` (mantido só pra simetria de leitura no
    // dashboard: sempre ler `installment_value` pra "valor dessa parcela",
    // independente do event_name).
    installment_value: sale.value,
    total_installments_raw: sale.totalInstallmentsRaw,
    contract_unlimited_installments: sale.contractUnlimitedInstallments,
  });

  // Receita só DEPOIS da linha existir (mesma idempotência do recordSale) e
  // sem contar conversão nova — renovação é receita recorrente, não venda nova.
  if (!error) await upsertCampaignMetrics(db, companyId, sale, false);
}

// Cada parcela de boleto parcelado manda seu próprio invoice_paid com o
// próprio transaction.id — a doc da Eduzz não garante se esse id repete ou
// não entre parcelas da mesma venda (não documentado), então usamos uma
// chave SINTÉTICA própria (nunca colide com o id de nenhuma parcela, seja
// repetido ou não do lado da Eduzz) tanto pra idempotência quanto pra
// gravar a linha.
function installmentTransactionId(sale: SaleEvent): string {
  return `${sale.transactionId}-parcela-${sale.installmentNumber}`;
}

// Parcela > 1 de boleto parcelado (`isInstallmentContinuation()`) NÃO é venda
// nova — o valor CHEIO já foi contado por completo na parcela 1 (recordSale,
// `value` já multiplicado). Mas é dado de pagamento real, útil pra um
// dashboard futuro de progresso/inadimplência ("3 de 3 parcelas pagas") — por
// isso grava uma linha própria em vez de ignorar 100% como antes. NUNCA soma
// em campaign_metrics (já somou o total na parcela 1 — somar aqui de novo
// dobraria a receita) nem manda pra Meta (não é conversão nova, mesma lógica
// de recordRenewal() pra assinatura). `value` aqui é `invoiceValue` (só o
// valor DESSA parcela), não o total — quem quiser o total consulta a linha
// Purchase da parcela 1 via `main_sale_transaction_id`.
async function recordInstallment(db: SupabaseClient, companyId: string, sale: SaleEvent): Promise<void> {
  // Mesma correlação/fingerprint de recordSale() — mesmo motivo do
  // recordRenewal() acima: sem isso, a parcela 2/3 aparecia como um
  // "visitante" separado em vez de cair no histórico da mesma pessoa.
  const match = await resolveVisitMatch(db, companyId, sale);
  const fingerprintId = computeFingerprintId(match, sale);

  await insertEventsLogRow(db, {
    company_id: companyId,
    event_name: "Installment",
    fingerprint_id: fingerprintId,
    user_data: {},
    lead_email: sale.email,
    lead_phone: sale.phone,
    lead_name: sale.name,
    product_name: sale.productName,
    capi_status: "skipped",
    event_id: installmentTransactionId(sale),
    external_transaction_id: installmentTransactionId(sale),
    main_sale_transaction_id: sale.transactionId,
    installment_number: sale.installmentNumber,
    installments: sale.installments,
    value: sale.invoiceValue,
    // Parcela > 1 também nunca multiplica nada — `value` já É o valor dessa
    // parcela, igual a `installment_value` (mesma simetria do recordRenewal).
    installment_value: sale.invoiceValue,
    currency: sale.currency,
    source: EDUZZ_SOURCE,
    payment_method: sale.paymentMethod,
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

  let db: SupabaseClient;
  try {
    db = supabaseAdmin();
  } catch {
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

  // Contrato criado/atualizado: só guarda a "ficha" (nº de parcelas, se tem
  // fim definido) pra consultar depois em cada invoice_paid dessa assinatura
  // — não é venda, não passa pelo parse de SaleEvent. Schema próprio (tem
  // `data.customer`, não `data.buyer`), por isso checa antes de isModernPayload.
  if (typeof body.event === "string" && CONTRACT_EVENTS.has(body.event)) {
    await upsertContractInfo(db, companyId, body as EduzzContractPayload);
    return NextResponse.json({ received: true });
  }

  const sale = isModernPayload(body) ? parseModernPayload(body as EduzzModernPayload) : parseLegacyPayload(body);
  if ("ignored" in sale) {
    return NextResponse.json({ received: true, ignored: sale.ignored });
  }

  if (isInstallmentContinuation(sale)) {
    if (await alreadyProcessed(db, companyId, installmentTransactionId(sale))) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    try {
      await recordInstallment(db, companyId, sale);
    } catch (err) {
      console.error("[eduzz webhook] falha ao registrar parcela:", err instanceof Error ? err.message : err);
    }
    return NextResponse.json({ received: true, installment: true, parcela: sale.installmentNumber, totalParcelas: sale.installments });
  }

  // Cura venda recorrente órfã (contract: null no invoice_paid, bug confirmado
  // do lado da Eduzz) ANTES de decidir Purchase vs Renewal — sem isso, toda
  // cobrança que chegar assim seria sempre "venda nova", mesmo sendo a 3ª/4ª
  // renovação de uma assinatura madura. Só cura quando inequívoco (ver
  // findContractByCustomerAndProduct) — sem candidato certo, segue como hoje.
  // `!sale.installments` exclui boleto parcelado (mecanismo próprio, já
  // tratado acima via isInstallmentContinuation/recordInstallment) — sem essa
  // guarda, uma coincidência rara (mesmo email+produto entre um boleto
  // parcelado e uma assinatura ativa) poderia vincular um recurrence_key
  // errado num boleto, fazendo recordSale() multiplicar pelo contrato errado.
  if (!sale.recurrenceKey && !sale.installments && sale.email && sale.items[0]?.productId) {
    const healedContractId = await findContractByCustomerAndProduct(
      db, companyId, sale.email, sale.items[0].productId, sale.paidAtIso ?? sale.date,
    );
    if (healedContractId) sale.recurrenceKey = healedContractId;
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

  // Purchase em events_log + Meta CAPI nunca pode derrubar a resposta —
  // se a Eduzz não receber 200 rápido, ela reenfileira a notificação.
  // `recordSale` cuida de events_log → campaign_metrics → Meta, nessa ordem
  // (insert primeiro pela idempotência — ver comentário lá dentro).
  try {
    await recordSale(db, companyId, sale);
  } catch (err) {
    console.error("[eduzz webhook] falha ao registrar Purchase:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ received: true, produto: sale.productName, date: sale.date, revenue: sale.value });
}
