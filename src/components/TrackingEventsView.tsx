"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Search, RefreshCw, Calendar, Radar, X, Mail, Phone, MapPin, User, ShoppingBag, CreditCard, Hash, Smartphone, Monitor, Tablet, BarChart3, Table2, Filter, Workflow, SlidersHorizontal, ChevronLeft, ChevronRight } from "lucide-react";
import { supabaseClient } from "@/lib/supabase";
import { fetchEventsLogSplit } from "@/lib/eventsLogFetch";
import { isDevModeActive } from "@/hooks/useDevMode";
import { DEMO_TRACKING_EVENTS } from "@/lib/demoTracking";
import { DateRangePicker } from "@/components/DateRangePicker";
import { useCompany, fetchTrackingFunnels, type TrackingFunnel } from "@/hooks/useCompany";
import { FunnelConfigSection } from "@/components/FunnelConfigSection";
import { TrackingAnalytics } from "@/components/tracking/TrackingAnalytics";
import { productBaseName, matchProductNames } from "@/lib/eduzz";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrackingEvent {
  id: string;
  event_name: string;
  fingerprint_id: string;
  event_url: string | null;
  page_title: string | null;
  user_data: { em?: string; ph?: string } | null;
  lead_email: string | null;
  lead_phone: string | null;
  lead_name: string | null;
  extra_fields: Record<string, string> | null;
  country: string | null;
  country_region: string | null;
  city: string | null;
  event_id: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  utm_placement: string | null;
  utm_campaign_id: string | null;
  utm_adset_id: string | null;
  utm_ad_id: string | null;
  capi_status: "pending" | "sent" | "failed" | "skipped";
  capi_error: string | null;
  // Venda (Eduzz e futuras plataformas) — ver src/app/api/eduzz/CLAUDE.md.
  /** Valor CHEIO — pra Purchase de venda parcelada já vem multiplicado (boleto: parcela × total; assinatura/PSL: cobrança × nº de parcelas do contrato). Pra Renewal/Installment é igual a `installment_value` (nunca multiplicam nada). */
  value: number | null;
  currency: string | null;
  external_transaction_id: string | null;
  source: string | null; // "pixel" (default) | "eduzz"
  payment_method: string | null;
  /** Total de parcelas/cobranças (boleto em 3x OU contrato de assinatura/PSL com nº fixo) — null pra cartão à vista (operadora decide parcelamento, invisível pra plataforma) e assinatura sem ficha de contrato conhecida ainda. */
  installments: number | null;
  /** Qual parcela/cobrança esse registro representa (1, 2, 3...) — migration 053. Parcela 1 do boleto e 1ª cobrança da assinatura sempre valem 1. */
  installment_number: number | null;
  /** Valor só DESSA parcela/cobrança específica (migration 054) — diferente de `value` só quando for a Purchase (parcela 1/1ª cobrança) de uma venda parcelada; nas outras linhas é igual a `value`. */
  installment_value: number | null;
  /** Id da assinatura/contrato recorrente (migration 042) — presente = é assinatura/PSL, não parcelamento de boleto. */
  recurrence_key: string | null;
  /** Mesma string de campaign_metrics.campaign_name — coluna própria (migration 044), não só dentro de extra_fields. */
  product_name: string | null;
  /** true quando essa Purchase é um order bump (produto extra do checkout Eduzz), não a venda principal — migration 046. */
  is_order_bump: boolean | null;
  /** external_transaction_id da venda principal a que esse order bump/parcela pertence — null pra venda principal. */
  main_sale_transaction_id: string | null;
  /** User-Agent crú do navegador (migration 047) — só eventos de pixel mandam isso direto (venda Eduzz só tem se a visita foi correlacionada). Usado pra extrair OS/modelo (ver `parseUserAgent`), nunca exibido crú (string enorme, pouco legível). */
  client_user_agent: string | null;
  /** "proxy" | "direct" | null — migration 057. Mandado pelo pixel.js (PROXY_MODE, decidido no servidor); null em evento antigo ou venda Eduzz (não passa por aqui). */
  via: string | null;
  /** UUID do pixel (tracking_pixels) que recebeu este evento — migration 037. */
  pixel_id: string | null;
  /** ID do produto pai Eduzz (eduzz_products.parent_id) — migration 048. */
  product_parent_id: string | null;
  /** Itemização da fatura (migration 079) — nome/valor/papel de CADA produto (principal + order bump), já que product_name/product_parent_id só guardam o produto ESCOLHIDO como principal (ver src/app/api/eduzz/CLAUDE.md, "Correção 2026-07-06"). null em evento antigo (antes da migration) ou sem itens estruturados (postback antigo). */
  items: { name: string; value: number; role: "main" | "bump" }[] | null;
  created_at: string;
}

export interface Visitor {
  fingerprintId: string;
  /** Todos os fingerprint_id's unidos neste visitante (>1 quando a mesma pessoa apareceu em dispositivos/cookies diferentes mas com o MESMO email ou telefone — ver groupByVisitor). Sempre inclui fingerprintId. */
  mergedFingerprintIds: string[];
  events: TrackingEvent[]; // mais recente primeiro
  firstSeen: string;
  lastSeen: string;
  isLead: boolean;
  leadEmail: string | null;
  leadPhone: string | null;
  // Email/telefone de QUALQUER evento (inclui Purchase sem Lead correlacionado)
  // — só pra busca, não usado na UI (que mostra leadEmail/leadPhone, Lead-only).
  anyEmail: string | null;
  anyPhone: string | null;
  leadFields: Record<string, string>;
  lastUrl: string | null;
  lastPageTitle: string | null;
  lastUtm: Record<string, string>;
  lastLocation: { country: string | null; countryRegion: string | null; city: string | null };
  /** UA crú do evento mais recente — null quando essa linha não tem (ex.: venda Eduzz sem visita correlacionada). Usado pras colunas OS/Dispositivo/Browser da tabela (ver parseOS/parseUserAgent/parseBrowser). */
  lastUserAgent: string | null;
  /** "proxy" | "direct" | null — do evento mais recente que tiver isso preenchido (mesma lógica de lastUserAgent). */
  lastVia: string | null;
  isCustomer: boolean;
  totalRevenue: number;
  purchaseCount: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const EVENT_LABELS: Record<string, string> = {
  Lead: "Lead",
  Contact: "WhatsApp",
  Purchase: "Compra",
  PageView: "Visualização",
  AddToCart: "Carrinho",
  // Renewal = cobrança recorrente de assinatura/PSL já conhecida; Installment
  // = parcela > 1 de boleto parcelado. Os 2 são dinheiro de verdade (entram
  // em campaign_metrics), só não são "venda nova" pra Meta — ver CLAUDE.md.
  Renewal: "Renovação",
  Installment: "Parcela",
};

export const EVENT_COLORS: Record<string, { bg: string; text: string }> = {
  Lead: { bg: "rgba(22,163,74,0.12)", text: "var(--dm-primary)" },
  Contact: { bg: "rgba(16,185,129,0.12)", text: "#059669" },
  Purchase: { bg: "rgba(22,163,74,0.12)", text: "#15803D" },
  PageView: { bg: "rgba(100,116,139,0.12)", text: "#475569" },
  AddToCart: { bg: "rgba(34,197,94,0.12)", text: "#16A34A" },
  Renewal: { bg: "rgba(22,163,74,0.12)", text: "#15803D" },
  Installment: { bg: "rgba(22,163,74,0.12)", text: "#15803D" },
};

const STATUS_LABELS: Record<string, string> = {
  sent: "Enviado à Meta",
  pending: "Enviando…",
  failed: "Falhou na Meta",
  skipped: "Capturado (sem Meta)",
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  sent: { bg: "rgba(16,185,129,0.12)", text: "#059669" },
  pending: { bg: "rgba(245,158,11,0.12)", text: "#d97706" },
  failed: { bg: "rgba(239,68,68,0.12)", text: "#dc2626" },
  skipped: { bg: "rgba(100,116,139,0.12)", text: "var(--dm-text-tertiary)" },
};

const DEVICE_LABELS: Record<"mobile" | "tablet" | "desktop", string> = { mobile: "Celular", tablet: "Tablet", desktop: "Desktop" };

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_placement",
  "utm_campaign_id",
  "utm_adset_id",
  "utm_ad_id",
];

const EVENTS_SELECT =
  "id, event_name, fingerprint_id, event_url, page_title, user_data, lead_email, lead_phone, lead_name, extra_fields, country, country_region, city, event_id, " +
  "utm_source, utm_medium, utm_campaign, utm_content, utm_term, utm_placement, utm_campaign_id, utm_adset_id, utm_ad_id, " +
  "value, currency, external_transaction_id, source, payment_method, installments, installment_number, installment_value, recurrence_key, product_name, product_parent_id, is_order_bump, main_sale_transaction_id, items, client_user_agent, via, pixel_id, capi_status, capi_error, created_at";
// Sem as colunas das migrations 033/034/036/038/039/040/043/044 — usado se alguma delas ainda não rodou
// no banco, pra não derrubar a tela enquanto ela não é aplicada manualmente no Supabase.
const EVENTS_SELECT_FALLBACK = "id, event_name, fingerprint_id, event_url, user_data, lead_email, lead_phone, capi_status, capi_error, created_at";

// Bandeira a partir do código ISO (ex.: "BR" -> 🇧🇷) — calculada no client,
// não precisa guardar emoji no banco.
export function flagEmoji(countryCode: string | null): string {
  if (!countryCode || !/^[A-Za-z]{2}$/.test(countryCode)) return "";
  return String.fromCodePoint(...[...countryCode.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)));
}

