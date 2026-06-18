import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { geolocation } from "@vercel/functions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const META_API_VERSION = "v19.0";

// Normalização oficial da Meta antes de hashear (trim + lowercase — mesma regra
// usada no template GTM oficial da Meta pra em/fn/ln/ct/st/zp/country): nunca
// mexer nisso sem checar a doc, hash diferente = perde o match na Meta.
function hashLower(value: string | undefined | null): string | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  return createHash("sha256").update(normalized).digest("hex");
}

// Colunas adicionadas em migrations recentes, agrupadas por migration —
// como o deploy do código (git push) é automático mas a migration é rodada
// manualmente no Supabase, sempre existe uma janela onde o código já espera
// uma coluna que o banco ainda não tem. Em vez de perder o evento, insertEvent
// detecta a coluna ausente pela mensagem de erro do Postgres e regrava sem o
// grupo inteiro daquela migration, tentando de novo.
const OPTIONAL_COLUMN_GROUPS: string[][] = [
  ["page_title", "extra_fields"], // migration 033
  ["country", "country_region", "city"], // migration 034
  ["event_id"], // migration 036
  ["pixel_id"], // migration 037
  ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_placement", "utm_campaign_id", "utm_adset_id", "utm_ad_id"], // migration 038
  ["lead_name", "postal_code", "latitude", "longitude", "device_type"], // migration 039
];

// Classifica o User-Agent (já chega em toda request) em 3 baldes pra relatório
// futuro de "performance por dispositivo" — guarda só a categoria, não o UA
// crú inteiro, que teria muito mais variação do que um relatório precisa.
function classifyDevice(userAgent: string): "mobile" | "tablet" | "desktop" {
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet(?!.*mobile)/.test(ua)) return "tablet";
  if (/mobi|android|iphone/.test(ua)) return "mobile";
  return "desktop";
}

// IDs (campaign_id/adset_id/ad_id) reaproveitam a mesma estrutura que a Meta
// Marketing API usa pra campaign/adset/ad — guardar a ID (não só o nome) é o
// que permite, num relatório futuro, JOIN com custo/ROAS por campanha/anúncio
// puxado da API da Meta, já que nome de campanha pode repetir e ID nunca repete.
const UTM_COLUMNS: Record<string, string> = {
  utm_source: "utm_source",
  utm_medium: "utm_medium",
  utm_campaign: "utm_campaign",
  utm_content: "utm_content",
  utm_term: "utm_term",
  utm_placement: "utm_placement",
  utm_campaign_id: "utm_campaign_id",
  utm_adset_id: "utm_adset_id",
  utm_ad_id: "utm_ad_id",
};

// Anúncios (ex.: Meta) costumam montar a UTM a partir de um placeholder
// ({{ad.name}} etc.) que já vem URL-encoded — somado ao encoding normal da
// query string, o valor chega com 2 camadas (%2520, %252F, "+" literal...).
// Decodifica em loop até estabilizar (mesma lógica de decodeUtmValue() em
// TrackingEventsView.tsx — se mudar uma, mudar a outra).
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

// Extrai as UTMs da event_url uma única vez, na captura — fica gravado em
// coluna pra qualquer relatório futuro agregar/filtrar em SQL, em vez de
// reprocessar a URL toda hora (era o que o dashboard fazia antes, só no client).
function parseUtmColumns(eventUrl: string): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const col of Object.values(UTM_COLUMNS)) out[col] = null;
  try {
    const u = new URL(eventUrl);
    for (const [param, col] of Object.entries(UTM_COLUMNS)) {
      const v = u.searchParams.get(param);
      if (v) out[col] = decodeUtmValue(v);
    }
  } catch {
    // event_url inválida — segue com tudo null, não derruba a captura.
  }
  return out;
}

async function insertEvent(db: ReturnType<typeof supabaseAdmin>, fullRow: Record<string, unknown>) {
  const candidate = { ...fullRow };
  let result = await db.from("events_log").insert(candidate).select("id").single();

  for (const group of OPTIONAL_COLUMN_GROUPS) {
    if (!result.error) break;
    const missing = group.some((col) => col in candidate && result.error?.message?.includes(col));
    if (!missing) continue;
    console.warn(`[tracking] colunas ${group.join("/")} ausentes (migration pendente), gravando sem elas`);
    for (const col of group) delete candidate[col];
    result = await db.from("events_log").insert(candidate).select("id").single();
  }

  return result;
}

