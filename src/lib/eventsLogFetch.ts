import type { SupabaseClient } from "@supabase/supabase-js";

// ────────────────────────────────────────────────────────────────────────────
// Busca paginada de events_log pro dashboard de Analytics/Tracking.
//
// Problema que isso resolve: as telas buscavam eventos brutos com um
// `.limit(N)` fixo (1000 ou 10000) e agregavam tudo no browser. Quando o
// período filtrado tinha mais linhas que N — o normal em contas com tráfego
// pago, já que `PageView` dispara em toda carga de página — o excesso era
// descartado silenciosamente e receita/vendas/leads apareciam sub-contados.
//
// Fix: separar eventos de "negócio" (Lead/Purchase/Installment — baixíssimo
// volume, sempre cabem) dos eventos de "ruído" (PageView e afins — alto
// volume) e buscar cada grupo com seu próprio teto. O grupo de negócio nunca
// é truncado na prática (teto generoso só como proteção contra loop infinito);
// só o grupo de ruído pode bater no teto, e mesmo assim com um valor bem mais
// alto que antes — o suficiente pra não estourar memória/CPU do browser.
// ────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 1000;

/** Teto do grupo "negócio" — proteção contra loop infinito, não deve ser atingido na prática. */
const BUSINESS_EVENTS_SAFETY_CAP = 100_000;

/** Teto do grupo "ruído" (PageView etc) — protege o browser de volume absurdo de uma vez. */
export const NOISE_EVENTS_SAFETY_CAP = 30_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = any;

async function paginateRange(
  build: (offset: number) => AnyQuery,
  cap: number,
): Promise<{ rows: Record<string, unknown>[]; capped: boolean }> {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; offset < cap; offset += PAGE_SIZE) {
    const { data, error } = await build(offset);
    if (error) throw error;
    const page = (data ?? []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { rows, capped: false };
  }
  return { rows, capped: true };
}

interface FetchEventsLogSplitOptions {
  select: string;
  companyId: string;
  dateFrom: string;
  dateTo: string;
  /** Filtro extra aplicado às duas queries (negócio + ruído), ex. sale_confirmed. */
  extraFilter?: (q: AnyQuery) => AnyQuery;
  /** event_name de baixo volume — buscados por completo, sem teto prático. */
  businessEventNames: string[];
  /** event_name totalmente excluídos das duas buscas (ex. Renewal). */
  excludeEventNames?: string[];
  /** Teto do grupo de ruído (default NOISE_EVENTS_SAFETY_CAP). */
  noiseCap?: number;
}

export interface FetchEventsLogSplitResult<T> {
  rows: T[];
  /** true só quando o grupo de RUÍDO bateu no teto — negócio (receita/vendas/leads) nunca é truncado. */
  noiseCapped: boolean;
}

/**
 * Busca todos os eventos de negócio (sem truncar) + eventos de ruído até um
 * teto de segurança, cobrindo o range de data inteiro (paginação real, não
 * um único `.limit()`).
 */
export async function fetchEventsLogSplit<T>(
  client: SupabaseClient,
  opts: FetchEventsLogSplitOptions,
): Promise<FetchEventsLogSplitResult<T>> {
  const base = (offset: number) => {
    let q = client
      .from("events_log")
      .select(opts.select)
      .eq("company_id", opts.companyId)
      .gte("created_at", new Date(`${opts.dateFrom}T00:00:00`).toISOString())
      .lte("created_at", new Date(`${opts.dateTo}T23:59:59.999`).toISOString());
    if (opts.extraFilter) q = opts.extraFilter(q);
    for (const name of opts.excludeEventNames ?? []) q = q.neq("event_name", name);
    return q
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
  };

  const businessList = opts.businessEventNames.join(",");
  const [business, noise] = await Promise.all([
    paginateRange((offset) => base(offset).in("event_name", opts.businessEventNames), BUSINESS_EVENTS_SAFETY_CAP),
    paginateRange((offset) => base(offset).not("event_name", "in", `(${businessList})`), opts.noiseCap ?? NOISE_EVENTS_SAFETY_CAP),
  ]);

  return { rows: [...business.rows, ...noise.rows] as T[], noiseCapped: noise.capped };
}

/** Busca completa e paginada (sem split) — pra queries já naturalmente de baixo volume. */
export async function fetchEventsLogAll<T>(
  build: (offset: number, limit: number) => AnyQuery,
  cap = BUSINESS_EVENTS_SAFETY_CAP,
): Promise<T[]> {
  const { rows } = await paginateRange((offset) => build(offset, PAGE_SIZE), cap);
  return rows as T[];
}
