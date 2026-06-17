import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const META_API_VERSION = "v19.0";

interface TrackEventPayload {
  client_id: string;
  event_name: string;
  event_url: string;
  user_data?: { em?: string; ph?: string };
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

  const { data: company, error: companyError } = await db
    .from("companies")
    .select("id, meta_pixel_id, meta_capi_token, dominio_autorizado")
    .eq("slug", payload.client_id)
    .single();

  if (companyError || !company) {
    return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404, headers });
  }

  if (!company.meta_pixel_id || !company.meta_capi_token) {
    return NextResponse.json(
      { error: "Tracking não configurado para este cliente." },
      { status: 400, headers },
    );
  }

  // Validação de domínio é checagem de aplicação, não de CORS — o preflight
  // sempre é permitido (não dá pra inspecionar o body antes dele), então é
  // aqui que `dominio_autorizado` realmente bloqueia clientes não autorizados.
  // Origin ausente (alguns navegadores em modo privado omitem) é soft-fail:
  // logamos e seguimos, em vez de derrubar o tracking silenciosamente.
  const requestHostname = hostnameOf(origin) ?? hostnameOf(request.headers.get("referer"));
  if (company.dominio_autorizado) {
    if (requestHostname && requestHostname !== company.dominio_autorizado) {
      console.warn(
        `[tracking] origem rejeitada para ${payload.client_id}: ${requestHostname} != ${company.dominio_autorizado}`,
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

  // Fingerprint fraco por design (MVP): sem cookie/localStorage, o mesmo
  // visitante gera ids diferentes entre redes, e IPs compartilhados (NAT
  // corporativo, CGNAT mobile) colidem usuários distintos num único id.
  // Não substitui um `fbp`/`fbc` real — suficiente só pro MVP.
  const fingerprintId = createHash("sha256").update(`${ip}|${userAgent}`).digest("hex");

  const { data: inserted, error: insertError } = await db
    .from("events_log")
    .insert({
      company_id: company.id,
      event_name: payload.event_name,
      fingerprint_id: fingerprintId,
      event_url: payload.event_url,
      user_data: payload.user_data ?? {},
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[tracking] falha ao gravar events_log:", insertError?.message);
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
          action_source: "website",
          event_source_url: payload.event_url,
          user_data: {
            em: payload.user_data?.em,
            ph: payload.user_data?.ph,
            client_ip_address: ip,
            client_user_agent: userAgent,
          },
          custom_data: payload.custom_data ?? {},
        },
      ],
    };

    const capiUrl = `https://graph.facebook.com/${META_API_VERSION}/${company.meta_pixel_id}/events?access_token=${company.meta_capi_token}`;
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
