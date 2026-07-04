import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { GRAPH_BASE, adsOauthRedirectUri } from "@/lib/meta";

export const runtime = "nodejs";

const STATE_COOKIE = "meta_oauth_state";

/**
 * GET /api/meta/oauth/callback?code=...&state=...
 *
 * Callback do OAuth de Ads. Troca o `code` por um user token de longa duração
 * (60 dias), confere se as permissões de anúncio foram concedidas e grava o
 * token em `companies.meta_access_token` — em todas as empresas se o usuário
 * for super admin, senão nas empresas onde é owner/manager (token global do
 * app: o que muda por empresa é só o ACT).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = request.nextUrl.origin;

  const backToApp = (status: string, extra: Record<string, string> = {}): NextResponse => {
    const url = new URL("/", origin);
    url.searchParams.set("meta_oauth", status);
    for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
    const res = NextResponse.redirect(url);
    res.cookies.delete(STATE_COOKIE);
    return res;
  };

  const code  = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");

  if (errorParam) {
    return backToApp("error", { reason: searchParams.get("error_description") ?? errorParam });
  }
  if (!code) {
    return backToApp("error", { reason: "Código de autorização ausente." });
  }

  // ── CSRF: cookie = "<state>.<userId>" gravado pelo /start autenticado ───────
  const cookieValue = request.cookies.get(STATE_COOKIE)?.value ?? "";
  const dotIdx = cookieValue.indexOf(".");
  const cookieState = dotIdx > 0 ? cookieValue.slice(0, dotIdx) : "";
  const userId      = dotIdx > 0 ? cookieValue.slice(dotIdx + 1) : "";
  if (!cookieState || !userId || !state || cookieState !== state) {
    return backToApp("error", { reason: "Falha de validação (state)." });
  }

  const appId     = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return backToApp("error", { reason: "App Meta não configurado no servidor." });
  }

  try {
    // ── 1. code → user token curto ───────────────────────────────────────────
    const shortRes = await fetch(
      `${GRAPH_BASE}/oauth/access_token?` +
      new URLSearchParams({
        client_id:     appId,
        client_secret: appSecret,
        redirect_uri:  adsOauthRedirectUri(),
        code,
      }),
    );
    const shortJson = await shortRes.json() as { access_token?: string; error?: { message?: string } };
    if (!shortRes.ok || shortJson.error || !shortJson.access_token) {
      return backToApp("error", { reason: shortJson.error?.message ?? "Falha ao trocar o código." });
    }

    // ── 2. user token curto → user token longo (60 dias) ─────────────────────
    const longRes = await fetch(
      `${GRAPH_BASE}/oauth/access_token?` +
      new URLSearchParams({
        grant_type:        "fb_exchange_token",
        client_id:         appId,
        client_secret:     appSecret,
        fb_exchange_token: shortJson.access_token,
      }),
    );
    const longJson = await longRes.json() as { access_token?: string; error?: { message?: string } };
    const userToken = longJson.access_token ?? shortJson.access_token;

    // ── 3. Confere se as permissões de anúncio foram realmente concedidas ────
    // (o usuário pode desmarcar escopos no diálogo — é a causa do erro #200)
    const permsRes = await fetch(
      `${GRAPH_BASE}/me/permissions?` + new URLSearchParams({ access_token: userToken }),
    );
    const permsJson = await permsRes.json() as {
      data?: Array<{ permission: string; status: string }>;
      error?: { message?: string };
    };
    const granted = new Set(
      (permsJson.data ?? []).filter((p) => p.status === "granted").map((p) => p.permission),
    );
    if (!granted.has("ads_read") && !granted.has("ads_management")) {
      return backToApp("error", {
        reason: "Permissões de anúncio (ads_read/ads_management) não foram concedidas no login. Refaça a conexão marcando todas as permissões.",
      });
    }

    // ── 4. Grava o token nas empresas do usuário (todas, se super admin) ─────
    const sb = supabaseAdmin();

    const { data: adminRow } = await sb
      .from("app_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    let companyIds: string[] = [];
    if (adminRow) {
      const { data: all } = await sb.from("companies").select("id");
      companyIds = (all ?? []).map((c) => c.id as string);
    } else {
      const { data: mem } = await sb
        .from("company_members")
        .select("company_id, role")
        .eq("user_id", userId)
        .in("role", ["owner", "manager"]);
      companyIds = (mem ?? []).map((m) => m.company_id as string);
    }
    if (companyIds.length === 0) {
      return backToApp("error", { reason: "Nenhuma empresa com permissão de edição para receber o token." });
    }

    const { error: upErr } = await sb
      .from("companies")
      .update({ meta_access_token: userToken })
      .in("id", companyIds);
    if (upErr) {
      return backToApp("error", { reason: upErr.message });
    }

    return backToApp("connected", { count: String(companyIds.length) });
  } catch (e) {
    return backToApp("error", { reason: String(e) });
  }
}
