import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { encryptToken } from "@/lib/crypto";
import { exchangeCodeForToken, eduzzRedirectUri } from "@/lib/eduzzOAuth";
import { syncCompany } from "@/lib/eduzzSync";

export const runtime = "nodejs";
export const maxDuration = 60;

const STATE_COOKIE = "eduzz_oauth_state";

/**
 * GET /api/eduzz/oauth/callback?code=...&state=...
 * Troca o code por um access_token (não expira, sem refresh — confirmado na
 * doc oficial), grava cifrado em eduzz_oauth_connections e dispara a 1ª
 * sincronização (90 dias) antes de redirecionar de volta pro painel.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = request.nextUrl.origin;
  const backToApp = (status: string, extra: Record<string, string> = {}): NextResponse => {
    const url = new URL("/", origin);
    url.searchParams.set("eduzz_oauth", status);
    for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
    return NextResponse.redirect(url);
  };

  const code = searchParams.get("code");
  const queryState = searchParams.get("state");
  const errorParam = searchParams.get("error");

  if (errorParam) {
    return backToApp("error", { reason: searchParams.get("error_description") ?? errorParam });
  }
  if (!code) {
    return backToApp("error", { reason: "Código de autorização ausente." });
  }

  // companyId vem do cookie (fonte de verdade), não do query state — a doc
  // oficial da Eduzz não confirma se o `state` enviado em /authorize é
  // ecoado de volta aqui (ver comentário em oauth/start/route.ts).
  const cookieState = request.cookies.get(STATE_COOKIE)?.value;
  if (!cookieState) {
    return backToApp("error", { reason: "Sessão de autorização expirada ou ausente." });
  }
  if (queryState && queryState !== cookieState) {
    return backToApp("error", { reason: "Falha de validação (state)." });
  }
  const companyId = cookieState.split(".")[0];
  if (!companyId) {
    return backToApp("error", { reason: "Estado de autorização inválido." });
  }

  try {
    const token = await exchangeCodeForToken(code, eduzzRedirectUri());

    const sb = supabaseAdmin();
    const { error } = await sb
      .from("eduzz_oauth_connections")
      .upsert(
        {
          company_id: companyId,
          access_token: encryptToken(token.access_token),
          eduzz_user_id: token.user?.id ?? null,
          eduzz_user_email: token.user?.email ?? null,
          eduzz_user_name: token.user?.name ?? null,
          status: "syncing",
          last_sync_error: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id" },
      );
    if (error) {
      return backToApp("error", { reason: error.message });
    }

    // 1ª sincronização (90 dias) DEPOIS do redirect (via after()) — rodar
    // antes travava o browser na tela de "redirecionando" da Eduzz até
    // estourar o timeout da function (paginação de 90 dias passa fácil de
    // 10s). `after()` manda a resposta de redirect na hora e continua a
    // sync em segundo plano (Vercel usa waitUntil — function só morre depois
    // que a promise resolve ou bate o maxDuration). Erro vira
    // last_sync_error, não afeta o redirect que já foi enviado.
    after(async () => {
      const { data: connection } = await sb
        .from("eduzz_oauth_connections")
        .select("company_id, access_token, last_synced_at")
        .eq("company_id", companyId)
        .single();
      if (connection) {
        await syncCompany(sb, connection as { company_id: string; access_token: string; last_synced_at: string | null });
      }
    });

    const res = backToApp("connected");
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (e) {
    return backToApp("error", { reason: e instanceof Error ? e.message : String(e) });
  }
}
