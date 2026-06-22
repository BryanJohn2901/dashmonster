// ─── Eduzz OAuth2 + API de leitura (MyEduzz) ──────────────────────────────────
// Complemento ao webhook (src/app/api/eduzz/webhook) — preenche lacunas que
// notificação assíncrona não cobre (contract_created que nunca chega,
// histórico anterior à instalação do webhook, etc). Ver
// src/app/api/eduzz/CLAUDE.md pro porquê completo.
//
// Token Eduzz não expira (`expires_in: 0`) e não tem refresh_token (sempre
// `null`, confirmado na doc oficial) — diferente do fluxo Meta/Instagram.

export const EDUZZ_AUTHORIZE_URL = "https://accounts.eduzz.com/oauth/authorize";
export const EDUZZ_TOKEN_URL = "https://accounts-api.eduzz.com/oauth/token";
export const EDUZZ_API_BASE = "https://api.eduzz.com";

export const EDUZZ_OAUTH_SCOPES = [
  "myeduzz_sales_read",
  "myeduzz_subscriptions_read",
  "myeduzz_products_read",
  "myeduzz_financial_read",
  "myeduzz_customers_read",
] as const;

/** Base pública do app (pra montar a URI de callback). Sem barra final. */
function appBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

/** URI de callback do OAuth Eduzz — usa env explícita ou deriva de NEXT_PUBLIC_APP_URL. */
export function eduzzRedirectUri(): string {
  return process.env.EDUZZ_OAUTH_REDIRECT_URI ?? `${appBaseUrl()}/api/eduzz/oauth/callback`;
}

export interface EduzzTokenResponse {
  access_token: string;
  token_type: string;
  refresh_token: string | null;
  expires_in: number;
  id: string;
  authenticated_userid: string;
  credential: { id: string };
  scope: string;
  created_at: number;
  user: { id: string; eduzzId: string; nutrorId?: string; name: string; email: string };
}

/** Troca o `code` do redirect por um access_token (não expira, sem refresh). */
export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<EduzzTokenResponse> {
  const clientId = process.env.EDUZZ_CLIENT_ID;
  const clientSecret = process.env.EDUZZ_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("EDUZZ_CLIENT_ID/EDUZZ_CLIENT_SECRET não configurados no servidor.");
  }

  const res = await fetch(EDUZZ_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const json = (await res.json().catch(() => null)) as EduzzTokenResponse | { error?: string; message?: string } | null;
  if (!res.ok || !json || !("access_token" in json)) {
    const reason = (json && "message" in json ? json.message : null) ?? (json && "error" in json ? json.error : null);
    throw new Error(reason ?? `Falha ao trocar code por token (HTTP ${res.status}).`);
  }
  return json;
}

// ─── Chamadas à API MyEduzz ────────────────────────────────────────────────────
// Todas GET, header `authorization: bearer <token>` (lowercase, igual exemplo
// oficial da doc). Rate limit confirmado: 30 req/min na maioria dos endpoints.

