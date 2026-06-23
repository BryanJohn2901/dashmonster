// ─── Eduzz — sincronização via API (complemento ao webhook) ──────────────────
// Não duplica a lógica de negócio do webhook (recorrência/parcela/order
// bump/idempotência/CAPI já resolvidas e testadas em produção lá) — só adapta
// o formato da API MyEduzz pro mesmo shape que o webhook já entende
// (EduzzModernPayload/EduzzContractPayload) e reusa as MESMAS funções
// exportadas de src/app/api/eduzz/webhook/route.ts. Ver
// src/app/api/eduzz/CLAUDE.md pra detalhes/limitações desta adaptação.

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken } from "@/lib/crypto";
import {
  type EduzzModernPayload,
  type EduzzContractPayload,
  isInstallmentContinuation,
  isKnownRecurrence,
  alreadyProcessed,
  parseModernPayload,
  recordSale,
  recordRenewal,
  recordInstallment,
  upsertContractInfo,
  handleReversal,
  installmentTransactionId,
  REVERSAL_EVENTS,
  EDUZZ_SOURCE,
} from "@/app/api/eduzz/webhook/route";
import {
  fetchSales,
  fetchChargebacks,
  fetchSubscriptions,
  type EduzzApiSale,
  type EduzzApiSubscription,
  type EduzzApiChargeback,
} from "@/lib/eduzzOAuth";

// 90 dias é só pra 1ª sincronização (conexão nova, sem last_synced_at) — depois
// disso, sempre parte de onde a sync anterior parou.
const FIRST_SYNC_LOOKBACK_DAYS = 90;
const PAGE_SIZE = 100;

// Processamento sequencial item-a-item facilmente passa de 60s (maxDuration
// no Hobby da Vercel) numa janela de 90 dias com volume real — a function é
// matada no meio, sem rodar o update final de status, e a conexão fica
// presa em "syncing" pra sempre. Por isso syncCompany() processa em janelas
// de CHUNK_DAYS e checa o budget de tempo depois de cada janela: se passou do
// orçamento, para e devolve done=false, já tendo avançado last_synced_at até
// onde completou — quem chamou (rota sync-now no loop do front, ou o cron)
// retoma de onde parou. Garante que CADA invocação termina dentro do tempo e
// sempre grava um status final, nunca deixa preso em "syncing".
const CHUNK_DAYS = 7;
const DEFAULT_TIME_BUDGET_MS = 35_000;

// Sync só deve ENRIQUECER venda que o WEBHOOK já capturou (mesma pessoa, por
// email) — nunca criar uma "primeira venda" do zero. Pedido explícito do
// usuário (2026-06-23, reforçado depois: "só completa o que já chegou do
// webhook, o que não chegar não pega nada"): o backfill de 90 dias estava
// criando cards "via eduzz" soltos no Histórico do visitante pra clientes
// sem NENHUMA venda prévia via webhook — jornada fantasma, sem nenhum dado
// real de atribuição por trás. Filtra por `source = EDUZZ_SOURCE` (não só
// "qualquer evento", o que incluiria um Lead do pixel sem venda nenhuma) —
// só Purchase/Renewal/Installment gravados pelo webhook (ou por esta própria
// sync, depois de já liberada) usam esse source; Lead/PageView do pixel não
// contam como "veio do webhook". `alreadyProcessed`/`isKnownRecurrence` já
// cobrem "já vimos ESSA venda/contrato"; isto cobre "essa PESSOA já tem
// alguma venda processada pelo webhook" (mesmo critério de email usado em
// `resolveVisitMatch()`/`findContractByCustomerAndProduct()` no webhook).
// Como as janelas processam da mais antiga pra mais nova, isso também blinda
// renovações/parcelas seguintes do MESMO contrato: se a 1ª cobrança nunca foi
// gravada (cliente sem venda via webhook), `isKnownRecurrence` nunca vira
// true pra esse `recurrenceKey`, então as cobranças seguintes caem aqui de
// novo e também são puladas — a jornada inteira fica de fora, não só a 1ª linha.
async function hasTrackedHistory(db: SupabaseClient, companyId: string, email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const { data, error } = await db
    .from("events_log")
    .select("id")
    .eq("company_id", companyId)
    .eq("source", EDUZZ_SOURCE)
    .ilike("lead_email", email)
    .limit(1)
    .maybeSingle();
  return !error && Boolean(data);
}

// Data em YYYY-MM-DD (simples). O endpoint de chargebacks mostra exemplo com
// ISO completo na doc, MAS os de vendas/assinaturas rejeitam datetime com
// "validation error" (422) — confirmado em produção 2026-06-22. Data simples
// é aceita pelos três, então é o denominador comum.
function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Adapters: API → mesmo shape do webhook ───────────────────────────────────

/**
 * A API de vendas não confirma um campo `parentId` (catálogo/pixel por
 * produto, migration 050) nem o detalhamento de boleto parcelado
 * (bankSlipInstallment) — esses 2 ficam de fora desta adaptação (o webhook,
 * quando chega, continua sendo quem resolve isso melhor). `sale.total` já é
 * o valor da fatura individual (mesma granularidade do `price.value` do
 * webhook), por isso não há multiplicação aqui.
 */
