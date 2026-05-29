import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { encryptToken } from "@/lib/crypto";
import { GRAPH_BASE, appBaseUrl, oauthRedirectUri } from "@/lib/meta";

export const runtime = "nodejs";

const STATE_COOKIE = "ig_oauth_state";

function backToApp(status: string, extra: Record<string, string> = {}): NextResponse {
  const url = new URL("/", appBaseUrl());
  url.searchParams.set("ig_oauth", status);
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

/**
 * GET /api/instagram/oauth/callback?code=...&state=...
 *
 * Troca o `code` por um user token de longa duração (60 dias), busca as Páginas
 * do usuário e seus Instagram Business Accounts, e grava cada conta com o
 * **Page Access Token derivado** — que não expira enquanto a permissão existir.
 * Tokens são gravados cifrados via service_role.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code  = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");

  if (errorParam) {
    return backToApp("error", { reason: searchParams.get("error_description") ?? errorParam });
  }
  if (!code) {
    return backToApp("error", { reason: "Código de autorização ausente." });
  }

  // ── CSRF: confere o state guardado no cookie ────────────────────────────────
  const cookieState = request.cookies.get(STATE_COOKIE)?.value;
  if (!cookieState || !state || cookieState !== state) {
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
        redirect_uri:  oauthRedirectUri(),
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
    const userLongToken = longJson.access_token ?? shortJson.access_token;

    // ── 3. /me/accounts → Páginas + IG business accounts + Page tokens ───────
    const pagesRes = await fetch(
      `${GRAPH_BASE}/me/accounts?` +
      new URLSearchParams({
        access_token: userLongToken,
        fields: "id,name,access_token,instagram_business_account{id,name,username,biography,profile_picture_url,followers_count,follows_count,media_count}",
        limit: "200",
      }),
    );
    const pagesJson = await pagesRes.json() as {
      data?: Array<{
        id: string;
        name: string;
        access_token?: string;
        instagram_business_account?: {
          id: string; name?: string; username?: string; biography?: string;
          profile_picture_url?: string; followers_count?: number;
          follows_count?: number; media_count?: number;
        };
      }>;
      error?: { message?: string };
    };
    if (!pagesRes.ok || pagesJson.error) {
      return backToApp("error", { reason: pagesJson.error?.message ?? "Falha ao listar Páginas." });
    }

    const pagesWithIg = (pagesJson.data ?? []).filter((p) => p.instagram_business_account);
    if (pagesWithIg.length === 0) {
      return backToApp("empty");
    }

    // ── 4. Upsert de cada conta com Page token (não-expira), cifrado ─────────
    const sb = supabaseAdmin();
    let connected = 0;
    for (const page of pagesWithIg) {
      const ig = page.instagram_business_account!;
      // Page Access Token derivado de user token longo não expira → preferir.
      // Se ausente por algum motivo, cair no user token longo (60 dias).
      const pageToken = page.access_token ?? userLongToken;
      const expiresAt = page.access_token ? null : new Date(Date.now() + 60 * 86400000).toISOString();

      const { error } = await sb
        .from("instagram_accounts")
        .upsert(
          {
            instagram_business_account_id: ig.id,
            username:            ig.username ?? "",
            name:                ig.name ?? page.name,
            biography:           ig.biography ?? "",
            profile_picture_url: ig.profile_picture_url ?? null,
            followers_count:     ig.followers_count ?? 0,
            follows_count:       ig.follows_count ?? 0,
            media_count:         ig.media_count ?? 0,
            access_token:        encryptToken(pageToken),
            token_expires_at:    expiresAt,
            connection_status:   "active",
            updated_at:          new Date().toISOString(),
          },
          { onConflict: "instagram_business_account_id" },
        );
      if (!error) connected++;
    }

    const res = backToApp("connected", { count: String(connected) });
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (e) {
    return backToApp("error", { reason: String(e) });
  }
}
