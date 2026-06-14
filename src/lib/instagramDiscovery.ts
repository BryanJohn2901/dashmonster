// ─── Descoberta de contas Instagram via System User Token ──────────────────────
//
// Modelo de agência (Business Manager asset sharing):
//  - O cliente compartilha os assets (Página + conta IG) com o SEU Business.
//  - Seu System User Token lê tudo que está dentro do acesso do business —
//    sem precisar de App Review público.
//
// `me/accounts` sozinho só enxerga páginas atribuídas DIRETAMENTE ao usuário.
// Páginas de cliente compartilhadas aparecem em client_pages/owned_pages do
// business. Esta lib varre os três caminhos, com paginação completa, e
// deduplica por ID da conta IG.

import { GRAPH_BASE } from "@/lib/meta";

export interface DiscoveredIgAccount {
  id: string;
  name: string;
  username: string;
  followersCount: number;
  profilePictureUrl?: string;
  biography?: string;
  pageId?: string;
  pageName?: string;
  source: "assigned" | "owned" | "client";
}

const IG_FIELDS =
  "id,name,username,followers_count,profile_picture_url,biography";
const PAGE_FIELDS = `id,name,instagram_business_account{${IG_FIELDS}}`;
const MAX_PAGES = 25; // trava de segurança contra loop de paginação

interface GraphPage {
  id: string;
  name?: string;
  instagram_business_account?: {
    id: string;
    name?: string;
    username?: string;
    followers_count?: number;
    profile_picture_url?: string;
    biography?: string;
  };
}

interface GraphList<T> {
  data?: T[];
  paging?: { next?: string };
  error?: { message?: string };
}

/**
 * Segue `paging.next` (que já carrega o access_token) até esgotar ou bater
 * MAX_PAGES. Best-effort: em erro, devolve o que coletou até então e registra
 * o motivo em `err` para diagnóstico do chamador.
 */
async function fetchAll<T>(
  firstUrl: string,
): Promise<{ items: T[]; err?: string }> {
  const items: T[] = [];
  let url: string | undefined = firstUrl;
  let err: string | undefined;

  for (let i = 0; i < MAX_PAGES && url; i++) {
    const res = await fetch(url);
    const json = (await res.json()) as GraphList<T>;
    if (!res.ok || json.error) {
      err = json.error?.message ?? `Graph API ${res.status}`;
      break;
    }
    if (json.data?.length) items.push(...json.data);
    url = json.paging?.next;
  }

  return { items, err };
}

function mapPage(page: GraphPage, source: DiscoveredIgAccount["source"]): DiscoveredIgAccount | null {
  const ig = page.instagram_business_account;
  if (!ig) return null;
  return {
    id: ig.id,
    name: ig.name ?? page.name ?? "",
    username: ig.username ?? "",
    followersCount: ig.followers_count ?? 0,
    profilePictureUrl: ig.profile_picture_url,
    biography: ig.biography ?? "",
    pageId: page.id,
    pageName: page.name,
    source,
  };
}

/**
 * Descobre todas as contas IG Business acessíveis pelo token, cobrindo:
 *  1. Páginas atribuídas ao usuário/system user  (me/accounts)
 *  2. Páginas próprias de cada business           (owned_pages)
 *  3. Páginas de cliente compartilhadas           (client_pages)
 *
 * Deduplica por ID da conta IG. Tolerante a falha: se a varredura de businesses
 * falhar (token sem business_management, etc.), ainda devolve o que veio de
 * me/accounts.
 */
export async function discoverInstagramAccounts(
  accessToken: string,
): Promise<{ accounts: DiscoveredIgAccount[]; warnings: string[] }> {
  const warnings: string[] = [];
  const byIgId = new Map<string, DiscoveredIgAccount>();

  const add = (acc: DiscoveredIgAccount | null) => {
    if (acc && !byIgId.has(acc.id)) byIgId.set(acc.id, acc);
  };

  // ── 1. me/accounts (páginas atribuídas diretamente) ──────────────────────
  const meAccounts = await fetchAll<GraphPage>(
    `${GRAPH_BASE}/me/accounts?` +
      new URLSearchParams({ access_token: accessToken, fields: PAGE_FIELDS, limit: "100" }),
  );
  if (meAccounts.err) warnings.push(`me/accounts: ${meAccounts.err}`);
  for (const page of meAccounts.items) add(mapPage(page, "assigned"));

  // ── 2 & 3. businesses → owned_pages + client_pages ───────────────────────
  const businesses = await fetchAll<{ id: string; name?: string }>(
    `${GRAPH_BASE}/me/businesses?` +
      new URLSearchParams({ access_token: accessToken, fields: "id,name", limit: "100" }),
  );
  if (businesses.err) {
    warnings.push(`me/businesses: ${businesses.err}`);
  }

  for (const biz of businesses.items) {
    const ownedQs = new URLSearchParams({ access_token: accessToken, fields: PAGE_FIELDS, limit: "100" });
    const clientQs = new URLSearchParams({ access_token: accessToken, fields: PAGE_FIELDS, limit: "100" });

    const [owned, client] = await Promise.all([
      fetchAll<GraphPage>(`${GRAPH_BASE}/${biz.id}/owned_pages?${ownedQs}`),
      fetchAll<GraphPage>(`${GRAPH_BASE}/${biz.id}/client_pages?${clientQs}`),
    ]);

    if (owned.err) warnings.push(`${biz.name ?? biz.id}/owned_pages: ${owned.err}`);
    if (client.err) warnings.push(`${biz.name ?? biz.id}/client_pages: ${client.err}`);

    for (const page of owned.items) add(mapPage(page, "owned"));
    for (const page of client.items) add(mapPage(page, "client"));
  }

  return { accounts: Array.from(byIgId.values()), warnings };
}