export function mapApiSaleToModernPayload(sale: EduzzApiSale): EduzzModernPayload {
  const buyer = sale.buyer;
  const item = sale.items?.[0];
  const value = sale.total ?? sale.netGain ?? sale.grossGain ?? 0;
  const productId = item?.productId ?? sale.product?.id;
  const productName = sale.product?.name ?? sale.offer?.name ?? item?.name ?? "Eduzz";

  return {
    event: "myeduzz.invoice_paid",
    data: {
      buyer: buyer
        ? {
            name: buyer.name,
            email: buyer.email,
            phone: buyer.phone,
            cellphone: buyer.phone,
            address: buyer.address
              ? {
                  city: buyer.address.city,
                  state: buyer.address.state,
                  country: buyer.address.country,
                  zipCode: buyer.address.zipcode,
                }
              : undefined,
          }
        : undefined,
      utm: sale.utm
        ? { source: sale.utm.source, medium: sale.utm.medium, campaign: sale.utm.campaign, content: sale.utm.content, term: sale.utm.term }
        : undefined,
      price: { value, currency: "BRL" },
      transaction: { id: String(sale.id) },
      items: [
        {
          productId: productId != null ? String(productId) : undefined,
          // parentId não confirmado na API de vendas — catálogo/pixel por
          // produto (eduzz_products) não é populado por vendas vindas da sync.
          parentId: undefined,
          name: productName,
          price: { value },
        },
      ],
      paymentMethod: sale.payment?.method,
      paidAt: sale.paidAt ?? undefined,
      contract: sale.contractId != null ? { id: String(sale.contractId) } : undefined,
      orderBump: sale.orderBump,
    },
  };
}

export function mapApiSubscriptionToContractPayload(sub: EduzzApiSubscription): EduzzContractPayload {
  const product = sub.products?.[0];
  return {
    event: "myeduzz.contract_updated",
    data: {
      customer: sub.client?.email ? { email: sub.client.email } : undefined,
      products: product?.id != null ? [{ id: String(product.id) }] : undefined,
      contract: {
        id: String(sub.id),
        recurrence: {
          isFinite: sub.charges?.total != null,
          price: sub.price ? { value: sub.price.value, currency: sub.price.currency } : undefined,
          charges: sub.charges ? { current: sub.charges.current, total: sub.charges.total } : undefined,
          startsAt: sub.createdAt,
        },
      },
    },
  };
}

// ─── Sync por recurso — cada um pagina até esgotar, erro de 1 venda não para o resto ──

export async function syncCompanySales(db: SupabaseClient, companyId: string, token: string, startDate: string, endDate: string): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;
  let page = 1;

  while (true) {
    const res = await fetchSales(token, startDate, endDate, page, PAGE_SIZE);
    const sales = res.items ?? [];
    if (sales.length === 0) break;

    for (const apiSale of sales) {
      try {
        if (apiSale.status && apiSale.status.toLowerCase() !== "paid" && apiSale.status.toLowerCase() !== "completed") continue;

        const payload = mapApiSaleToModernPayload(apiSale);
        const sale = parseModernPayload(payload);
        if ("ignored" in sale) continue;

        // Mesma árvore de decisão do POST() do webhook (route.ts linhas
        // ~1240-1300) — copiada aqui de propósito, não exportada de lá, pra
        // não acoplar o webhook a um shape de loop que só a sync usa.
        if (isInstallmentContinuation(sale)) {
          if (!(await alreadyProcessed(db, companyId, installmentTransactionId(sale)))) {
            await recordInstallment(db, companyId, sale);
          }
          processed++;
          continue;
        }

        if (await alreadyProcessed(db, companyId, sale.transactionId)) {
          processed++;
          continue;
        }

        if (sale.recurrenceKey && (await isKnownRecurrence(db, companyId, sale.recurrenceKey))) {
          await recordRenewal(db, companyId, sale);
        } else {
          // 1ª venda desse contrato/cliente: só grava se a pessoa já tem
          // ALGUM histórico rastreado (webhook/pixel) — senão é cliente que
          // nunca passou pelo nosso tracking, sync não deve inventar jornada.
          if (!(await hasTrackedHistory(db, companyId, sale.email))) continue;
          await recordSale(db, companyId, sale);
        }
        processed++;
      } catch (err) {
        console.error("[eduzz sync] falha ao processar venda:", apiSale.id, err instanceof Error ? err.message : err);
        errors++;
      }
    }

    const totalPages = res.pages ?? res.totalPages;
    if (totalPages != null && page >= totalPages) break;
    if (sales.length < PAGE_SIZE) break;
    page++;
  }

  return { processed, errors };
}

