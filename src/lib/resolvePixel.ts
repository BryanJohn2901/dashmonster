import type { SupabaseClient } from "@supabase/supabase-js";

export interface ResolvedPixel {
  companyId: string;
  /** null = migration 037 ainda não rodou (config lida das colunas legadas de `companies`) ou a empresa ainda não criou nenhum pixel. */
  pixelId: string | null;
  meta_pixel_id: string | null;
  meta_capi_token: string | null;
  dominio_autorizado: string | null;
  meta_test_event_code: string | null;
}

// Antes da migration 037, a config de tracking era 4 colunas direto em
// `companies` (1 pixel por empresa). Mesma resiliência de sempre: se a coluna
// meta_test_event_code (036) ainda não existir, cai pra sem ela.
// Compartilhado entre track-event/route.ts e eduzz/webhook/route.ts — os dois
// precisam resolver credenciais Meta de uma empresa quando tracking_pixels
// ainda não existe (migration 037 pendente).
export async function selectLegacyCompanyConfig(db: SupabaseClient, companyId: string) {
  const FULL = "meta_pixel_id, meta_capi_token, dominio_autorizado, meta_test_event_code";
  const FALLBACK = "meta_pixel_id, meta_capi_token, dominio_autorizado";
  const full = await db.from("companies").select(FULL).eq("id", companyId).single();
  if (full.error?.message?.includes("meta_test_event_code")) {
    const fallback = await db.from("companies").select(FALLBACK).eq("id", companyId).single();
    return fallback.data ? { ...fallback.data, meta_test_event_code: null } : null;
  }
  return full.data ?? null;
}

function emptyResolved(companyId: string): ResolvedPixel {
  return { companyId, pixelId: null, meta_pixel_id: null, meta_capi_token: null, dominio_autorizado: null, meta_test_event_code: null };
}

async function legacyResolved(db: SupabaseClient, companyId: string): Promise<ResolvedPixel> {
  console.warn("[tracking] tabela tracking_pixels ausente (migration 037 pendente), usando config legada de companies");
  const legacy = await selectLegacyCompanyConfig(db, companyId);
  return {
    companyId,
    pixelId: null,
    meta_pixel_id: legacy?.meta_pixel_id ?? null,
    meta_capi_token: legacy?.meta_capi_token ?? null,
    dominio_autorizado: legacy?.dominio_autorizado ?? null,
    meta_test_event_code: legacy?.meta_test_event_code ?? null,
  };
}

// Resolve um pixel específico pelo id (usado pelo webhook da Eduzz quando a
// venda foi correlacionada a uma visita anterior que já tem pixel_id salvo em
// events_log — manda a Purchase pro MESMO pixel que recebeu o Lead daquele
// visitante, em vez do pixel padrão da empresa).
export async function resolvePixelById(db: SupabaseClient, companyId: string, pixelId: string): Promise<ResolvedPixel> {
  const pixelRes = await db
    .from("tracking_pixels")
    .select("id, meta_pixel_id, meta_capi_token, dominio_autorizado, meta_test_event_code")
    .eq("id", pixelId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (pixelRes.error?.message?.includes("tracking_pixels")) return legacyResolved(db, companyId);
  if (!pixelRes.data) return resolveDefaultPixel(db, companyId); // pixel foi removido depois — cai pro padrão

  return {
    companyId,
    pixelId: pixelRes.data.id as string,
    meta_pixel_id: pixelRes.data.meta_pixel_id ?? null,
    meta_capi_token: pixelRes.data.meta_capi_token ?? null,
    dominio_autorizado: pixelRes.data.dominio_autorizado ?? null,
    meta_test_event_code: pixelRes.data.meta_test_event_code ?? null,
  };
}

// Resolve o pixel `is_default` da empresa — usado pelo webhook da Eduzz quando
// a venda não foi correlacionada a nenhuma visita rastreada (comprador não
// passou pelo nosso pixel antes de comprar, ou ainda não tem Lead capturado).
export async function resolveDefaultPixel(db: SupabaseClient, companyId: string): Promise<ResolvedPixel> {
  const pixelRes = await db
    .from("tracking_pixels")
    .select("id, meta_pixel_id, meta_capi_token, dominio_autorizado, meta_test_event_code")
    .eq("company_id", companyId)
    .eq("is_default", true)
    .maybeSingle();

  if (pixelRes.error?.message?.includes("tracking_pixels")) return legacyResolved(db, companyId);
  if (!pixelRes.data) return emptyResolved(companyId);

  return {
    companyId,
    pixelId: pixelRes.data.id as string,
    meta_pixel_id: pixelRes.data.meta_pixel_id ?? null,
    meta_capi_token: pixelRes.data.meta_capi_token ?? null,
    dominio_autorizado: pixelRes.data.dominio_autorizado ?? null,
    meta_test_event_code: pixelRes.data.meta_test_event_code ?? null,
  };
}