interface ResolvedPixel {
  companyId: string;
  /** null = migration 037 ainda não rodou (config lida das colunas legadas de `companies`) ou a empresa ainda não criou nenhum pixel. */
  pixelId: string | null;
  meta_pixel_id: string | null;
  meta_capi_token: string | null;
  dominio_autorizado: string | null;
  meta_test_event_code: string | null;
}

// Antes da migration 037, a config de tracking era 4 colunas direto em
// `companies` (1 pixel por empresa). Mesma resiliência de sempre: se a coluna
// meta_test_event_code (036) ainda não existir, cai pra sem ela.
async function selectLegacyCompanyConfig(db: ReturnType<typeof supabaseAdmin>, companyId: string) {
  const FULL = "meta_pixel_id, meta_capi_token, dominio_autorizado, meta_test_event_code";
  const FALLBACK = "meta_pixel_id, meta_capi_token, dominio_autorizado";
  const full = await db.from("companies").select(FULL).eq("id", companyId).single();
  if (full.error?.message?.includes("meta_test_event_code")) {
    const fallback = await db.from("companies").select(FALLBACK).eq("id", companyId).single();
    return fallback.data ? { ...fallback.data, meta_test_event_code: null } : null;
  }
  return full.data ?? null;
}

// Resolve a empresa (por slug) e qual pixel de tracking usar: o `pixel_slug`
// do payload (cada landing page tem o seu, migration 037) ou o pixel marcado
// `is_default` da empresa quando o snippet é o antigo (`Tracker.init(empresa)`,
// sem 2º argumento). Se a tabela `tracking_pixels` ainda não existir (deploy
// antes da migration manual), cai pras 4 colunas legadas de `companies` — não
// pode quebrar a captura de NINGUÉM por causa de uma migration pendente.
async function resolveCompanyAndPixel(
  db: ReturnType<typeof supabaseAdmin>,
  companySlug: string,
  pixelSlug: string | undefined,
): Promise<{ resolved: ResolvedPixel | null; companyNotFound: boolean }> {
  const companyRes = await db.from("companies").select("id").eq("slug", companySlug).single();
  if (companyRes.error || !companyRes.data) {
    return { resolved: null, companyNotFound: true };
  }
  const companyId = companyRes.data.id as string;

  let pixelQuery = db
    .from("tracking_pixels")
    .select("id, meta_pixel_id, meta_capi_token, dominio_autorizado, meta_test_event_code")
    .eq("company_id", companyId);
  pixelQuery = pixelSlug ? pixelQuery.eq("slug", pixelSlug) : pixelQuery.eq("is_default", true);
  const pixelRes = await pixelQuery.maybeSingle();

  if (pixelRes.error?.message?.includes("tracking_pixels")) {
    console.warn("[tracking] tabela tracking_pixels ausente (migration 037 pendente), usando config legada de companies");
    const legacy = await selectLegacyCompanyConfig(db, companyId);
    return {
      companyNotFound: false,
      resolved: {
        companyId,
        pixelId: null,
        meta_pixel_id: legacy?.meta_pixel_id ?? null,
        meta_capi_token: legacy?.meta_capi_token ?? null,
        dominio_autorizado: legacy?.dominio_autorizado ?? null,
        meta_test_event_code: legacy?.meta_test_event_code ?? null,
      },
    };
  }

  if (!pixelRes.data) {
    // pixel_slug não bateu com nenhum pixel, ou a empresa nunca criou um —
    // não é erro: evento é capturado sem CAPI e sem restrição de domínio.
    return {
      companyNotFound: false,
      resolved: { companyId, pixelId: null, meta_pixel_id: null, meta_capi_token: null, dominio_autorizado: null, meta_test_event_code: null },
    };
  }

  return {
    companyNotFound: false,
    resolved: {
      companyId,
      pixelId: pixelRes.data.id as string,
      meta_pixel_id: pixelRes.data.meta_pixel_id ?? null,
      meta_capi_token: pixelRes.data.meta_capi_token ?? null,
      dominio_autorizado: pixelRes.data.dominio_autorizado ?? null,
      meta_test_event_code: pixelRes.data.meta_test_event_code ?? null,
    },
  };
}

