import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { FB_WWW_BASE, IG_OAUTH_SCOPES, oauthRedirectUri } from "@/lib/meta";

export const runtime = "nodejs";

const STATE_COOKIE = "ig_oauth_state";

/**
 * GET /api/instagram/oauth/start
 * Inicia o fluxo OAuth da Meta. Gera um `state` (CSRF), guarda em cookie
 * httpOnly e redireciona para o diálogo de login do Facebook.
 */
export async function GET(_request: NextRequest) {
  const appId = process.env.META_APP_ID;
  if (!appId) {
    return NextResponse.json(
      { error: "META_APP_ID não configurado no servidor." },
      { status: 500 },
    );
  }

  const state = randomBytes(16).toString("hex");

  const authUrl =
    `${FB_WWW_BASE}/dialog/oauth?` +
    new URLSearchParams({
      client_id:     appId,
      redirect_uri:  oauthRedirectUri(),
      scope:         IG_OAUTH_SCOPES.join(","),
      response_type: "code",
      state,
    });

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/",
    maxAge:   600, // 10 min
  });
  return res;
}