async function eduzzApiGet<T>(token: string, path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const qs = query.toString();
  const url = `${EDUZZ_API_BASE}${path}${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, { headers: { authorization: `bearer ${token}` } });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const reason = (json && typeof json === "object" && "message" in json ? (json as { message?: string }).message : null);
    throw new Error(reason ?? `Eduzz API ${path} falhou (HTTP ${res.status}).`);
  }
  return json as T;
}

export interface EduzzPaginated<T> {
  items: T[];
  page: number;
  totalPages?: number;
  totalItems?: number;
}

// ─── Vendas ────────────────────────────────────────────────────────────────────

export interface EduzzApiSaleItem {
  productId?: string | number;
  name?: string;
}

export interface EduzzApiSale {
  id: string | number;
  contractId?: string | number | null;
  status?: string;
  recoveringStatus?: string;
  grossGain?: number;
  netGain?: number;
  partnersGain?: number;
  affiliatesGain?: number;
  fee?: number;
  total?: number;
  totalInterest?: number;
  installments?: number;
  dueDate?: string;
  paidAt?: string | null;
  creditDate?: string | null;
  payment?: { method?: string; detail?: string; link?: string };
  product?: { id?: string | number; name?: string; type?: string; billingType?: string; sku?: string };
  refund?: { type?: string; value?: number; partialValue?: number; refundedAt?: string; motive?: string };
  buyer?: {
    name?: string; email?: string; document?: string; phone?: string;
    address?: { street?: string; city?: string; state?: string; zipcode?: string; country?: string };
  };
  recipient?: Record<string, unknown>;
  producer?: Record<string, unknown>;
  affiliate?: Record<string, unknown>;
  affiliates?: Record<string, unknown>[];
  partners?: Record<string, unknown>[];
  items?: EduzzApiSaleItem[];
  offer?: { name?: string };
  utm?: { source?: string; campaign?: string; medium?: string; content?: string; term?: string };
  orderBump?: { has?: boolean; isMainSale?: boolean; mainSaleId?: string | number };
}

export function fetchSales(token: string, startDate: string, endDate: string, page = 1, itemsPerPage = 100): Promise<EduzzPaginated<EduzzApiSale>> {
  return eduzzApiGet(token, "/myeduzz/v1/sales", { startDate, endDate, page, itemsPerPage });
}

export function fetchSaleDetail(token: string, id: string | number): Promise<EduzzApiSale> {
  return eduzzApiGet(token, `/myeduzz/v1/sales/${id}`);
}

// ─── Chargebacks ───────────────────────────────────────────────────────────────

export interface EduzzApiChargeback {
  id: string | number;
  chargebackStatus?: string;
  buyerEmail?: string;
}

export function fetchChargebacks(token: string, startDate: string, endDate: string, page = 1, itemsPerPage = 100): Promise<EduzzPaginated<EduzzApiChargeback>> {
  return eduzzApiGet(token, "/myeduzz/v1/sales/chargebacks", { startDate, endDate, page, itemsPerPage });
}

// ─── Assinaturas ────────────────────────────────────────────────────────────────

export interface EduzzApiSubscription {
  id: string | number;
  createdAt?: string;
  updatedAt?: string;
  status?: string;
  frequency?: string;
  charges?: { total?: number; current?: number; paid?: number; pending?: number; negotiated?: number };
  products?: { id?: string | number; name?: string }[];
  price?: { currency?: string; value?: number };
  method?: string;
  installments?: number;
  client?: { name?: string; email?: string; phone?: string };
  interruption?: { type?: string; reason?: string; responsible?: string };
}

export function fetchSubscriptions(token: string, startDate: string, endDate: string, filterBy: "creation" | "update" = "update", page = 1): Promise<EduzzPaginated<EduzzApiSubscription>> {
  return eduzzApiGet(token, "/myeduzz/v1/subscriptions", { startDate, endDate, filterBy, page });
}

export function fetchSubscriptionDetail(token: string, id: string | number): Promise<EduzzApiSubscription> {
  return eduzzApiGet(token, `/myeduzz/v1/subscriptions/${id}`);
}

// ─── Produtos ────────────────────────────────────────────────────────────────────

export interface EduzzApiProduct {
  id: string | number;
  name?: string;
}

export function fetchProducts(token: string, page = 1, itemsPerPage = 100): Promise<EduzzPaginated<EduzzApiProduct>> {
  return eduzzApiGet(token, "/myeduzz/v1/products", { page, itemsPerPage });
}

// ─── Clientes ────────────────────────────────────────────────────────────────────

export interface EduzzApiCustomer {
  email: string;
  name?: string;
}

export function fetchCustomers(token: string, page = 1, itemsPerPage = 100): Promise<EduzzPaginated<EduzzApiCustomer>> {
  return eduzzApiGet(token, "/myeduzz/v1/customers", { page, itemsPerPage });
}

export function fetchCustomerDetail(token: string, email: string): Promise<EduzzApiCustomer> {
  return eduzzApiGet(token, `/myeduzz/v1/customers/${encodeURIComponent(email)}`);
}

// ─── Financeiro ────────────────────────────────────────────────────────────────────

export interface EduzzApiFinancialEntry {
  saleId?: string | number;
  value?: number;
  type?: string;
  date?: string;
}

export function fetchFinancialStatement(token: string, startDate: string, endDate: string, page = 1, itemsPerPage = 100): Promise<EduzzPaginated<EduzzApiFinancialEntry>> {
  return eduzzApiGet(token, "/myeduzz/v2/financial/statement", { startDate, endDate, page, itemsPerPage });
}