export async function syncCompanyChargebacks(db: SupabaseClient, companyId: string, token: string, startDate: string, endDate: string): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;
  let page = 1;

  while (true) {
    const res = await fetchChargebacks(token, startDate, endDate, page, PAGE_SIZE);
    const chargebacks: EduzzApiChargeback[] = res.items ?? [];
    if (chargebacks.length === 0) break;

    for (const cb of chargebacks) {
      try {
        const status = REVERSAL_EVENTS["myeduzz.invoice_chargeback"];
        await handleReversal(
          db,
          companyId,
          { event: "myeduzz.invoice_chargeback", data: { transaction: { id: String(cb.id) } } },
          status,
        );
        processed++;
      } catch (err) {
        console.error("[eduzz sync] falha ao processar chargeback:", cb.id, err instanceof Error ? err.message : err);
        errors++;
      }
    }

    const totalPages = res.pages ?? res.totalPages;
    if (totalPages != null && page >= totalPages) break;
    if (chargebacks.length < PAGE_SIZE) break;
    page++;
  }

  return { processed, errors };
}

export async function syncCompanySubscriptions(db: SupabaseClient, companyId: string, token: string, startDate: string, endDate: string): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;
  let page = 1;

  while (true) {
    const res = await fetchSubscriptions(token, startDate, endDate, "update", page);
    const subs: EduzzApiSubscription[] = res.items ?? [];
    if (subs.length === 0) break;

    for (const sub of subs) {
      try {
        await upsertContractInfo(db, companyId, mapApiSubscriptionToContractPayload(sub));
        processed++;
      } catch (err) {
        console.error("[eduzz sync] falha ao processar assinatura:", sub.id, err instanceof Error ? err.message : err);
        errors++;
      }
    }

    const totalPages = res.pages ?? res.totalPages;
    if (totalPages != null && page >= totalPages) break;
    if (subs.length < PAGE_SIZE) break;
    page++;
  }

  return { processed, errors };
}

// ─── Orquestrador ──────────────────────────────────────────────────────────────

interface EduzzOAuthConnectionRow {
  company_id: string;
  access_token: string;
  last_synced_at: string | null;
}

/**
 * Sincroniza 1 empresa em janelas de CHUNK_DAYS, dentro de um orçamento de
 * tempo (budgetMs): assinaturas primeiro (popula a "ficha" do contrato antes
 * das vendas, pra `findContractByCustomerAndProduct`/multiplicador de valor já
 * terem o que precisam), depois vendas, depois chargebacks — em cada janela.
 *
 * Garantias (o que mata o bug de "preso em syncing pra sempre"):
 *  - todo fetch tem timeout (ver eduzzFetch), então nenhuma janela pendura a
 *    function até a Vercel matar por maxDuration;
 *  - a cada janela concluída, `last_synced_at` avança e é gravado na hora —
 *    progresso nunca se perde;
 *  - SEMPRE grava um status final antes de retornar: "connected" se terminou
 *    o período todo, "error" se algo falhou, ou continua "syncing" (com
 *    updated_at fresco) se só estourou o budget e ainda falta período — nesse
 *    caso retorna done=false e quem chamou (loop do front em sync-now, ou o
 *    cron) retoma de onde parou.
 *
 * Erro isolado por empresa (mesmo padrão de `syncAccount()` em
 * instagram/accounts/sync-all) — nunca derruba a sync de outras empresas.
 *
 * @returns done=true quando o período inteiro foi sincronizado; false se
 *          parou no budget e ainda há período a cobrir.
 */
export async function syncCompany(
  db: SupabaseClient,
  connection: EduzzOAuthConnectionRow,
  budgetMs: number = DEFAULT_TIME_BUDGET_MS,
): Promise<{ done: boolean }> {
  const { company_id: companyId } = connection;
  const token = decryptToken(connection.access_token);
  const startedAt = Date.now();

  const fullEnd = new Date();
  let cursor = connection.last_synced_at
    ? new Date(connection.last_synced_at)
    : new Date(Date.now() - FIRST_SYNC_LOOKBACK_DAYS * 86400000);

  try {
    while (cursor < fullEnd) {
      const chunkEnd = new Date(Math.min(cursor.getTime() + CHUNK_DAYS * 86400000, fullEnd.getTime()));
      const startDate = toIsoDate(cursor);
      const endDate = toIsoDate(chunkEnd);

      await syncCompanySubscriptions(db, companyId, token, startDate, endDate);
      await syncCompanySales(db, companyId, token, startDate, endDate);
      await syncCompanyChargebacks(db, companyId, token, startDate, endDate);

      cursor = chunkEnd;
      await db
        .from("eduzz_oauth_connections")
        .update({ last_synced_at: cursor.toISOString(), updated_at: new Date().toISOString() })
        .eq("company_id", companyId);

      if (Date.now() - startedAt > budgetMs) break;
    }

    const done = cursor >= fullEnd;
    await db
      .from("eduzz_oauth_connections")
      .update({
        status: done ? "connected" : "syncing",
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId);
    return { done };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[eduzz sync] falha ao sincronizar empresa:", companyId, message);
    await db
      .from("eduzz_oauth_connections")
      .update({ status: "error", last_sync_error: message, updated_at: new Date().toISOString() })
      .eq("company_id", companyId);
    return { done: true };
  }
}