interface TrackEventPayload {
  client_id: string;
  /** Slug do pixel (migration 037, cada landing page pode ter o seu) — omitido = usa o pixel `is_default` da empresa. */
  pixel_slug?: string;
  event_name: string;
  event_url: string;
  /** document.title no momento do evento — pra exibir o nome real da página no dashboard. */
  page_title?: string;
  /** ID persistente gerado pelo pixel.js e gravado em cookie 1ª parte (`_dm_uid`). */
  user_id?: string;
  /** UUID gerado por evento no pixel.js — manda o mesmo valor no fbq('track', ..., {eventID}) do navegador, é a chave de deduplicação Pixel+CAPI da Meta. */
  event_id?: string;
  /** Cookies _fbp/_fbc da Meta (não hasheados) — texto puro pro user_data da CAPI, melhora o Event Match Quality. */
  fbp?: string;
  fbc?: string;
  /** em/ph/fn/ln já chegam hasheados (SHA-256) do pixel.js — servidor só repassa. */
  user_data?: { em?: string; ph?: string; fn?: string; ln?: string };
  /** Email/telefone/nome/demais campos em texto puro (não hasheados) — só pra exibição/relatório no dashboard, NUNCA repassados à Meta. */
  pii?: { email?: string; phone?: string; name?: string; fields?: Record<string, string> };
  custom_data?: Record<string, unknown>;
}

