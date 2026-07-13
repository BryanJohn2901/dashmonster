// ─── Meta Graph API — configuração central ────────────────────────────────────
// Única fonte da versão da API. Antes estava hardcoded ("v21.0") em cada rota.

export const META_API_VERSION = "v21.0";
export const GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;
export const FB_WWW_BASE = `https://www.facebook.com/${META_API_VERSION}`;

// Escopos OAuth necessários (agência gerencia as contas dos clientes).
export const IG_OAUTH_SCOPES = [
  "instagram_basic",
  "instagram_manage_insights",
  "instagram_manage_messages",
  "pages_show_list",
  "pages_read_engagement",
  "pages_messaging",
  "business_management",
] as const;

// Escopos do OAuth de Ads (botão "Conectar Facebook" — token global do app).
export const ADS_OAUTH_SCOPES = [
  "ads_read",
  "ads_management",
  "business_management",
] as const;

/** Monta uma URL do Graph API com query string. */
export function graphUrl(path: string, params: Record<string, string>): string {
  const clean = path.startsWith("/") ? path.slice(1) : path;
  return `${GRAPH_BASE}/${clean}?${new URLSearchParams(params)}`;
}

/** Base pública do app (para redirect/callback). Sem barra final. */
export function appBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

/** URI de callback do OAuth — usa env explícita ou deriva de NEXT_PUBLIC_APP_URL. */
export function oauthRedirectUri(): string {
  return (
    process.env.META_OAUTH_REDIRECT_URI ??
    `${appBaseUrl()}/api/instagram/oauth/callback`
  );
}

/** URI de callback do OAuth de Ads — env explícita ou deriva de NEXT_PUBLIC_APP_URL. */
export function adsOauthRedirectUri(): string {
  return (
    process.env.META_ADS_OAUTH_REDIRECT_URI ??
    `${appBaseUrl()}/api/meta/oauth/callback`
  );
}

// ─── Datas (helpers compartilhados pelas rotas) ───────────────────────────────

export function todayStr(): string {
  return new Date().toISOString().split("T")[0]!;
}

export function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0]!;
}

export function toUnix(dateStr: string): number {
  return Math.floor(new Date(dateStr).getTime() / 1000);
}
