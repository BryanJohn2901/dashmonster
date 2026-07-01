import { createHash, randomBytes, randomUUID } from "crypto";
import { NextRequest, NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashLower, hashPhone } from "@/lib/metaHash";
import { insertEventsLogRow } from "@/lib/eventsLogInsert";
import { sendMetaCapiEvent } from "@/lib/metaCapi";

export const runtime = "nodejs";
export const maxDuration = 30;

function runAfterResponse(task: () => Promise<void>): void {
  try { after(task); } catch { void task(); }
}

function validEventName(v: string): boolean {
  return v.length > 0 && v.length <= 64 && /^[A-Za-z][A-Za-z0-9_:-]*$/.test(v);
}

function splitFullName(name: string): { fn: string | undefined; ln: string | undefined } {
  const parts = name.trim().split(/\s+/);
  return {
    fn: parts[0] || undefined,
    ln: parts.length > 1 ? parts.slice(1).join(" ") : undefined,
  };
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/tracking/webhook/[slug]">) {
  const { slug } = await ctx.params;

  // Aceita Authorization: Bearer <secret> ou X-DM-Secret: <secret>
  const authHeader = request.headers.get("authorization") ?? "";
  const xSecret = request.headers.get("x-dm-secret") ?? "";
  const secret = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : xSecret.trim();

  if (!secret) {
    return NextResponse.json(
      { error: "Autenticação obrigatória. Use o header Authorization: Bearer <webhook_secret>." },
      { status: 401 },
    );
  }

  const db = supabaseAdmin();

  const pixelRes = await db
    .from("tracking_pixels")
    .select("id, company_id, meta_pixel_id, meta_capi_token, meta_test_event_code, webhook_secret")
    .eq("slug", slug)
    .maybeSingle();

  if (pixelRes.error || !pixelRes.data) {
    return NextResponse.json({ error: "Pixel não encontrado." }, { status: 404 });
  }

  const pixel = pixelRes.data;

  if (!pixel.webhook_secret || pixel.webhook_secret !== secret) {
    return NextResponse.json({ error: "Webhook secret inválido." }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 64 * 1024) {
    return NextResponse.json({ error: "Payload muito grande." }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const eventName = typeof body.event_name === "string" ? body.event_name.trim() : "";
  if (!validEventName(eventName)) {
    return NextResponse.json({ error: "event_name inválido ou ausente." }, { status: 400 });
  }

  // Dados do usuário — chegam em texto puro, hasheados aqui antes de ir pra Meta
  const emailRaw = typeof body.email === "string" ? body.email.trim() : undefined;
  const phoneRaw = typeof body.phone === "string" ? body.phone.trim() : undefined;

  // Nome: aceita "name" (nome completo) OU "first_name" + "last_name"
  const nameRaw = typeof body.name === "string" ? body.name.trim() : undefined;
  const firstNameRaw = typeof body.first_name === "string" ? body.first_name.trim() : undefined;
  const lastNameRaw = typeof body.last_name === "string" ? body.last_name.trim() : undefined;

  const splitResult = nameRaw ? splitFullName(nameRaw) : { fn: undefined, ln: undefined };
  const fn = firstNameRaw || splitResult.fn;
  const ln = lastNameRaw || splitResult.ln;
  const fullNameRaw = nameRaw || (fn && ln ? `${fn} ${ln}` : fn);

  // Hashes para Meta CAPI
  const em = hashLower(emailRaw);
  const ph = hashPhone(phoneRaw);
  const fnHashed = hashLower(fn);
  const lnHashed = hashLower(ln);

  // Valor monetário
  const value =
    typeof body.value === "number"
      ? body.value
      : typeof body.value === "string" && body.value.trim()
        ? parseFloat(body.value)
        : undefined;
  const currency =
    typeof body.currency === "string" && body.currency.trim()
      ? body.currency.toUpperCase().trim()
      : "BRL";

  // URL do evento (opcional para webhooks — a ferramenta externa pode não saber)
  const eventUrl =
    typeof body.event_url === "string" && body.event_url.trim()
      ? body.event_url.trim()
      : undefined;

  // Fonte da ação (padrão: "website" para formulários web)
  const actionSource =
    typeof body.action_source === "string" && body.action_source.trim()
      ? body.action_source.trim()
      : "website";

  // ID de deduplicação — gerado automaticamente se não enviado (UUID)
  const eventId =
    typeof body.event_id === "string" && body.event_id.trim()
      ? body.event_id.trim()
      : randomUUID();

  // Data/hora do evento (Unix timestamp segundos). Usa o do remetente se válido;
  // senão, horário de recebimento. Permite registrar eventos ocorridos no passado.
  const rawEventTime = body.event_time;
  const eventTime =
    typeof rawEventTime === "number" && rawEventTime > 1_000_000_000
      ? Math.floor(rawEventTime)
      : Math.floor(Date.now() / 1000);

  // UTMs — origem de tráfego/campanha enviada pelo formulário externo
  const utmSource   = typeof body.utm_source   === "string" && body.utm_source.trim()   ? body.utm_source.trim()   : undefined;
  const utmMedium   = typeof body.utm_medium   === "string" && body.utm_medium.trim()   ? body.utm_medium.trim()   : undefined;
  const utmCampaign = typeof body.utm_campaign === "string" && body.utm_campaign.trim() ? body.utm_campaign.trim() : undefined;
  const utmContent  = typeof body.utm_content  === "string" && body.utm_content.trim()  ? body.utm_content.trim()  : undefined;
  const utmTerm     = typeof body.utm_term     === "string" && body.utm_term.trim()     ? body.utm_term.trim()     : undefined;
  const utmPlacement = typeof body.utm_placement === "string" && body.utm_placement.trim() ? body.utm_placement.trim() : undefined;

  // Dados customizados
  const customData: Record<string, unknown> = {};
  if (value != null && !isNaN(value)) {
    customData.value = value;
    customData.currency = currency;
  }
  if (body.custom_data && typeof body.custom_data === "object" && !Array.isArray(body.custom_data)) {
    Object.assign(customData, body.custom_data as Record<string, unknown>);
  }

  const companyId = pixel.company_id as string;
  const metaConfigured = Boolean(pixel.meta_pixel_id && pixel.meta_capi_token);

  // fingerprint_id: SHA256(email) se disponível (correlaciona eventos do mesmo
  // lead pelo email); senão gera UUID único por evento (sem persistência).
  const fingerprintId = emailRaw
    ? createHash("sha256").update(emailRaw.toLowerCase()).digest("hex")
    : randomBytes(16).toString("hex");

  const { data: inserted, error: insertError } = await insertEventsLogRow(db, {
    company_id: companyId,
    event_name: eventName,
    fingerprint_id: fingerprintId,
    event_url: eventUrl ?? null,
    utm_source:    utmSource    ?? null,
    utm_medium:    utmMedium    ?? null,
    utm_campaign:  utmCampaign  ?? null,
    utm_content:   utmContent   ?? null,
    utm_term:      utmTerm      ?? null,
    utm_placement: utmPlacement ?? null,
    user_data: {
      ...(em ? { em } : {}),
      ...(ph ? { ph } : {}),
      ...(fnHashed ? { fn: fnHashed } : {}),
      ...(lnHashed ? { ln: lnHashed } : {}),
    },
    lead_email: emailRaw ?? null,
    lead_phone: phoneRaw ?? null,
    lead_name: fullNameRaw ?? null,
    capi_status: metaConfigured ? "pending" : "skipped",
    pixel_id: pixel.id,
    event_id: eventId ?? null,
    via: "webhook",
    value: value != null && !isNaN(value) ? value : null,
    currency: value != null && !isNaN(value) ? currency : null,
  });

  if (insertError || !inserted) {
    console.error("[tracking/webhook] falha ao gravar events_log:", insertError?.message);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  if (metaConfigured) {
    runAfterResponse(() =>
      sendMetaCapiEvent(db, {
        metaPixelId: pixel.meta_pixel_id as string,
        metaCapiToken: pixel.meta_capi_token as string,
        testEventCode: pixel.meta_test_event_code as string | null,
        eventLogId: inserted.id as string,
        eventData: {
          event_name: eventName,
          event_time: eventTime,
          event_id: eventId,
          action_source: actionSource,
          event_source_url: eventUrl,
          user_data: {
            em,
            ph,
            fn: fnHashed,
            ln: lnHashed,
          },
          custom_data: Object.keys(customData).length > 0 ? customData : undefined,
        },
      }),
    );
  }

  return NextResponse.json({ received: true });
}
