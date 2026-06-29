"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Search, RefreshCw, Calendar, Radar, X, Mail, Phone, MapPin, User, Settings, ChevronDown, ShoppingBag, CreditCard, Hash, Smartphone, Monitor, Tablet } from "lucide-react";
import { supabaseClient } from "@/lib/supabase";
import { useCompany } from "@/hooks/useCompany";
import { isDevModeActive } from "@/hooks/useDevMode";
import { DEMO_TRACKING_EVENTS } from "@/lib/demoTracking";
import { TrackingConfigPanel } from "@/components/TrackingConfigPanel";
import { EduzzConfigPanel } from "@/components/EduzzConfigPanel";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrackingEvent {
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
  created_at: string;
}

interface Visitor {
  fingerprintId: string;
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

const EVENT_LABELS: Record<string, string> = {
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

const EVENT_COLORS: Record<string, { bg: string; text: string }> = {
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

// Teto de linhas por busca — protege o browser de agrupar volume absurdo de
// uma vez. Quando atingido, a UI avisa que pode estar truncado (ver eventsCapped).
const EVENTS_LIMIT = 1000;

const EVENTS_SELECT =
  "id, event_name, fingerprint_id, event_url, page_title, user_data, lead_email, lead_phone, lead_name, extra_fields, country, country_region, city, event_id, " +
  "utm_source, utm_medium, utm_campaign, utm_content, utm_term, utm_placement, utm_campaign_id, utm_adset_id, utm_ad_id, " +
  "value, currency, external_transaction_id, source, payment_method, installments, installment_number, installment_value, recurrence_key, product_name, is_order_bump, main_sale_transaction_id, client_user_agent, via, capi_status, capi_error, created_at";
// Sem as colunas das migrations 033/034/036/038/039/040/043/044 — usado se alguma delas ainda não rodou
// no banco, pra não derrubar a tela enquanto ela não é aplicada manualmente no Supabase.
const EVENTS_SELECT_FALLBACK = "id, event_name, fingerprint_id, event_url, user_data, lead_email, lead_phone, capi_status, capi_error, created_at";

// Bandeira a partir do código ISO (ex.: "BR" -> 🇧🇷) — calculada no client,
// não precisa guardar emoji no banco.
function flagEmoji(countryCode: string | null): string {
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
function resolveUtm(event: Pick<TrackingEvent, "event_url" | "utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term" | "utm_placement" | "utm_campaign_id" | "utm_adset_id" | "utm_ad_id">): Record<string, string> {
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

function formatMoney(value: number | null, currency: string | null): string {
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
function parseUserAgent(ua: string | null): { device: "mobile" | "tablet" | "desktop"; label: string } | null {
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
function parseOS(ua: string | null): string | null {
  const parsed = parseUserAgent(ua);
  if (!parsed) return null;
  // Remove o "· modelo" do label combinado (só existe pra Android) — sobra só o SO.
  return parsed.label.split(" · ")[0];
}

// Navegador a partir do User-Agent — checagem em ordem de especificidade:
// navegadores in-app (Facebook/Instagram) e baseados em Chromium (Edge, Opera,
// Samsung Internet) incluem o token "Chrome"/"Safari" no próprio UA, então
// teriam falso positivo se Chrome/Safari fossem checados primeiro.
function parseBrowser(ua: string | null): string | null {
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

function groupByVisitor(events: TrackingEvent[]): Visitor[] {
  const map = new Map<string, TrackingEvent[]>();
  for (const e of events) {
    const list = map.get(e.fingerprint_id);
    if (list) list.push(e);
    else map.set(e.fingerprint_id, [e]);
  }

  const visitors: Visitor[] = [];
  for (const [fingerprintId, list] of map) {
    const sorted = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
    // event_name === "Lead" especificamente — Purchase (venda Eduzz) também
    // grava lead_email/lead_phone (mesmo comprador), mas não é um cadastro de
    // formulário, não deve aparecer como "Lead" nem entrar no seletor de
    // "Dados capturados" do drawer (ver VisitorDrawer).
    const leadEvent = sorted.find((e) => e.event_name === "Lead");
    const purchaseEvents = sorted.filter((e) => e.event_name === "Purchase");
    visitors.push({
      fingerprintId,
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
      lastLocation: { country: sorted[0].country, countryRegion: sorted[0].country_region, city: sorted[0].city },
      // Mais recente primeiro (sorted) — pega o 1º evento que TEM UA, não
      // necessariamente sorted[0] (ex.: a Purchase mais recente pode não ter
      // UA por não ter casado com nenhuma visita, mas a PageView anterior tem).
      lastUserAgent: sorted.find((e) => e.client_user_agent)?.client_user_agent ?? null,
      lastVia: sorted.find((e) => e.via)?.via ?? null,
      isCustomer: purchaseEvents.length > 0,
      totalRevenue: purchaseEvents.reduce((sum, e) => sum + (e.value ?? 0), 0),
      purchaseCount: purchaseEvents.length,
    });
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
            <h3 className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>Histórico do visitante</h3>
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
                        <span key={k} className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] dark:bg-slate-700" style={{ color: "var(--dm-text-tertiary)" }}>
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
  // true se PELO MENOS 1 pixel da empresa tem Pixel ID preenchido (banner "Meta não configurada").
  const [anyMetaConfigured, setAnyMetaConfigured] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState<string | null>(null);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string | null>(null);
  const [deviceFilter, setDeviceFilter] = useState<"mobile" | "tablet" | "desktop" | null>(null);
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);

  const [dateFrom, setDateFrom] = useState(() => new Date(Date.now() - 30 * 86400_000).toISOString().split("T")[0]);
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);


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

    const [eventsRes, pixelsRes] = await Promise.all([
      supabaseClient
        .from("events_log")
        .select(EVENTS_SELECT)
        .eq("company_id", companyId)
        .neq("sale_confirmed", false)
        .neq("event_name", "Renewal")
        .gte("created_at", `${dateFrom}T00:00:00`)
        .lte("created_at", `${dateTo}T23:59:59`)
        .order("created_at", { ascending: false })
        .limit(EVENTS_LIMIT),
      supabaseClient.from("tracking_pixels").select("meta_pixel_id").eq("company_id", companyId),
    ]);

    if (pixelsRes.error?.message?.includes("tracking_pixels")) {
      // Migration 037 ainda não rodou — cai pra coluna legada de companies (1 pixel só).
      const legacy = await supabaseClient.from("companies").select("meta_pixel_id").eq("id", companyId).single();
      setAnyMetaConfigured(Boolean(legacy.data?.meta_pixel_id));
    } else if (!pixelsRes.error) {
      setAnyMetaConfigured((pixelsRes.data ?? []).some((p) => p.meta_pixel_id));
    }

    const missingNewColumn = [
      "page_title", "extra_fields", "country", "country_region", "city", "event_id",
      "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_placement", "utm_campaign_id", "utm_adset_id", "utm_ad_id",
      "lead_name", "value", "currency", "external_transaction_id", "source", "payment_method", "installments", "installment_number", "installment_value", "recurrence_key", "product_name",
      "is_order_bump", "main_sale_transaction_id", "client_user_agent", "via", "sale_confirmed",
    ].some((col) => eventsRes.error?.message?.includes(col));
    if (missingNewColumn) {
      // Migration 033/034/038/039/040 ainda não rodou no Supabase — busca sem as colunas novas em vez de quebrar a tela.
      const retry = await supabaseClient
        .from("events_log")
        .select(EVENTS_SELECT_FALLBACK)
        .eq("company_id", companyId)
        .neq("event_name", "Renewal")
        .gte("created_at", `${dateFrom}T00:00:00`)
        .lte("created_at", `${dateTo}T23:59:59`)
        .order("created_at", { ascending: false })
        .limit(EVENTS_LIMIT);
      if (retry.error) {
        setError(retry.error.message);
      } else {
        setEvents((retry.data as TrackingEvent[]) ?? []);
      }
    } else if (eventsRes.error) {
      setError(eventsRes.error.message);
    } else {
      setEvents((eventsRes.data as unknown as TrackingEvent[]) ?? []);
    }

    setLoading(false);
  }, [companyId, dateFrom, dateTo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEvents();
  }, [fetchEvents]);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const visitors = useMemo(() => groupByVisitor(events), [events]);

  const filteredVisitors = visitors.filter((v) => {
    if (eventFilter && !v.events.some((e) => e.event_name === eventFilter)) return false;
    if (eventFilter === "Purchase" && paymentMethodFilter && !v.events.some((e) => e.event_name === "Purchase" && e.payment_method === paymentMethodFilter)) return false;
    if (deviceFilter && parseUserAgent(v.lastUserAgent)?.device !== deviceFilter) return false;
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

  const eventTypes = [...new Set(events.map((e) => e.event_name))];
  // Formas de pagamento das vendas (Purchase) realmente vistas no período — só
  // mostra o chip pra filtrar quando o usuário já está olhando "Compra" (filtro
  // secundário, igual ao padrão de eventTypes acima).
  const paymentMethods = [...new Set(events.filter((e) => e.event_name === "Purchase" && e.payment_method).map((e) => e.payment_method as string))];
  // Categorias de dispositivo (Celular/Tablet/Desktop) realmente vistas no
  // período — mesmo padrão de eventTypes/paymentMethods acima.
  const deviceCategories = [...new Set(visitors.map((v) => parseUserAgent(v.lastUserAgent)?.device).filter((d): d is "mobile" | "tablet" | "desktop" => Boolean(d)))];
  // Captura funciona sem Meta — isso é só um lembrete de que o envio CAPI está desligado, não um erro.
  const metaNotConfigured = !loading && !error && !anyMetaConfigured;
  // A query tem limit(1000) — quando bate exatamente nisso, provavelmente há
  // mais eventos no período que não vieram, então visitantes/receita podem estar
  // truncados. Avisa em vez de mostrar números silenciosamente errados.
  const eventsCapped = events.length >= EVENTS_LIMIT;

  // Mantém o drawer em sincronia se um refresh trouxer novos eventos do mesmo visitante.
  const openVisitor = selectedVisitor
    ? (visitors.find((v) => v.fingerprintId === selectedVisitor.fingerprintId) ?? selectedVisitor)
    : null;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full p-4 sm:p-6 overflow-y-auto">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold" style={{ color: "var(--dm-text-primary)" }}>
            Eventos de Tracking
          </h2>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--dm-text-tertiary)" }}>
            Pixel Server-Side · {filteredVisitors.length} visitante{filteredVisitors.length !== 1 ? "s" : ""} · {events.length} evento{events.length !== 1 ? "s" : ""}
            {eventsCapped && <span style={{ color: "#d97706" }}> · mostrando os {EVENTS_LIMIT} mais recentes (estreite o período pra ver tudo)</span>}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
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

      {/* ── Painel de filtros ─────────────────────────────────────────────── */}
      {(() => {
        // Presets rápidos de período (Hoje / 7 / 15 / 30 dias).
        const setRangeDays = (n: number) => {
          const today = new Date();
          const from = n === 0 ? today : new Date(today.getTime() - n * 86400_000);
          setDateFrom(from.toISOString().split("T")[0]);
          setDateTo(today.toISOString().split("T")[0]);
        };
        const filtersActive = Boolean(eventFilter || deviceFilter || paymentMethodFilter || search.trim());
        const clearAll = () => { setEventFilter(null); setDeviceFilter(null); setPaymentMethodFilter(null); setSearch(""); };
        const PRESETS: [string, number][] = [["Hoje", 0], ["7 dias", 7], ["15 dias", 15], ["30 dias", 30]];
        return (
          <div className="mb-4 rounded-2xl border p-4" style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)" }}>
            {/* Período + busca + limpar */}
            <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Período</label>
                <div className="flex items-center gap-2">
                  <Calendar size={13} className="flex-shrink-0" style={{ color: "var(--dm-text-tertiary)" }} />
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                    className="rounded-lg border px-2 py-1.5 text-xs" style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }} />
                  <span className="text-xs" style={{ color: "var(--dm-text-tertiary)" }}>até</span>
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                    className="rounded-lg border px-2 py-1.5 text-xs" style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }} />
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map(([label, n]) => (
                  <button key={label} type="button" onClick={() => setRangeDays(n)}
                    className="rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition hover:border-[color:var(--dm-primary-border)] hover:text-[color:var(--dm-primary)]"
                    style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="relative min-w-[200px] flex-1">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--dm-text-tertiary)" }} />
                <input type="text" placeholder="URL, e-mail, telefone, fingerprint, OS ou navegador…" value={search} onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg border py-2 pl-7 pr-3 text-xs" style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }} />
              </div>
              {filtersActive && (
                <button type="button" onClick={clearAll}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold transition hover:opacity-80"
                  style={{ color: "var(--dm-text-tertiary)" }}>
                  <X size={12} /> Limpar
                </button>
              )}
            </div>

            {/* Grupos de filtro rotulados */}
            {eventTypes.length > 0 && (
              <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--dm-border-subtle)" }}>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Tipo de evento</p>
                <div className="flex flex-wrap gap-1.5">
                  {eventTypes.map((ev) => (
                    <Chip key={ev} label={EVENT_LABELS[ev] ?? ev} active={eventFilter === ev}
                      onClick={() => { setEventFilter(eventFilter === ev ? null : ev); setPaymentMethodFilter(null); }} />
                  ))}
                </div>
              </div>
            )}

            {deviceCategories.length > 1 && (
              <div className="mt-3">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Dispositivo</p>
                <div className="flex flex-wrap gap-1.5">
                  {deviceCategories.map((d) => (
                    <Chip key={d} label={DEVICE_LABELS[d]} active={deviceFilter === d} onClick={() => setDeviceFilter(deviceFilter === d ? null : d)} />
                  ))}
                </div>
              </div>
            )}

            {eventFilter === "Purchase" && paymentMethods.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
                  <CreditCard size={11} /> Forma de pagamento
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {paymentMethods.map((method) => (
                    <Chip key={method} label={PAYMENT_METHOD_LABELS[method] ?? method} active={paymentMethodFilter === method}
                      onClick={() => setPaymentMethodFilter(paymentMethodFilter === method ? null : method)} />
                  ))}
                </div>
              </div>
            )}
          </div>
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
      {loading && events.length === 0 && (
        <div className="flex flex-1 items-center justify-center gap-2" style={{ color: "var(--dm-text-tertiary)" }}>
          <RefreshCw size={14} className="animate-spin" />
          <span className="text-sm">Buscando eventos…</span>
        </div>
      )}

      {/* Empty */}
      {!loading && events.length === 0 && !error && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <Radar size={28} style={{ color: "var(--dm-text-tertiary)" }} />
          <p className="text-sm" style={{ color: "var(--dm-text-tertiary)" }}>
            Nenhum evento capturado no período.
          </p>
          <p className="text-[11px] mt-0.5 text-center max-w-sm" style={{ color: "var(--dm-text-tertiary)" }}>
            Suba o <code>dm-proxy.php</code> na raiz do domínio do cliente e cole o snippet do pixel
            (no Hub → <strong>Configurações → Tracking</strong>) nas páginas — ele chama{" "}
            <code>Tracker.init(&quot;slug-da-empresa&quot;, &quot;slug-do-pixel&quot;)</code> via{" "}
            <code>/dm-proxy.php?ep=pixel</code>.
          </p>
        </div>
      )}

      {/* Table — 1 linha por visitante */}
      {filteredVisitors.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: "var(--dm-border-default)" }}>
          <table className="w-full min-w-[680px] text-xs">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--dm-border-default)", background: "var(--dm-bg-elevated)" }}>
                {["Visitante", "Última ação", "Eventos", "Origem / UTM", "Local", "OS", "Dispositivo", "Browser", "Via", "Conversão"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left font-semibold" style={{ color: "var(--dm-text-tertiary)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredVisitors.map((visitor, i) => {
                const utmEntries = Object.entries(visitor.lastUtm);
                const device = parseUserAgent(visitor.lastUserAgent);
                const os = parseOS(visitor.lastUserAgent);
                const browser = parseBrowser(visitor.lastUserAgent);
                return (
                  <tr
                    key={visitor.fingerprintId}
                    onClick={() => setSelectedVisitor(visitor)}
                    className="cursor-pointer transition-colors hover:opacity-80"
                    style={{
                      borderBottom: i < filteredVisitors.length - 1 ? "1px solid var(--dm-border-subtle)" : undefined,
                      background: i % 2 === 0 ? "var(--dm-bg-surface)" : "var(--dm-bg-card)",
                    }}
                  >
                    <td className="px-4 py-2.5 font-mono text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                      {visitor.fingerprintId.slice(0, 12)}…
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
                            <span key={k} className="truncate rounded bg-slate-100 px-1.5 py-0.5 text-[9px] dark:bg-slate-700" style={{ color: "var(--dm-text-tertiary)", maxWidth: 130 }}>
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

      {openVisitor && <VisitorDrawer key={openVisitor.fingerprintId} visitor={openVisitor} onClose={() => setSelectedVisitor(null)} />}
    </div>
  );
}
