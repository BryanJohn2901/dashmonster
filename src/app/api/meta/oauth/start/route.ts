import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireAuth } from "@/lib/trackingAuth";
import { FB_WWW_BASE, ADS_OAUTH_SCOPES, adsOauthRedirectUri } from "@/lib/meta";

export const runtime = "nodejs";

const STATE_COOKIE = "meta_oauth_state";

/**
 * POST /api/meta/oauth/start
 *
 * Inicia o OAuth de Ads (botão "Conectar Facebook"). É POST autenticado (Bearer)
 * em vez de redirect direto porque o token da sessão Supabase vive no browser,
 * não em cookie — o client chama via authedFetch e navega para a `url` retornada.
 * O cookie de state guarda também o userId para o callback saber de quem é o token.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  const appId = process.env.META_APP_ID;
  if (!appId) {
    return NextResponse.json(
      { error: "META_APP_ID não configurado no servidor." },
      { status: 500 },
    );
  }

  const state = randomBytes(16).toString("hex");

  const url =
    `${FB_WWW_BASE}/dialog/oauth?` +
    new URLSearchParams({
      client_id:     appId,
      redirect_uri:  adsOauthRedirectUri(),
      scope:         ADS_OAUTH_SCOPES.join(","),
      response_type: "code",
      state,
    });

  const res = NextResponse.json({ url });
  res.cookies.set(STATE_COOKIE, `${state}.${auth.userId}`, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/",
    maxAge:   600, // 10 min
  });
  return res;
}
