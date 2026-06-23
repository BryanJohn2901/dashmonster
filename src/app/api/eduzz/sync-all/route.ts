import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { syncCompany } from "@/lib/eduzzSync";

export const runtime = "nodejs";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET;

// Orçamento total da invocação (< maxDuration). Empresas são processadas em
// sequência (não Promise.all) pra não estourar o rate limit da Eduzz
// (30 req/min) somando as chamadas de várias empresas ao mesmo tempo.
const TOTAL_BUDGET_MS = 50_000;
const PER_COMPANY_BUDGET_MS = 20_000;

/**
 * POST (ou GET) /api/eduzz/sync-all
 * Sincroniza as empresas conectadas via OAuth Eduzz. Disparado pela Vercel
 * Cron a cada 6h — o webhook continua sendo o caminho rápido, isso é só a
 * rede de segurança pras lacunas documentadas em CLAUDE.md. Protegido por
 * CRON_SECRET, mesmo padrão de instagram/accounts/sync-all.
 *
 * Pega tanto "connected" quanto "syncing" (uma sync que ficou pela metade —
 * front fechado no meio do loop, etc — é retomada aqui). Cada empresa roda em
 * janelas até done OU até o budget; o que não terminar nesta invocação fica
 * com last_synced_at avançado e termina na próxima rodada do cron. syncCompany
 * sempre grava status final, nunca deixa preso em "syncing".
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth && CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const { data: connections, error } = await sb
    .from("eduzz_oauth_connections")
    .select("company_id, access_token, last_synced_at")
    .in("status", ["connected", "syncing"]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!connections || connections.length === 0) {
    return NextResponse.json({ synced: 0, results: [] });
  }

  const startedAt = Date.now();
  const results: { companyId: string; done: boolean }[] = [];

  for (const connection of connections) {
    if (Date.now() - startedAt > TOTAL_BUDGET_MS) break;
    const { done } = await syncCompany(
      sb,
      connection as { company_id: string; access_token: string; last_synced_at: string | null },
      PER_COMPANY_BUDGET_MS,
    );
    results.push({ companyId: connection.company_id as string, done });
  }

  console.log(`[eduzz sync-all] processed=${results.length} done=${results.filter((r) => r.done).length}`);
  return NextResponse.json({ synced: results.length, results });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