function formatLocation(loc: { country: string | null; countryRegion: string | null; city: string | null }): string {
  const parts = [loc.city, loc.countryRegion].filter(Boolean);
  const flag = flagEmoji(loc.country);
  if (parts.length === 0 && !loc.country) return "";
  return `${flag} ${parts.join(", ")}${loc.country ? (parts.length ? ` · ${loc.country}` : loc.country) : ""}`.trim();
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "agora mesmo";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days}d`;
  return fmt(iso);
}

// Anúncios (ex.: Meta) costumam montar a UTM a partir de um placeholder
// ({{ad.name}} etc.) que já vem URL-encoded — somado ao encoding normal da
// query string, o valor chega com 2 camadas (%2520, %252F, "+" literal...).
// Decodifica em loop até estabilizar (defensivo: nunca lança, só desiste).
function decodeUtmValue(raw: string): string {
  let value = raw;
  for (let i = 0; i < 4; i++) {
    if (!/%[0-9A-Fa-f]{2}/.test(value) && !value.includes("+")) break;
    try {
      const decoded = decodeURIComponent(value.replace(/\+/g, " "));
      if (decoded === value) break;
      value = decoded;
    } catch {
      break;
    }
  }
  return value;
}

function parseUtmFromUrl(url: string | null): Record<string, string> {
  if (!url) return {};
  try {
    const u = new URL(url);
    const out: Record<string, string> = {};
    for (const key of UTM_KEYS) {
      const v = u.searchParams.get(key);
      if (v) out[key] = decodeUtmValue(v);
    }
    return out;
  } catch {
    return {};
  }
}

// Migration 038 grava a UTM em coluna própria (extraída 1x no servidor, na
// captura) — usa ela quando existir. Reprocessa a event_url só pra eventos
// antigos (capturados antes da migration) ou enquanto ela não rodou ainda,
// mesmo padrão de resiliência das outras migrations desta tela.
export function resolveUtm(event: Pick<TrackingEvent, "event_url" | "utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term" | "utm_placement" | "utm_campaign_id" | "utm_adset_id" | "utm_ad_id">): Record<string, string> {
  const fromUrl = parseUtmFromUrl(event.event_url);
  const out: Record<string, string> = { ...fromUrl };
  for (const key of UTM_KEYS) {
    const stored = event[key as keyof typeof event] as string | null | undefined;
    if (stored) out[key] = stored;
  }
  return out;
}

// Caminho da página sem os parâmetros utm_* (esses já aparecem como chips à parte).
function urlPath(url: string | null): string {
  if (!url) return "—";
  try {
    const u = new URL(url);
    for (const key of UTM_KEYS) u.searchParams.delete(key);
    const query = u.searchParams.toString();
    return u.pathname + (query ? `?${query}` : "");
  } catch {
    return url;
  }
}

export function formatMoney(value: number | null, currency: string | null): string {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format(value);
  } catch {
    return `${currency ?? "BRL"} ${value.toFixed(2)}`;
  }
}

// Valores que o formato moderno da Eduzz manda (enum fixo) — formato antigo
// manda string livre, por isso o fallback é só mostrar o valor cru.
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bankslip: "Boleto",
  pix: "Pix",
  creditCard: "Cartão de crédito",
  combinedPayment: "Pagamento combinado",
  installmentBankslip: "Boleto parcelado",
  unknown: "Desconhecido",
};
// "Boleto parcelado · 3x" quando souber o número de parcelas (só boleto
// parcelado e assinatura/PSL com ficha de contrato conhecida mandam isso —
// parcelamento de cartão "normal" é decidido pela operadora, invisível pra
// plataforma, por isso installments fica null nesse caso e mostra só o método).
// `isRecurring` (recurrence_key presente) marca explicitamente "Assinatura"
// quando o método em si não deixa isso claro (ex.: "Cartão de crédito" sozinho
// não diz se é parcelamento normal ou uma assinatura/PSL por trás).
function paymentMethodLabel(method: string | null, installments: number | null = null, isRecurring = false): string | null {
  if (!method) return null;
  const label = PAYMENT_METHOD_LABELS[method] ?? method;
  const tagged = isRecurring && method !== "installmentBankslip" ? `${label} · Assinatura` : label;
  return installments && installments > 1 ? `${tagged} · ${installments}x` : tagged;
}

// "Parcela 1 de 3" / "Cobrança 2 de 12" — progresso dentro do parcelamento,
// separado do método de pagamento (esse já mostra o "3x"/"12x" total, isso
// aqui mostra EM QUAL parcela/cobrança essa linha específica está).
function installmentProgressLabel(installmentNumber: number | null, installments: number | null, isRecurring: boolean): string | null {
  if (!installmentNumber || !installments || installments <= 1) return null;
  return `${isRecurring ? "Cobrança" : "Parcela"} ${installmentNumber} de ${installments}`;
}

// Extrai OS (+ versão) e, quando disponível, modelo do aparelho a partir do
// User-Agent crú — só client-side, não guarda nada novo no banco (o UA já
// está salvo, isso é só apresentação). iPhone/iPad NUNCA expõem modelo no UA
// (Apple esconde por design, só "iPhone"/"iPad" genérico) — Android costuma
// vir com o modelo (ex.: "SM-G991B"). iPadOS 13+ por padrão finge ser
// Macintosh/desktop Safari ("Solicitar site para desktop" ligado por padrão)
// — nesse caso não tem como diferenciar de um Mac real só pelo UA.
export function parseUserAgent(ua: string | null): { device: "mobile" | "tablet" | "desktop"; label: string } | null {
  if (!ua) return null;

  let m = ua.match(/iPad.*?OS (\d+)[_.](\d+)/);
  if (m) return { device: "tablet", label: `iPad · iPadOS ${m[1]}.${m[2]}` };

  m = ua.match(/iPhone.*?OS (\d+)[_.](\d+)/);
  if (m) return { device: "mobile", label: `iPhone · iOS ${m[1]}.${m[2]}` };

  m = ua.match(/Android (\d+(?:\.\d+)?)(?:;\s*([^;)]+))?/);
  if (m) {
    const model = m[2]?.trim().replace(/\s*Build.*$/i, "");
    // Convenção do Android: UA de TABLET OMITE o token "Mobile" — não tem
    // relação com a palavra literal "tablet" aparecer no UA (raramente
    // aparece). Bug real corrigido: um Galaxy Tab (ex.: "SM-T580") sem
    // "Mobile" no UA caía sempre em "mobile" por engano antes desse fix.
    const device = /Mobile/i.test(ua) ? "mobile" : "tablet";
    return { device, label: model && model.length > 0 && model.length < 40 ? `Android ${m[1]} · ${model}` : `Android ${m[1]}` };
  }

  m = ua.match(/Windows NT (\d+\.\d+)/);
  if (m) {
    const WINDOWS_VERSIONS: Record<string, string> = { "10.0": "Windows 10/11", "6.3": "Windows 8.1", "6.2": "Windows 8", "6.1": "Windows 7" };
    return { device: "desktop", label: WINDOWS_VERSIONS[m[1]] ?? `Windows NT ${m[1]}` };
  }

  m = ua.match(/Mac OS X (\d+)[_.](\d+)/);
  if (m) return { device: "desktop", label: `macOS ${m[1]}.${m[2]}` };

  if (/CrOS/.test(ua)) return { device: "desktop", label: "Chrome OS" };
  if (/Linux/.test(ua)) return { device: "desktop", label: "Linux" };

  return null;
}

// Versão "crua" do sistema operacional pra coluna própria da tabela (OS), sem
// misturar modelo de aparelho — diferente de `parseUserAgent` acima, que
// monta um label combinado (OS + modelo) pra exibição no drawer do visitante.
export function parseOS(ua: string | null): string | null {
  const parsed = parseUserAgent(ua);
  if (!parsed) return null;
  // Remove o "· modelo" do label combinado (só existe pra Android) — sobra só o SO.
  return parsed.label.split(" · ")[0];
}

// Navegador a partir do User-Agent — checagem em ordem de especificidade:
// navegadores in-app (Facebook/Instagram) e baseados em Chromium (Edge, Opera,
// Samsung Internet) incluem o token "Chrome"/"Safari" no próprio UA, então
// teriam falso positivo se Chrome/Safari fossem checados primeiro.
export function parseBrowser(ua: string | null): string | null {
  if (!ua) return null;
  if (/FBAN|FBAV|FB_IAB/.test(ua)) return "Facebook (in-app)";
  if (/Instagram/.test(ua)) return "Instagram (in-app)";
  if (/MicroMessenger/.test(ua)) return "WeChat (in-app)";
  if (/EdgiOS|EdgA|Edg\//.test(ua)) return "Edge";
  if (/OPR\/|OPiOS|Opera/.test(ua)) return "Opera";
  if (/SamsungBrowser/.test(ua)) return "Samsung Internet";
  if (/CriOS|Chrome\//.test(ua)) return "Chrome";
  if (/FxiOS|Firefox/.test(ua)) return "Firefox";
  if (/Safari/.test(ua) && /Version\//.test(ua)) return "Safari";
  return null;
}

// Builders de formulário (Elementor, WP Forms etc.) costumam nomear o input
// com notação de array — ex.: "form_fields[name]", "data[telefone]" — extrai
// só o nome legível de dentro dos colchetes e formata como rótulo.
function humanizeFieldKey(key: string): string {
  const bracketMatch = key.match(/\[([^\]]+)\]\s*$/);
  const raw = bracketMatch ? bracketMatch[1] : key;
  const spaced = raw.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Extrai o nome base do produto a partir do nome bruto do Eduzz.
// Eduzz retorna nomes de oferta com prefixos de código e texto de desconto:

// Remove query string from URL (strips UTMs and other params before matching).
function stripQueryString(url: string): string {
  const idx = url.indexOf("?");
  return idx >= 0 ? url.slice(0, idx) : url;
}

// Attribution: 1º product_name → 2º utm_campaign → 3º url_pattern.
// Retorna o 1º funil cujo matcher casar com qualquer evento do visitante.
// Verifica se um único evento pertence a um funil — base da atribuição multi-funil.
// Pixel null no evento passa (evento capturado antes da migration 037).
export function eventMatchesFunnel(e: TrackingEvent, funnel: TrackingFunnel): boolean {
  // Produto tem prioridade — compras Eduzz chegam server-side sem pixel_id.
  // Match por ID (confiável) ou por nome (fallback para eventos sem product_parent_id).
  if (funnel.productParentIds.length > 0 && e.product_parent_id) {
    if (funnel.productParentIds.includes(e.product_parent_id)) return true;
  }
  if (funnel.productNames.length > 0 && e.product_name) {
    if (funnel.productNames.some((p) => matchProductNames(e.product_name!, p))) return true;
  }
  // Pixel guard se aplica ao match por URL/UTM
  if (funnel.pixelId && e.pixel_id !== funnel.pixelId) return false;
  const hasMatchers = funnel.productNames.length > 0 || funnel.utmCampaigns.length > 0 || funnel.urlPatterns.length > 0;
  if (!hasMatchers) return !funnel.pixelId || e.pixel_id === funnel.pixelId;
  const utmCamp = e.utm_campaign ?? parseUtmFromUrl(e.event_url).utm_campaign;
  if (funnel.utmCampaigns.length > 0 && utmCamp) {
    if (funnel.utmCampaigns.some((c) => utmCamp.toLowerCase() === c.toLowerCase())) return true;
  }
  if (funnel.urlPatterns.length > 0 && e.event_url) {
    const baseUrl = stripQueryString(e.event_url).toLowerCase();
    if (funnel.urlPatterns.some((p) => baseUrl.includes(p.toLowerCase()))) return true;
  }
  return false;
}

function isVisibleTrackingEvent(e: TrackingEvent): boolean {
  if (e.event_name === "Renewal" || e.event_name === "Installment") return false;
  if (e.event_name !== "Purchase") return true;
  if (!e.recurrence_key) return true;
  if (e.installments != null && e.installments <= 1) return false;
  if (e.value == null || e.installment_value == null) return false;
  return e.value !== e.installment_value;
}

// Normalização mínima e conservadora — só pra evitar falso-negativo óbvio
// (espaço/maiúscula), nunca pra "adivinhar" (ex.: telefone com/sem DDI ou
// máscara não é normalizado — limitação conhecida, ver CLAUDE.md). Melhor
// deixar de unir um visitante do que unir 2 pessoas diferentes por engano.
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
function normalizePhone(phone: string): string {
  return phone.trim();
}

function buildVisitorFromEvents(fingerprintId: string, list: TrackingEvent[], mergedFingerprintIds: string[]): Visitor {
  const sorted = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
  // event_name === "Lead" especificamente — Purchase (venda Eduzz) também
  // grava lead_email/lead_phone (mesmo comprador), mas não é um cadastro de
  // formulário, não deve aparecer como "Lead" nem entrar no seletor de
  // "Dados capturados" do drawer (ver VisitorDrawer).
  const leadEvent = sorted.find((e) => e.event_name === "Lead");
  const purchaseEvents = sorted.filter((e) => e.event_name === "Purchase");
  return {
    fingerprintId,
    mergedFingerprintIds,
    events: sorted,
    lastSeen: sorted[0].created_at,
    firstSeen: sorted[sorted.length - 1].created_at,
    isLead: Boolean(leadEvent),
    leadEmail: leadEvent?.lead_email ?? null,
    leadPhone: leadEvent?.lead_phone ?? null,
    anyEmail: sorted.find((e) => e.lead_email)?.lead_email ?? null,
    anyPhone: sorted.find((e) => e.lead_phone)?.lead_phone ?? null,
    leadFields: leadEvent?.extra_fields ?? {},
    lastUrl: sorted[0].event_url,
    lastPageTitle: sorted[0].page_title,
    lastUtm: resolveUtm(sorted[0]),
    // Geo: prefere evento com cidade/estado (browser real) — evita que uma
    // Purchase/Lead server-side (IP do servidor, geralmente US) sobrescreva
    // a localização real do visitante que veio da PageView anterior.
    lastLocation: (() => {
      const withCity = sorted.find((e) => e.city || e.country_region);
      const withCountry = sorted.find((e) => e.country);
      const best = withCity ?? withCountry ?? sorted[0];
      return { country: best.country, countryRegion: best.country_region, city: best.city };
    })(),
    // Mais recente primeiro (sorted) — pega o 1º evento que TEM UA, não
    // necessariamente sorted[0] (ex.: a Purchase mais recente pode não ter
    // UA por não ter casado com nenhuma visita, mas a PageView anterior tem).
    lastUserAgent: sorted.find((e) => e.client_user_agent)?.client_user_agent ?? null,
    lastVia: sorted.find((e) => e.via)?.via ?? null,
    isCustomer: purchaseEvents.length > 0,
    totalRevenue: purchaseEvents.reduce((sum, e) => sum + (e.value ?? 0), 0),
    purchaseCount: purchaseEvents.length,
  };
}

export function groupByVisitor(events: TrackingEvent[]): Visitor[] {
  const byFingerprint = new Map<string, TrackingEvent[]>();
  for (const e of events) {
    const list = byFingerprint.get(e.fingerprint_id);
    if (list) list.push(e);
    else byFingerprint.set(e.fingerprint_id, [e]);
  }

  // Une fingerprints da MESMA pessoa em dispositivos/cookies diferentes —
  // cookie (_dm_uid) vive por navegador, então trocar de aparelho sempre gera
  // um fingerprint novo; email/telefone (capturados em Lead OU Purchase) são o
  // único jeito de saber que são a mesma pessoa. Union-Find: 2 fingerprints
  // entram no mesmo grupo se QUALQUER evento de um bate (email OU telefone,
  // exato/normalizado) com QUALQUER evento do outro.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) && parent.get(root) !== root) root = parent.get(root)!;
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const fp of byFingerprint.keys()) parent.set(fp, fp);

  const fpsByEmail = new Map<string, Set<string>>();
  const fpsByPhone = new Map<string, Set<string>>();
  for (const [fp, list] of byFingerprint) {
    for (const e of list) {
      if (e.lead_email) {
        const key = normalizeEmail(e.lead_email);
        if (!fpsByEmail.has(key)) fpsByEmail.set(key, new Set());
        fpsByEmail.get(key)!.add(fp);
      }
      if (e.lead_phone) {
        const key = normalizePhone(e.lead_phone);
        if (!fpsByPhone.has(key)) fpsByPhone.set(key, new Set());
        fpsByPhone.get(key)!.add(fp);
      }
    }
  }
  for (const group of [...fpsByEmail.values(), ...fpsByPhone.values()]) {
    const [first, ...rest] = [...group];
    for (const fp of rest) union(first, fp);
  }

  const mergedGroups = new Map<string, string[]>(); // root -> fingerprintIds
  for (const fp of byFingerprint.keys()) {
    const root = find(fp);
    const list = mergedGroups.get(root) ?? [];
    list.push(fp);
    mergedGroups.set(root, list);
  }

  const visitors: Visitor[] = [];
  for (const fingerprintIds of mergedGroups.values()) {
    const allEvents = fingerprintIds.flatMap((fp) => byFingerprint.get(fp)!);
    // Representante do grupo: fingerprint do evento mais recente — só usado
    // como chave/id de exibição (drawer, key de lista); cada evento individual
    // mantém seu próprio fingerprint_id original, intocado.
    const newestFp = [...allEvents].sort((a, b) => b.created_at.localeCompare(a.created_at))[0].fingerprint_id;
    visitors.push(buildVisitorFromEvents(newestFp, allEvents, fingerprintIds));
  }

  return visitors.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}

// ─── Filter chip ──────────────────────────────────────────────────────────────

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-opacity hover:opacity-80"
      style={{
        borderColor: active ? "var(--dm-primary)" : "var(--dm-border-default)",
        background: active ? "rgba(22,163,74,0.12)" : "transparent",
        color: active ? "var(--dm-primary)" : "var(--dm-text-tertiary)",
      }}
    >
      {label}
    </button>
  );
}

// ─── Detail drawer ────────────────────────────────────────────────────────────

function VisitorDrawer({ visitor, onClose }: { visitor: Visitor; onClose: () => void }) {
  // events vem ordenado do mais recente pro mais antigo (groupByVisitor) — o
  // primeiro lead da lista é o cadastro mais recente, é o default exibido.
  // Só event_name === "Lead" — Purchase (venda Eduzz) também grava
  // lead_email/lead_phone do mesmo comprador, mas tem seu próprio resumo
  // (purchaseEvents abaixo), não entra nesse seletor de cadastro de formulário.
  const leadEvents = visitor.events.filter((e) => e.event_name === "Lead");
  const purchaseEvents = visitor.events.filter((e) => e.event_name === "Purchase");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const selectedLead = leadEvents.find((e) => e.id === selectedLeadId) ?? leadEvents[0] ?? null;
  const selectedLeadDevice = selectedLead ? parseUserAgent(selectedLead.client_user_agent) : null;
  const SelectedLeadDeviceIcon = selectedLeadDevice?.device === "mobile" ? Smartphone : selectedLeadDevice?.device === "tablet" ? Tablet : Monitor;

  if (typeof document === "undefined") return null;

  const timeline = [...visitor.events].reverse(); // ordem cronológica: o que ele fez primeiro até o último

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
      <div
        className="relative z-10 flex max-h-[86vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border shadow-2xl"
        style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b px-6 py-4" style={{ borderColor: "var(--dm-border-default)" }}>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>Histórico do visitante</h3>
              {visitor.mergedFingerprintIds.length > 1 && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                  style={{ background: "rgba(22,163,74,0.12)", color: "var(--dm-primary)" }}
                  title="Mesmo email/telefone visto em navegadores ou dispositivos diferentes — jornadas unidas."
                >
                  {visitor.mergedFingerprintIds.length} dispositivos
                </span>
              )}
            </div>
            <p className="font-mono text-[10px] mt-0.5" style={{ color: "var(--dm-text-tertiary)" }}>{visitor.fingerprintId}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="flex h-7 w-7 items-center justify-center rounded-full transition-opacity hover:opacity-70" style={{ color: "var(--dm-text-tertiary)" }}>
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {selectedLead && (
            <div className="mb-5 rounded-xl border p-3" style={{ borderColor: "var(--dm-primary)", background: "rgba(22,163,74,0.06)" }}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-primary)" }}>
                  Dados capturados {selectedLead.id === leadEvents[0]?.id ? "(mais recente)" : ""}
                </p>
                <span className="text-[10px] tabular-nums" style={{ color: "var(--dm-text-tertiary)" }}>{fmt(selectedLead.created_at)}</span>
              </div>
              {selectedLead.lead_email && (
                <p className="mb-1 flex items-center gap-1.5 text-xs" style={{ color: "var(--dm-text-primary)" }}>
                  <Mail size={12} style={{ color: "var(--dm-text-tertiary)" }} /> {selectedLead.lead_email}
                </p>
              )}
              {selectedLead.lead_phone && (
                <p className="mb-1 flex items-center gap-1.5 text-xs" style={{ color: "var(--dm-text-primary)" }}>
                  <Phone size={12} style={{ color: "var(--dm-text-tertiary)" }} /> {selectedLead.lead_phone}
                </p>
              )}
              {Object.entries(selectedLead.extra_fields ?? {}).map(([key, value]) => (
                <p key={key} className="mb-1 flex items-center gap-1.5 text-xs" style={{ color: "var(--dm-text-primary)" }}>
                  <User size={12} style={{ color: "var(--dm-text-tertiary)" }} />
                  <span style={{ color: "var(--dm-text-tertiary)" }}>{humanizeFieldKey(key)}:</span> {value}
                </p>
              ))}
              {formatLocation({ country: selectedLead.country, countryRegion: selectedLead.country_region, city: selectedLead.city }) && (
                <p className="mb-1 flex items-center gap-1.5 text-xs" style={{ color: "var(--dm-text-primary)" }}>
                  <MapPin size={12} style={{ color: "var(--dm-text-tertiary)" }} />
                  {formatLocation({ country: selectedLead.country, countryRegion: selectedLead.country_region, city: selectedLead.city })}
                </p>
              )}
              {selectedLeadDevice && (
                <p className="mb-1 flex items-center gap-1.5 text-xs" style={{ color: "var(--dm-text-primary)" }}>
                  <SelectedLeadDeviceIcon size={12} style={{ color: "var(--dm-text-tertiary)" }} /> {selectedLeadDevice.label}
                </p>
              )}
              {leadEvents.length > 1 && (
                <p className="mt-2 text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                  {leadEvents.length} cadastros deste visitante — clique num evento &quot;Lead&quot; na jornada abaixo pra ver os dados daquele cadastro.
                </p>
              )}
            </div>
          )}

          {purchaseEvents.length > 0 && (
            <div className="mb-5 rounded-xl border p-3" style={{ borderColor: EVENT_COLORS.Purchase.text, background: "rgba(22,163,74,0.06)" }}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: EVENT_COLORS.Purchase.text }}>
                  <ShoppingBag size={12} /> {purchaseEvents.length > 1 ? `${purchaseEvents.length} compras` : "Compra"}
                </p>
                <span className="text-sm font-bold tabular-nums" style={{ color: EVENT_COLORS.Purchase.text }}>
                  {formatMoney(visitor.totalRevenue, purchaseEvents[0]?.currency)}
                </span>
              </div>
              {purchaseEvents.map((p) => (
                <div key={p.id} className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs last:mb-0" style={{ color: "var(--dm-text-primary)" }}>
                  <span className="font-semibold">{formatMoney(p.value, p.currency)}</span>
                  {p.installment_value != null && p.installment_value !== p.value && (
                    <span className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }} title="Valor pago só nessa parcela/cobrança — o de cima é o valor cheio da venda">
                      (parcela: {formatMoney(p.installment_value, p.currency)})
                    </span>
                  )}
                  {(p.product_name ?? p.extra_fields?.produto) && (
                    <span style={{ color: "var(--dm-text-tertiary)" }}>· {p.product_name ?? p.extra_fields?.produto}</span>
                  )}
                  {p.items && p.items.length > 1 && (
                    <div className="mt-1 flex w-full flex-col gap-0.5 pl-3">
                      {p.items.map((item, i) => (
                        <span key={i} className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[8px] font-semibold"
                            style={
                              item.role === "bump"
                                ? { background: "rgba(22,163,74,0.12)", color: "#16A34A" }
                                : { background: "rgba(100,116,139,0.12)", color: "var(--dm-text-tertiary)" }
                            }
                          >
                            {item.role === "bump" ? "bump" : "principal"}
                          </span>
                          {item.name} · {formatMoney(item.value, p.currency)}
                        </span>
                      ))}
                    </div>
                  )}
                  {p.is_order_bump && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                      style={{ background: "rgba(22,163,74,0.12)", color: "#16A34A" }}
                      title={p.main_sale_transaction_id ? `Order bump da venda #${p.main_sale_transaction_id}` : "Order bump"}
                    >
                      order bump
                    </span>
                  )}
                  {paymentMethodLabel(p.payment_method, p.installments, Boolean(p.recurrence_key)) && (
                    <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                      <CreditCard size={10} /> {paymentMethodLabel(p.payment_method, p.installments, Boolean(p.recurrence_key))}
                    </span>
                  )}
                  {installmentProgressLabel(p.installment_number, p.installments, Boolean(p.recurrence_key)) && (
                    <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                      <Hash size={10} /> {installmentProgressLabel(p.installment_number, p.installments, Boolean(p.recurrence_key))}
                    </span>
                  )}
                  <span className="text-[10px] tabular-nums" style={{ color: "var(--dm-text-tertiary)" }}>{fmt(p.created_at)}</span>
                </div>
              ))}
            </div>
          )}

          <p className="mb-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
            Jornada · {timeline.length} evento{timeline.length !== 1 ? "s" : ""}
          </p>

          <div className="relative flex flex-col gap-4 border-l pl-4" style={{ borderColor: "var(--dm-border-default)" }}>
            {timeline.map((event) => {
              const evColor = EVENT_COLORS[event.event_name] ?? { bg: "rgba(100,100,100,0.10)", text: "var(--dm-text-tertiary)" };
              const utm = resolveUtm(event);
              const utmEntries = Object.entries(utm);
              const isLeadEvent = event.event_name === "Lead";
              const isSelected = isLeadEvent && event.id === selectedLead?.id;
              const device = parseUserAgent(event.client_user_agent);
              const DeviceIcon = device?.device === "mobile" ? Smartphone : device?.device === "tablet" ? Tablet : Monitor;
              return (
                <div
                  key={event.id}
                  className="relative"
                  onClick={isLeadEvent ? () => setSelectedLeadId(event.id) : undefined}
                  style={isLeadEvent ? { cursor: "pointer" } : undefined}
                >
                  <span
                    className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2"
                    style={{ background: isSelected ? evColor.text : "var(--dm-bg-surface)", borderColor: evColor.text }}
                  />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className="rounded-full px-2 py-0.5 text-[9px] font-semibold whitespace-nowrap"
                      style={{ background: evColor.bg, color: evColor.text, outline: isSelected ? `1px solid ${evColor.text}` : undefined }}
                    >
                      {EVENT_LABELS[event.event_name] ?? event.event_name}
                    </span>
                    <span className="text-[10px] tabular-nums" style={{ color: "var(--dm-text-tertiary)" }}>{fmt(event.created_at)}</span>
                    {isSelected && (
                      <span className="text-[9px] font-semibold" style={{ color: "var(--dm-primary)" }}>· exibindo acima</span>
                    )}
                  </div>
                  {event.page_title && (
                    <p className="mt-1 text-[11px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>
                      {event.page_title}
                    </p>
                  )}
                  <p className="mt-0.5 break-all text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                    <MapPin size={10} className="mr-1 inline" />
                    {event.event_url || "—"}
                  </p>
                  {formatLocation({ country: event.country, countryRegion: event.country_region, city: event.city }) && (
                    <p className="mt-0.5 text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                      {formatLocation({ country: event.country, countryRegion: event.country_region, city: event.city })}
                    </p>
                  )}
                  {device && (
                    <p className="mt-0.5 flex items-center gap-1 text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                      <DeviceIcon size={10} /> {device.label}
                    </p>
                  )}
                  {utmEntries.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {utmEntries.map(([k, v]) => (
                        <span key={k} className="rounded px-1.5 py-0.5 text-[9px]" style={{ color: "var(--dm-text-tertiary)", background: "var(--dm-bg-elevated)" }}>
                          {k.replace("utm_", "")}: <strong style={{ color: "var(--dm-text-secondary)" }}>{v}</strong>
                        </span>
                      ))}
                    </div>
                  )}
                  {(event.event_name === "Purchase" || event.event_name === "Renewal" || event.event_name === "Installment") && (
                    <div className="mt-1.5 rounded-lg border p-2" style={{ borderColor: EVENT_COLORS.Purchase.text, background: "rgba(22,163,74,0.06)" }}>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-bold" style={{ color: EVENT_COLORS.Purchase.text }}>{formatMoney(event.value, event.currency)}</p>
                        {event.installment_value != null && event.installment_value !== event.value && (
                          <span className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }} title="Valor pago só nessa parcela/cobrança — o de cima é o valor cheio da venda">
                            (parcela: {formatMoney(event.installment_value, event.currency)})
                          </span>
                        )}
                        {event.event_name !== "Purchase" && (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                            style={{ background: "rgba(22,163,74,0.12)", color: "#15803D" }}
                            title={event.main_sale_transaction_id ? `Venda principal #${event.main_sale_transaction_id}` : undefined}
                          >
                            {event.event_name === "Renewal" ? "cobrança recorrente" : "parcela"}
                          </span>
                        )}
                        {event.is_order_bump && (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                            style={{ background: "rgba(22,163,74,0.12)", color: "#16A34A" }}
                            title={event.main_sale_transaction_id ? `Order bump da venda #${event.main_sale_transaction_id}` : "Order bump"}
                          >
                            order bump
                          </span>
                        )}
                      </div>
                      {(event.product_name ?? event.extra_fields?.produto) && (
                        <p className="mt-0.5 text-[11px]" style={{ color: "var(--dm-text-primary)" }}>{event.product_name ?? event.extra_fields?.produto}</p>
                      )}
                      {event.items && event.items.length > 1 && (
                        <div className="mt-1 flex flex-col gap-0.5">
                          {event.items.map((item, i) => (
                            <span key={i} className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                              <span
                                className="rounded-full px-1.5 py-0.5 text-[8px] font-semibold"
                                style={
                                  item.role === "bump"
                                    ? { background: "rgba(22,163,74,0.12)", color: "#16A34A" }
                                    : { background: "rgba(100,116,139,0.12)", color: "var(--dm-text-tertiary)" }
                                }
                              >
                                {item.role === "bump" ? "bump" : "principal"}
                              </span>
                              {item.name} · {formatMoney(item.value, event.currency)}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                        {event.lead_name && <span className="flex items-center gap-1"><User size={10} /> {event.lead_name}</span>}
                        {event.lead_email && <span className="flex items-center gap-1"><Mail size={10} /> {event.lead_email}</span>}
                        {event.lead_phone && <span className="flex items-center gap-1"><Phone size={10} /> {event.lead_phone}</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                        {paymentMethodLabel(event.payment_method, event.installments, Boolean(event.recurrence_key)) && (
                          <span className="flex items-center gap-1">
                            <CreditCard size={10} /> {paymentMethodLabel(event.payment_method, event.installments, Boolean(event.recurrence_key))}
                          </span>
                        )}
                        {installmentProgressLabel(event.installment_number, event.installments, Boolean(event.recurrence_key)) && (
                          <span className="flex items-center gap-1">
                            <Hash size={10} /> {installmentProgressLabel(event.installment_number, event.installments, Boolean(event.recurrence_key))}
                          </span>
                        )}
                        {event.external_transaction_id && (
                          <span className="flex items-center gap-1 font-mono"><Hash size={10} /> {event.external_transaction_id}</span>
                        )}
                        {event.source && event.source !== "pixel" && (
                          <span className="rounded-full px-1.5 py-0.5 font-semibold" style={{ background: "rgba(100,116,139,0.12)" }}>via {event.source}</span>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold"
                      style={{ background: (STATUS_COLORS[event.capi_status] ?? STATUS_COLORS.skipped).bg, color: (STATUS_COLORS[event.capi_status] ?? STATUS_COLORS.skipped).text }}
                      title={event.capi_error ?? undefined}
                    >
                      {STATUS_LABELS[event.capi_status] ?? event.capi_status}
                    </span>
                    {event.event_id && (
                      <span className="font-mono text-[9px]" style={{ color: "var(--dm-text-tertiary)" }} title="event_id — usado pra deduplicar Pixel (navegador) + Conversions API (servidor) na Meta">
                        event_id: {event.event_id.slice(0, 8)}…
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TrackingEventsView() {
  const { company, companyId, canWrite } = useCompany();
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  // true só quando o grupo de "ruído" (PageView etc) bateu no teto de segurança —
  // Lead/Purchase/Installment são sempre buscados por completo, nunca truncados.
  const [noiseCapped, setNoiseCapped] = useState(false);
  const [funnels, setFunnels] = useState<TrackingFunnel[]>([]);
  // true se PELO MENOS 1 pixel da empresa tem Pixel ID preenchido (banner "Meta não configurada").
  const [anyMetaConfigured, setAnyMetaConfigured] = useState(false);
  // Mapa pixel UUID → nome do pixel (ex.: "Pixel principal", "LP Produto X")
  const [pixelNameMap, setPixelNameMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState<string | null>(null);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string | null>(null);
  const [productFilter, setProductFilter] = useState<string | null>(null);
  const [deviceFilter, setDeviceFilter] = useState<"mobile" | "tablet" | "desktop" | null>(null);
  const [funnelFilter, setFunnelFilter] = useState<string | null>(null); // funnel id ou "__none__"
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);

  const [dateFrom, setDateFrom] = useState(() => new Date(Date.now() - 30 * 86400_000).toISOString().split("T")[0]);
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  const [view, setView] = useState<"visitors" | "analytics" | "funnels">("visitors");
  const [advFiltersOpen, setAdvFiltersOpen] = useState(false);
  const fetchSeq = useRef(0);

  // Renderizar milhares de linhas de uma vez trava o browser — a tabela/cards
  // de visitantes mostram só 1 página (50) por vez, o resto fica só no total.
  const VISITORS_PAGE_SIZE = 50;
  const [visitorsPage, setVisitorsPage] = useState(1);

  const fetchEvents = useCallback(async () => {
    if (!supabaseClient) {
      // Sem backend: em modo DEV mostra dados demo pra visualizar a tela populada.
      if (isDevModeActive()) {
        setEvents(DEMO_TRACKING_EVENTS as unknown as TrackingEvent[]);
        setAnyMetaConfigured(true);
        setError(null);
        return;
      }
      setError("Supabase não configurado.");
      return;
    }
    if (!companyId) {
      setError("Nenhuma empresa selecionada.");
      return;
    }

    setLoading(true);
    setError(null);
    const requestId = ++fetchSeq.current;

    try {
    // Uma query de sonda (1 linha) só pra detectar se as colunas novas existem —
    // decide qual EVENTS_SELECT usar antes de disparar a busca paginada de verdade.
    const [probeRes, pixelsRes] = await Promise.all([
      supabaseClient.from("events_log").select(EVENTS_SELECT).eq("company_id", companyId).limit(1),
      supabaseClient.from("tracking_pixels").select("id, name, meta_pixel_id").eq("company_id", companyId),
    ]);
    if (requestId !== fetchSeq.current) return;

    if (pixelsRes.error?.message?.includes("tracking_pixels")) {
      // Migration 037 ainda não rodou — cai pra coluna legada de companies (1 pixel só).
      const legacy = await supabaseClient.from("companies").select("meta_pixel_id").eq("id", companyId).single();
      setAnyMetaConfigured(Boolean(legacy.data?.meta_pixel_id));
    } else if (!pixelsRes.error) {
      setAnyMetaConfigured((pixelsRes.data ?? []).some((p) => p.meta_pixel_id));
      const nameMap = new Map<string, string>();
      for (const p of pixelsRes.data ?? []) {
        if (p.id && p.name) nameMap.set(p.id as string, p.name as string);
      }
      setPixelNameMap(nameMap);
    }

    const missingNewColumn = [
      "page_title", "extra_fields", "country", "country_region", "city", "event_id",
      "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_placement", "utm_campaign_id", "utm_adset_id", "utm_ad_id",
      "lead_name", "value", "currency", "external_transaction_id", "source", "payment_method", "installments", "installment_number", "installment_value", "recurrence_key", "product_name", "product_parent_id",
      "is_order_bump", "main_sale_transaction_id", "client_user_agent", "via", "pixel_id", "sale_confirmed",
    ].some((col) => probeRes.error?.message?.includes(col));

    const select = missingNewColumn ? EVENTS_SELECT_FALLBACK : EVENTS_SELECT;
    // Lead/Purchase/Installment (negócio) são buscados por completo, sem teto —
    // visitantes/receita/leads nunca ficam sub-contados. Só PageView e afins
    // (ruído, alto volume) são paginados até um teto de segurança pro browser.
    const { rows, noiseCapped: capped } = await fetchEventsLogSplit<TrackingEvent>(supabaseClient, {
      select,
      companyId,
      dateFrom,
      dateTo,
      extraFilter: (q) => q.or("sale_confirmed.is.null,sale_confirmed.eq.true"),
      businessEventNames: ["Lead", "Purchase", "Installment"],
      excludeEventNames: ["Renewal"],
    });
    if (requestId !== fetchSeq.current) return;
    setEvents(rows as unknown as TrackingEvent[]);
    setNoiseCapped(capped);

    } catch (e) {
      if (requestId === fetchSeq.current) setError(e instanceof Error ? e.message : "Erro ao buscar eventos.");
    } finally {
      if (requestId === fetchSeq.current) setLoading(false);
    }
  }, [companyId, dateFrom, dateTo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    if (!companyId) return;
    let active = true;
    void fetchTrackingFunnels(companyId)
      .then((list) => { if (active) setFunnels(list); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Erro ao buscar funis."); });
    return () => { active = false; };
  }, [companyId]);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const visibleEvents = useMemo(() => events.filter(isVisibleTrackingEvent), [events]);
  const visitors = useMemo(() => groupByVisitor(visibleEvents), [visibleEvents]);

  // fingerprintId → Set dos IDs de funil a que este visitante pertence (multi-funil).
  // Um visitante pode pertencer a vários funis simultaneamente.
  const visitorFunnelSetsMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const v of visitors) {
      const ids = new Set<string>();
      for (const f of funnels) {
        if (v.events.some((e) => eventMatchesFunnel(e, f))) ids.add(f.id);
      }
      m.set(v.fingerprintId, ids);
    }
    return m;
  }, [visitors, funnels]);

  // Analytics: filtra visitantes pelo funil conectado.
  const analyticsVisitors = useMemo(() => {
    if (!funnelFilter) return visitors;
    return visitors.filter((v) => {
      const ids = visitorFunnelSetsMap.get(v.fingerprintId) ?? new Set<string>();
      if (funnelFilter === "__none__") return ids.size === 0;
      return ids.has(funnelFilter);
    });
  }, [visitors, funnelFilter, visitorFunnelSetsMap]);

  // Analytics: eventos scopados ao funil selecionado.
  //
  // Tráfego (PageView etc.): só eventos dos visitantes que tocaram o funil.
  // Conversões (Lead/Purchase): dois modos dependendo da config do funil:
  //
  //   • Com productNames → filtra por produto em TODOS os visitantes do período.
  //     Captura compradores que não passaram pela URL (ex.: direto pelo link de
  //     checkout, e-mail, remarketing) — atribuição por produto, não por jornada.
  //
  //   • Sem productNames → inclui TODAS as conversões do período.
  //     Compras Eduzz chegam server-side com fingerprint diferente do visitante
  //     da LP; sem produto configurado é impossível filtrar. O usuário deve
  //     adicionar nomes de produto ao funil para atribuição precisa.
  const analyticsEvents = useMemo(() => {
    const selectedFunnel = funnelFilter && funnelFilter !== "__none__"
      ? funnels.find((f) => f.id === funnelFilter)
      : null;
    if (!selectedFunnel) return analyticsVisitors.flatMap((v) => v.events);

    // Tráfego: eventos de visitantes que casam com o funil
    const trafficEvents = analyticsVisitors.flatMap((v) =>
      v.events.filter((e) => eventMatchesFunnel(e, selectedFunnel)),
    );

    // Conversões de visitantes fora do funil (fingerprint diferente da LP)
    const seen = new Set(trafficEvents.map((e) => e.id));
    let extraConversions: TrackingEvent[];
    if (selectedFunnel.productNames.length > 0) {
      // Com produto configurado: só compras desse produto de qualquer visitante
      extraConversions = events.filter((e) => {
        if (e.event_name !== "Lead" && e.event_name !== "Purchase") return false;
        if (seen.has(e.id)) return false;
        if (selectedFunnel.productParentIds.length > 0 && e.product_parent_id) {
          return selectedFunnel.productParentIds.includes(e.product_parent_id);
        }
        if (!e.product_name) return false;
        return selectedFunnel.productNames.some((p) => matchProductNames(e.product_name!, p));
      });
    } else {
      // Sem produto: todas as conversões do período (fingerprint desconhecido)
      extraConversions = [];
    }

    return [...trafficEvents, ...extraConversions];
  }, [analyticsVisitors, visibleEvents, funnelFilter, funnels]);

  // Visitantes filtrados pelos filtros da tabela (exceto funil que já cobre o Analytics).
  // Usado nas contagens dos chips de funil para que elas reflitam o mesmo conjunto da tabela.
  const visitorsWithoutFunnelFilter = useMemo(() => visitors.filter((v) => {
    if (eventFilter && !v.events.some((e) => e.event_name === eventFilter)) return false;
    if (eventFilter === "Purchase" && paymentMethodFilter && !v.events.some((e) => e.event_name === "Purchase" && e.payment_method === paymentMethodFilter)) return false;
    if (eventFilter === "Purchase" && productFilter && !v.events.some((e) => e.event_name === "Purchase" && e.product_name != null && productBaseName(e.product_name) === productFilter)) return false;
    if (deviceFilter && parseUserAgent(v.lastUserAgent)?.device !== deviceFilter) return false;
    return true;
  }), [visitors, eventFilter, paymentMethodFilter, productFilter, deviceFilter]);

  const filteredVisitors = visitors.filter((v) => {
    if (eventFilter && !v.events.some((e) => e.event_name === eventFilter)) return false;
    if (eventFilter === "Purchase" && paymentMethodFilter && !v.events.some((e) => e.event_name === "Purchase" && e.payment_method === paymentMethodFilter)) return false;
    if (eventFilter === "Purchase" && productFilter && !v.events.some((e) => e.event_name === "Purchase" && e.product_name != null && productBaseName(e.product_name) === productFilter)) return false;
    if (deviceFilter && parseUserAgent(v.lastUserAgent)?.device !== deviceFilter) return false;
    if (funnelFilter) {
      const ids = visitorFunnelSetsMap.get(v.fingerprintId) ?? new Set<string>();
      if (funnelFilter === "__none__" && ids.size > 0) return false;
      if (funnelFilter !== "__none__" && !ids.has(funnelFilter)) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      // Inclui OS/navegador/dispositivo (ex.: "iphone", "android", "chrome")
      // — dá pra filtrar por aparelho sem precisar de um chip novo por valor
      // possível (OS tem dezenas de combinações de versão).
      const device = parseUserAgent(v.lastUserAgent);
      const os = parseOS(v.lastUserAgent);
      const browser = parseBrowser(v.lastUserAgent);
      return (
        v.fingerprintId.toLowerCase().includes(q) ||
        v.events.some((e) => e.event_url?.toLowerCase().includes(q) || e.page_title?.toLowerCase().includes(q)) ||
        v.anyEmail?.toLowerCase().includes(q) ||
        v.anyPhone?.toLowerCase().includes(q) ||
        os?.toLowerCase().includes(q) ||
        browser?.toLowerCase().includes(q) ||
        (device && DEVICE_LABELS[device.device].toLowerCase().includes(q)) ||
        false
      );
    }
    return true;
  });

  // Volta pra página 1 sempre que o resultado filtrado muda de tamanho
  // (novo filtro/busca/período) — evita ficar numa página vazia.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisitorsPage(1);
  }, [dateFrom, dateTo, search, eventFilter, paymentMethodFilter, productFilter, deviceFilter, funnelFilter]);

  const visitorsPageCount = Math.max(1, Math.ceil(filteredVisitors.length / VISITORS_PAGE_SIZE));
  const visitorsPageSafe = Math.min(visitorsPage, visitorsPageCount);
  const pagedVisitors = filteredVisitors.slice(
    (visitorsPageSafe - 1) * VISITORS_PAGE_SIZE,
    visitorsPageSafe * VISITORS_PAGE_SIZE,
  );

  const eventTypes = [...new Set(visibleEvents.map((e) => e.event_name))];
  // Formas de pagamento das vendas (Purchase) realmente vistas no período — só
  // mostra o chip pra filtrar quando o usuário já está olhando "Compra" (filtro
  // secundário, igual ao padrão de eventTypes acima).
  const paymentMethods = [...new Set(visibleEvents.filter((e) => e.event_name === "Purchase" && e.payment_method).map((e) => e.payment_method as string))];
  const purchaseProducts = [...new Set(
    visibleEvents.filter((e) => e.event_name === "Purchase" && e.product_name)
      .map((e) => productBaseName(e.product_name as string))
  )].sort();
  // Categorias de dispositivo (Celular/Tablet/Desktop) realmente vistas no
  // período — mesmo padrão de eventTypes/paymentMethods acima.
  const deviceCategories = [...new Set(visitors.map((v) => parseUserAgent(v.lastUserAgent)?.device).filter((d): d is "mobile" | "tablet" | "desktop" => Boolean(d)))];
  // Captura funciona sem Meta — isso é só um lembrete de que o envio CAPI está desligado, não um erro.
  const metaNotConfigured = !loading && !error && !anyMetaConfigured;
  const eventsCapped = noiseCapped;

  // Mantém o drawer em sincronia se um refresh trouxer novos eventos do mesmo visitante.
  const openVisitor = selectedVisitor
    ? (visitors.find((v) => v.fingerprintId === selectedVisitor.fingerprintId) ?? selectedVisitor)
    : null;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full p-4 sm:p-6 overflow-y-auto">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-bold" style={{ color: "var(--dm-text-primary)" }}>
            Eventos de Tracking
          </h2>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--dm-text-tertiary)" }}>
            Pixel Server-Side · {view === "analytics"
              ? (funnelFilter
                ? <><span style={{ color: "var(--dm-primary)" }}>{analyticsVisitors.length} no funil</span> · {visitors.length} total</>
                : `${visitors.length} visitante${visitors.length !== 1 ? "s" : ""}`)
              : `${filteredVisitors.length} visitante${filteredVisitors.length !== 1 ? "s" : ""}`
            } · {visibleEvents.length} evento{visibleEvents.length !== 1 ? "s" : ""}
            {eventsCapped && <span style={{ color: "#d97706" }}> · volume de navegação (PageView) truncado no período — visitantes/vendas/leads não são afetados</span>}
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {/* Alternador Visitantes | Analytics | Funis */}
          <div className="flex flex-1 gap-0.5 rounded-lg border p-0.5 sm:flex-none" style={{ borderColor: "var(--dm-border-default)" }}>
            {([
              ["visitors", "Visitantes", Table2],
              ["analytics", "Analytics", BarChart3],
              ["funnels", "Funis", Workflow],
            ] as ["visitors" | "analytics" | "funnels", string, typeof Table2][]).map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition sm:flex-none"
                style={view === v
                  ? { background: "linear-gradient(135deg,#22C55E 0%,#16A34A 100%)", color: "#fff" }
                  : { color: "var(--dm-text-tertiary)" }}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={fetchEvents}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-70 disabled:opacity-40"
            style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}
          >
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Funis / Campanhas — gestão de funis que alimenta o Analytics (config de Pixel/Eduzz vive no Hub) */}
      {view === "funnels" && company && (
        <div className="mb-5 rounded-2xl border p-4" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
          <FunnelConfigSection
            company={company}
            canEdit={canWrite}
            onFunnelsChange={setFunnels}
            onViewAnalytics={(id) => { setFunnelFilter(id); setView("analytics"); }}
          />
        </div>
      )}

      {/* ── Barra de filtros (minimalista) + Filtros avançados (modal) ───────── */}
      {(() => {
        if (view !== "visitors") {
          // Analytics/Funis: só o seletor de funil que escopa métricas/gráficos.
          if (view !== "analytics") return null;
          return (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
              <div className="ml-auto flex items-center gap-1.5">
                <BarChart3 size={13} className="flex-shrink-0" style={{ color: "var(--dm-text-tertiary)" }} />
                <span className="text-xs" style={{ color: "var(--dm-text-tertiary)" }}>Conectar funil:</span>
                <select
                  value={funnelFilter ?? ""}
                  onChange={(e) => setFunnelFilter(e.target.value || null)}
                  className="rounded-lg border px-2 py-1.5 text-xs font-semibold"
                  style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)", color: "var(--dm-text-primary)" }}
                >
                  <option value="">Todos os funis</option>
                  {funnels.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  <option value="__none__">Sem funil</option>
                </select>
              </div>
            </div>
          );
        }

        // Chips de filtros ativos (removíveis) + contagem p/ o botão.
        const funnelLabel = funnelFilter === "__none__" ? "Sem funil" : funnels.find((f) => f.id === funnelFilter)?.label ?? funnelFilter;
        const activeChips: { key: string; label: string; clear: () => void }[] = [
          eventFilter ? { key: "ev", label: EVENT_LABELS[eventFilter] ?? eventFilter, clear: () => { setEventFilter(null); setPaymentMethodFilter(null); } } : null,
          deviceFilter ? { key: "dv", label: DEVICE_LABELS[deviceFilter], clear: () => setDeviceFilter(null) } : null,
          funnelFilter ? { key: "fn", label: funnelLabel!, clear: () => setFunnelFilter(null) } : null,
          paymentMethodFilter ? { key: "pm", label: PAYMENT_METHOD_LABELS[paymentMethodFilter] ?? paymentMethodFilter, clear: () => setPaymentMethodFilter(null) } : null,
        ].filter(Boolean) as { key: string; label: string; clear: () => void }[];
        const advCount = activeChips.length;
        const clearAll = () => { setEventFilter(null); setDeviceFilter(null); setFunnelFilter(null); setPaymentMethodFilter(null); };

        return (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
              <div className="relative min-w-[180px] flex-1">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--dm-text-tertiary)" }} />
                <input
                  type="text"
                  placeholder="URL, e-mail, telefone, fingerprint, OS ou navegador…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg border py-1.5 pl-7 pr-3 text-xs"
                  style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)", color: "var(--dm-text-primary)" }}
                />
              </div>
              <button
                type="button"
                onClick={() => setAdvFiltersOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:border-[color:var(--dm-primary-border)]"
                style={{ borderColor: advCount > 0 ? "var(--dm-primary)" : "var(--dm-border-default)", color: advCount > 0 ? "var(--dm-primary)" : "var(--dm-text-secondary)" }}
              >
                <SlidersHorizontal size={12} /> Filtros avançados
                {advCount > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white" style={{ background: "var(--dm-primary)" }}>{advCount}</span>
                )}
              </button>
              {advCount > 0 && (
                <button type="button" onClick={clearAll} className="flex items-center gap-1 text-[11px] font-semibold transition hover:opacity-80" style={{ color: "var(--dm-text-tertiary)" }}>
                  <X size={12} /> Limpar
                </button>
              )}
            </div>

            {/* Chips ativos */}
            {activeChips.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {activeChips.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={c.clear}
                    className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition hover:opacity-80"
                    style={{ background: "var(--dm-primary-soft)", color: "var(--dm-primary)", border: "1px solid var(--dm-primary-border)" }}
                  >
                    {c.label} <X size={11} />
                  </button>
                ))}
              </div>
            )}

            {/* Modal Filtros avançados */}
            {advFiltersOpen && (
              <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" onClick={() => setAdvFiltersOpen(false)}>
                <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
                <div
                  className="relative z-10 flex max-h-[86vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border shadow-2xl"
                  style={{ background: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex flex-shrink-0 items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--dm-border-default)" }}>
                    <h3 className="flex items-center gap-2 text-base font-bold" style={{ color: "var(--dm-text-primary)" }}>
                      <Filter size={16} style={{ color: "var(--dm-primary)" }} /> Filtros avançados
                    </h3>
                    <button type="button" onClick={() => setAdvFiltersOpen(false)} className="flex h-7 w-7 items-center justify-center rounded-lg transition hover:opacity-70" style={{ color: "var(--dm-text-tertiary)" }}>
                      <X size={18} />
                    </button>
                  </div>

                  <div className="flex-1 space-y-5 overflow-y-auto p-5">
                    {eventTypes.length > 0 && (
                      <div>
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Tipo de evento</p>
                        <div className="flex flex-wrap gap-1.5">
                          {eventTypes.map((ev) => (
                            <Chip key={ev} label={EVENT_LABELS[ev] ?? ev} active={eventFilter === ev} onClick={() => { setEventFilter(eventFilter === ev ? null : ev); setPaymentMethodFilter(null); setProductFilter(null); }} />
                          ))}
                        </div>
                      </div>
                    )}
                    {deviceCategories.length > 1 && (
                      <div>
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Dispositivo</p>
                        <div className="flex flex-wrap gap-1.5">
                          {deviceCategories.map((d) => (
                            <Chip key={d} label={DEVICE_LABELS[d]} active={deviceFilter === d} onClick={() => setDeviceFilter(deviceFilter === d ? null : d)} />
                          ))}
                        </div>
                      </div>
                    )}
                    {funnels.length > 0 && (
                      <div>
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Funil</p>
                        <div className="flex flex-wrap gap-1.5">
                          {funnels.map((f) => {
                            const count = visitorsWithoutFunnelFilter.filter((v) => visitorFunnelSetsMap.get(v.fingerprintId)?.has(f.id)).length;
                            return (
                              <button
                                key={f.id}
                                type="button"
                                onClick={() => setFunnelFilter(funnelFilter === f.id ? null : f.id)}
                                className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition hover:opacity-80"
                                style={{
                                  borderColor: funnelFilter === f.id ? f.color : "var(--dm-border-default)",
                                  background: funnelFilter === f.id ? `${f.color}20` : "transparent",
                                  color: funnelFilter === f.id ? f.color : "var(--dm-text-tertiary)",
                                }}
                              >
                                <span className="h-2 w-2 rounded-full" style={{ background: f.color }} /> {f.label}
                                <span className="opacity-60">({count})</span>
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => setFunnelFilter(funnelFilter === "__none__" ? null : "__none__")}
                            className="rounded-full border px-2.5 py-1 text-[11px] font-semibold transition hover:opacity-80"
                            style={{ borderColor: funnelFilter === "__none__" ? "var(--dm-text-tertiary)" : "var(--dm-border-default)", color: "var(--dm-text-tertiary)" }}
                          >
                            Sem funil ({visitorsWithoutFunnelFilter.filter((v) => (visitorFunnelSetsMap.get(v.fingerprintId)?.size ?? 0) === 0).length})
                          </button>
                        </div>
                      </div>
                    )}
                    {paymentMethods.length > 0 && (
                      <div>
                        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
                          <CreditCard size={11} /> Forma de pagamento
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {paymentMethods.map((method) => (
                            <Chip key={method} label={PAYMENT_METHOD_LABELS[method] ?? method} active={paymentMethodFilter === method} onClick={() => setPaymentMethodFilter(paymentMethodFilter === method ? null : method)} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-shrink-0 items-center justify-between border-t px-5 py-3" style={{ borderColor: "var(--dm-border-default)" }}>
                    <button type="button" onClick={clearAll} className="text-xs font-semibold transition hover:opacity-80" style={{ color: "var(--dm-text-tertiary)" }}>
                      Limpar tudo
                    </button>
                    <button type="button" onClick={() => setAdvFiltersOpen(false)} className="rounded-lg px-5 py-2 text-sm font-bold text-white transition hover:opacity-90" style={{ background: "var(--dm-btn-primary-bg)" }}>
                      Aplicar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        );
      })()}


      {/* Meta CAPI não configurada (informativo, não bloqueia captura) */}
      {metaNotConfigured && (
        <div
          className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)" }}
        >
          <span>Eventos sendo capturados normalmente. Envio pra Meta Conversions API está desligado (Pixel ID/Token não configurados).</span>
          <span className="flex-shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold" style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
            Configure no Hub → Configurações → Tracking
          </span>
        </div>
      )}

      {/* Errors */}
      {error && (
        <div
          className="mb-4 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "#f87171" }}
        >
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && visibleEvents.length === 0 && (
        <div className="flex flex-1 items-center justify-center gap-2" style={{ color: "var(--dm-text-tertiary)" }}>
          <RefreshCw size={14} className="animate-spin" />
          <span className="text-sm">Buscando eventos…</span>
        </div>
      )}

      {/* Empty */}
      {!loading && visibleEvents.length === 0 && !error && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <Radar size={28} style={{ color: "var(--dm-text-tertiary)" }} />
          <p className="text-sm" style={{ color: "var(--dm-text-tertiary)" }}>
            Nenhum evento capturado no período.
          </p>
          <p className="text-[11px] mt-0.5 text-center max-w-sm" style={{ color: "var(--dm-text-tertiary)" }}>
            Suba o <code>dm-proxy.php</code> na raiz do domínio do cliente e cole o snippet (em{" "}
            <strong>Configuração</strong>) nas páginas — ele chama{" "}
            <code>Tracker.init(&quot;slug-da-empresa&quot;, &quot;slug-do-pixel&quot;)</code> via{" "}
            <code>/dm-proxy.php?ep=pixel</code>.
          </p>
        </div>
      )}

      {/* Analytics — painel agregado estilo GA conectável a funil */}
      {view === "analytics" && !loading && !error && visibleEvents.length > 0 && (
        <TrackingAnalytics
          visitors={analyticsVisitors}
          events={analyticsEvents}
          eventsCapped={eventsCapped}
          funnelHasProductNames={
            !funnelFilter || funnelFilter === "__none__"
              ? true
              : (funnels.find((f) => f.id === funnelFilter)?.productNames.length ?? 0) > 0
          }
        />
      )}

      {/* Table — 1 linha por visitante (desktop ≥ md) */}
      {view === "visitors" && filteredVisitors.length > 0 && (
        <div className="hidden overflow-x-auto rounded-2xl border md:block" style={{ borderColor: "var(--dm-border-default)" }}>
          <table className="w-full min-w-[680px] text-xs">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--dm-border-default)", background: "var(--dm-bg-elevated)" }}>
                {[
                  "Visitante", "Última ação", "Eventos", "Origem / UTM", "Local", "OS", "Dispositivo", "Browser", "Via",
                  ...(pixelNameMap.size > 1 ? ["Pixel"] : []),
                  ...(funnels.length > 0 ? ["Funil"] : []),
                  "Conversão",
                ].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left font-semibold" style={{ color: "var(--dm-text-tertiary)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedVisitors.map((visitor, i) => {
                const utmEntries = Object.entries(visitor.lastUtm);
                const device = parseUserAgent(visitor.lastUserAgent);
                const os = parseOS(visitor.lastUserAgent);
                const browser = parseBrowser(visitor.lastUserAgent);
                const email = visitor.leadEmail ?? visitor.anyEmail;
                const dotColor = visitor.isCustomer ? "#16A34A" : visitor.isLead ? "var(--dm-primary)" : "var(--dm-border-strong)";
                return (
                  <tr
                    key={visitor.fingerprintId}
                    onClick={() => setSelectedVisitor(visitor)}
                    className="cursor-pointer transition-colors hover:opacity-80"
                    style={{
                      borderBottom: i < pagedVisitors.length - 1 ? "1px solid var(--dm-border-subtle)" : undefined,
                      background: i % 2 === 0 ? "var(--dm-bg-surface)" : "var(--dm-bg-card)",
                    }}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: dotColor }} title={visitor.isCustomer ? "Cliente" : visitor.isLead ? "Lead" : "Visitante"} />
                        {email ? (
                          <span className="block truncate text-[11px] font-medium" style={{ color: "var(--dm-text-secondary)", maxWidth: 170 }} title={email}>{email}</span>
                        ) : (
                          <span className="font-mono text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>{visitor.fingerprintId.slice(0, 12)}…</span>
                        )}
                        {visitor.mergedFingerprintIds.length > 1 && (
                          <span
                            className="flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                            style={{ background: "rgba(22,163,74,0.12)", color: "var(--dm-primary)" }}
                            title="Mesmo email/telefone visto em navegadores ou dispositivos diferentes — jornadas unidas."
                          >
                            {visitor.mergedFingerprintIds.length}📱
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums whitespace-nowrap" style={{ color: "var(--dm-text-secondary)" }} title={relativeTime(visitor.lastSeen)}>
                      {fmt(visitor.lastSeen)}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: "var(--dm-text-secondary)" }}>
                      {visitor.events.length}
                    </td>
                    <td className="px-4 py-2.5 max-w-[280px]">
                      {utmEntries.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {utmEntries.slice(0, 2).map(([k, v]) => (
                            <span key={k} className="truncate rounded px-1.5 py-0.5 text-[9px]" style={{ color: "var(--dm-text-tertiary)", background: "var(--dm-bg-elevated)", maxWidth: 130 }}>
                              {v}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="truncate block" style={{ color: "var(--dm-text-tertiary)" }}>
                          {visitor.lastPageTitle || urlPath(visitor.lastUrl)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: "var(--dm-text-secondary)" }}>
                      {formatLocation(visitor.lastLocation) || <span style={{ color: "var(--dm-text-tertiary)" }}>—</span>}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: "var(--dm-text-secondary)" }}>
                      {os ?? <span style={{ color: "var(--dm-text-tertiary)" }}>—</span>}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: "var(--dm-text-secondary)" }}>
                      {device ? DEVICE_LABELS[device.device] : <span style={{ color: "var(--dm-text-tertiary)" }}>—</span>}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: "var(--dm-text-secondary)" }}>
                      {browser ?? <span style={{ color: "var(--dm-text-tertiary)" }}>—</span>}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {visitor.lastVia === "proxy" ? (
                        <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold" style={{ background: "rgba(5,205,153,0.12)", color: "#05CD99" }} title="Cookie 1ª parte via dm-proxy.php — sem o cap de 7 dias do Safari/iOS">
                          Proxy
                        </span>
                      ) : visitor.lastVia === "direct" ? (
                        <span style={{ color: "var(--dm-text-tertiary)" }}>Direto</span>
                      ) : (
                        <span style={{ color: "var(--dm-text-tertiary)" }}>—</span>
                      )}
                    </td>
                    {pixelNameMap.size > 1 && (() => {
                      const pixelId = visitor.events.find((e) => e.pixel_id)?.pixel_id ?? null;
                      const pixelName = pixelId ? (pixelNameMap.get(pixelId) ?? null) : null;
                      return (
                        <td className="px-4 py-2.5 whitespace-nowrap text-[11px]" style={{ color: "var(--dm-text-secondary)" }}>
                          {pixelName ?? <span style={{ color: "var(--dm-text-tertiary)" }}>—</span>}
                        </td>
                      );
                    })()}
                    {funnels.length > 0 && (() => {
                      const ids = visitorFunnelSetsMap.get(visitor.fingerprintId) ?? new Set<string>();
                      const matched = funnels.filter((f) => ids.has(f.id));
                      return (
                        <td className="px-4 py-2.5">
                          {matched.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {matched.map((f) => (
                                <span key={f.id} className="flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap" style={{ color: f.color }}>
                                  <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: f.color }} />
                                  {f.label}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: "var(--dm-text-tertiary)" }}>—</span>
                          )}
                        </td>
                      );
                    })()}
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-1">
                        {visitor.isLead && (
                          <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold whitespace-nowrap" style={{ background: EVENT_COLORS.Lead.bg, color: EVENT_COLORS.Lead.text }}>
                            ✓ converteu
                          </span>
                        )}
                        {visitor.isCustomer && (
                          <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold whitespace-nowrap" style={{ background: EVENT_COLORS.Purchase.bg, color: EVENT_COLORS.Purchase.text }}>
                            💰 {formatMoney(visitor.totalRevenue, visitor.events.find((e) => e.event_name === "Purchase")?.currency ?? null)}
                          </span>
                        )}
                        {!visitor.isLead && !visitor.isCustomer && <span style={{ color: "var(--dm-text-tertiary)" }}>—</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Cards — 1 por visitante (mobile < md) */}
      {view === "visitors" && filteredVisitors.length > 0 && (
        <div className="flex flex-col gap-2 md:hidden">
          {pagedVisitors.map((visitor) => {
            const device = parseUserAgent(visitor.lastUserAgent);
            const os = parseOS(visitor.lastUserAgent);
            const browser = parseBrowser(visitor.lastUserAgent);
            const meta = [os, device ? DEVICE_LABELS[device.device] : null, browser].filter(Boolean).join(" · ");
            const loc = formatLocation(visitor.lastLocation);
            const email = visitor.leadEmail ?? visitor.anyEmail;
            const identity = email ?? `${visitor.fingerprintId.slice(0, 14)}…`;
            const initial = email?.[0]?.toUpperCase() ?? "#";
            const accent = visitor.isCustomer ? "#16A34A" : visitor.isLead ? "var(--dm-primary)" : "var(--dm-text-tertiary)";
            const accentBg = visitor.isCustomer || visitor.isLead ? "rgba(22,163,74,0.12)" : "var(--dm-bg-elevated)";
            return (
              <button
                key={visitor.fingerprintId}
                type="button"
                onClick={() => setSelectedVisitor(visitor)}
                className="flex w-full items-start gap-3 rounded-xl border p-3 text-left transition active:scale-[0.99]"
                style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)" }}
              >
                <span
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
                  style={{ background: accentBg, color: accent }}
                >
                  {initial}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`min-w-0 flex-1 truncate text-[12px] font-semibold ${email ? "" : "font-mono"}`} style={{ color: "var(--dm-text-primary)" }}>
                      {identity}
                    </span>
                    <span className="flex-shrink-0 text-[10px] tabular-nums" style={{ color: "var(--dm-text-tertiary)" }} title={fmt(visitor.lastSeen)}>
                      {relativeTime(visitor.lastSeen)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
                    {visitor.events.length} evento{visitor.events.length !== 1 ? "s" : ""}{meta ? ` · ${meta}` : ""}
                  </p>
                  {loc && (
                    <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--dm-text-secondary)" }}>{loc}</p>
                  )}
                  {(visitor.isLead || visitor.isCustomer) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {visitor.isLead && (
                        <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold" style={{ background: EVENT_COLORS.Lead.bg, color: EVENT_COLORS.Lead.text }}>
                          ✓ converteu
                        </span>
                      )}
                      {visitor.isCustomer && (
                        <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold" style={{ background: EVENT_COLORS.Purchase.bg, color: EVENT_COLORS.Purchase.text }}>
                          💰 {formatMoney(visitor.totalRevenue, visitor.events.find((e) => e.event_name === "Purchase")?.currency ?? null)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Paginação — evita renderizar milhares de linhas/cards de uma vez só */}
      {view === "visitors" && filteredVisitors.length > VISITORS_PAGE_SIZE && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
            Página {visitorsPageSafe} de {visitorsPageCount} · {filteredVisitors.length} visitantes
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setVisitorsPage((p) => Math.max(1, p - 1))}
              disabled={visitorsPageSafe <= 1}
              className="flex h-7 w-7 items-center justify-center rounded-lg border transition disabled:opacity-40"
              style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}
              aria-label="Página anterior"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={() => setVisitorsPage((p) => Math.min(visitorsPageCount, p + 1))}
              disabled={visitorsPageSafe >= visitorsPageCount}
              className="flex h-7 w-7 items-center justify-center rounded-lg border transition disabled:opacity-40"
              style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}
              aria-label="Próxima página"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {openVisitor && <VisitorDrawer key={openVisitor.fingerprintId} visitor={openVisitor} onClose={() => setSelectedVisitor(null)} />}
    </div>
  );
}