function corsHeaders(origin: string | null): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function hostnameOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request.headers.get("origin")),
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  let payload: TrackEventPayload;
  try {
    payload = (await request.json()) as TrackEventPayload;
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400, headers });
  }

  if (!payload.client_id || !payload.event_name) {
    return NextResponse.json(
      { error: "client_id e event_name são obrigatórios." },
      { status: 400, headers },
    );
  }

  const db = supabaseAdmin();

  const { resolved, companyNotFound } = await resolveCompanyAndPixel(db, payload.client_id, payload.pixel_slug);

  if (companyNotFound || !resolved) {
    return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404, headers });
  }

  // Validação de domínio é checagem de aplicação, não de CORS — o preflight
  // sempre é permitido (não dá pra inspecionar o body antes dele), então é
  // aqui que `dominio_autorizado` realmente bloqueia clientes não autorizados.
  // Origin ausente (alguns navegadores em modo privado omitem) é soft-fail:
  // logamos e seguimos, em vez de derrubar o tracking silenciosamente.
  const requestHostname = hostnameOf(origin) ?? hostnameOf(request.headers.get("referer"));
  if (resolved.dominio_autorizado) {
    if (requestHostname && requestHostname !== resolved.dominio_autorizado) {
      console.warn(
        `[tracking] origem rejeitada para ${payload.client_id}: ${requestHostname} != ${resolved.dominio_autorizado}`,
      );
      return NextResponse.json({ error: "Domínio não autorizado." }, { status: 403, headers });
    }
    if (!requestHostname) {
      console.warn(`[tracking] origem ausente para ${payload.client_id}, seguindo mesmo assim (MVP).`);
    }
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const userAgent = request.headers.get("user-agent") ?? "unknown";

  // País/estado/cidade vêm de graça dos headers x-vercel-ip-* (rede da Vercel
  // já resolve geo-IP em toda requisição, sem chamada a API externa, sem custo,
  // sem latência extra e sem mandar o IP do visitante pra um terceiro). Em dev
  // local (sem Vercel) os 3 campos vêm undefined — fica NULL no banco, normal.
  const geo = geolocation(request);

  // `user_id` é o cookie persistente (_dm_uid) gerado pelo pixel.js — sobrevive
  // entre páginas/sessões no mesmo browser, é a fonte de verdade quando existe.
  // Fallback pra sha256(ip+UA) só quando o pixel não manda (ex: cliente antigo,
  // cookies bloqueados): fraco por design, IPs compartilhados colidem usuários
  // distintos — não substitui um `fbp`/`fbc` real, é só rede de segurança.
  const fingerprintId = payload.user_id?.trim() || createHash("sha256").update(`${ip}|${userAgent}`).digest("hex");

  // Captura funciona independente da Meta: events_log grava sempre que o
  // domínio bate, mesmo sem meta_pixel_id/meta_capi_token configurados.
  // Repasse pra Meta CAPI é best-effort, abaixo, só quando ambos existem.
  const metaConfigured = Boolean(resolved.meta_pixel_id && resolved.meta_capi_token);

  const baseRow = {
    company_id: resolved.companyId,
    event_name: payload.event_name,
    fingerprint_id: fingerprintId,
    event_url: payload.event_url,
    user_data: payload.user_data ?? {},
    lead_email: payload.pii?.email?.trim() || null,
    lead_phone: payload.pii?.phone?.trim() || null,
    capi_status: metaConfigured ? "pending" : "skipped",
  };

  const { data: inserted, error: insertError } = await insertEvent(db, {
    ...baseRow,
    page_title: payload.page_title?.trim() || null,
    extra_fields: payload.pii?.fields ?? {},
    country: geo.country ?? null,
    country_region: geo.countryRegion ?? null,
    city: geo.city ?? null,
    event_id: payload.event_id?.trim() || null,
    pixel_id: resolved.pixelId,
    ...parseUtmColumns(payload.event_url),
    lead_name: payload.pii?.name?.trim() || null,
    postal_code: geo.postalCode ?? null,
    latitude: geo.latitude ?? null,
    longitude: geo.longitude ?? null,
    device_type: classifyDevice(userAgent),
  });

  if (insertError || !inserted) {
    console.error("[tracking] falha ao gravar events_log:", insertError?.message);
    return NextResponse.json({ received: true }, { status: 200, headers });
  }

  if (!metaConfigured) {
    return NextResponse.json({ received: true }, { status: 200, headers });
  }

  // Falha na CAPI nunca pode virar 500 pro pixel — o form do cliente não
  // pode travar esperando a Meta responder. Pixel sempre recebe 200 rápido.
  try {
    const capiPayload = {
      data: [
        {
          event_name: payload.event_name,
          event_time: Math.floor(Date.now() / 1000),
          // Mesmo event_id que o pixel manda pro fbq('track', ..., {eventID})
          // no navegador — sem isso a Meta não consegue deduplicar Pixel+CAPI
          // e cada conversão conta em dobro (1x via browser, 1x via server).
          event_id: payload.event_id || undefined,
          action_source: "website",
          event_source_url: payload.event_url,
          user_data: {
            // em/ph/fn/ln já chegam hasheados do pixel.js (mesma normalização
            // trim+lowercase, ver sha256Hex no pixel.js) — servidor só repassa.
            em: payload.user_data?.em,
            ph: payload.user_data?.ph,
            fn: payload.user_data?.fn,
            ln: payload.user_data?.ln,
            client_ip_address: ip,
            client_user_agent: userAgent,
            // fbp/fbc NÃO são hasheados (são identificadores de clique/browser,
            // não PII) — manda como string crua, é o que a Meta espera.
            fbp: payload.fbp || undefined,
            fbc: payload.fbc || undefined,
            // País/estado/cidade vêm do geo-IP da Vercel (geo, calculado acima)
            // — únicos campos hasheados no servidor, porque só o servidor sabe
            // a localização (o browser não manda isso). zp (CEP) também vem
            // de graça do geo-IP quando a Vercel resolve.
            country: hashLower(geo.country),
            st: hashLower(geo.countryRegion),
            ct: hashLower(geo.city),
            zp: hashLower(geo.postalCode),
            // external_id: hash do _dm_uid persistente — não é PII, mas a Meta
            // recomenda mandar hasheado por consistência com os outros campos.
            external_id: hashLower(payload.user_id),
          },
          custom_data: payload.custom_data ?? {},
        },
      ],
      // Só presente durante teste manual (Events Manager → Eventos de teste);
      // por design da própria Meta, deve ser removido depois de validar.
      ...(resolved.meta_test_event_code ? { test_event_code: resolved.meta_test_event_code } : {}),
    };

    const capiUrl = `https://graph.facebook.com/${META_API_VERSION}/${resolved.meta_pixel_id}/events?access_token=${resolved.meta_capi_token}`;
    const capiRes = await fetch(capiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(capiPayload),
    });
    const capiJson = (await capiRes.json()) as { error?: { message?: string } };

    await db
      .from("events_log")
      .update(
        capiRes.ok && !capiJson.error
          ? { capi_status: "sent" }
          : { capi_status: "failed", capi_error: capiJson.error?.message ?? `HTTP ${capiRes.status}` },
      )
      .eq("id", inserted.id);
  } catch (err) {
    await db
      .from("events_log")
      .update({
        capi_status: "failed",
        capi_error: err instanceof Error ? err.message : "Erro desconhecido",
      })
      .eq("id", inserted.id);
  }

  return NextResponse.json({ received: true }, { status: 200, headers });
}
