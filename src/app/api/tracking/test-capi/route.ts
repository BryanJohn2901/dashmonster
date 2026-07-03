import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/trackingAuth";

export const runtime = "nodejs";

const META_API_VERSION = "v23.0";
const TIMEOUT_MS = 8000;

export async function POST(request: NextRequest) {
  let body: { companySlug?: string; pixelSlug?: string };
  try {
    body = (await request.json()) as { companySlug?: string; pixelSlug?: string };
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const { companySlug, pixelSlug } = body;
  if (!companySlug) return NextResponse.json({ error: "companySlug obrigatório." }, { status: 400 });

  const auth = await requireCompanyAccess(request, { companySlug, write: true });
  if (!auth.ok) return auth.response;

  const { companyId, db } = auth;

  let pixelQuery = db
    .from("tracking_pixels")
    .select("meta_pixel_id, meta_capi_token, meta_test_event_code")
    .eq("company_id", companyId);
  pixelQuery = pixelSlug ? pixelQuery.eq("slug", pixelSlug) : pixelQuery.eq("is_default", true);
  const { data: pixel } = await pixelQuery.maybeSingle();

  if (!pixel) return NextResponse.json({ error: "Pixel não encontrado." }, { status: 404 });
  if (!pixel.meta_pixel_id || !pixel.meta_capi_token) {
    return NextResponse.json({ error: "Pixel ID e Token CAPI precisam estar configurados e salvos." }, { status: 400 });
  }
  if (!pixel.meta_test_event_code) {
    return NextResponse.json({ error: "Salve o Código de Teste primeiro (botão Salvar abaixo)." }, { status: 400 });
  }

  const capiPayload = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: `dm-test-${Date.now()}`,
        action_source: "system_generated",
        user_data: {
          client_ip_address: "127.0.0.1",
          client_user_agent: "DashMonster/TestEvent",
        },
        custom_data: {
          value: 97.0,
          currency: "BRL",
          content_ids: ["dm-test-purchase"],
          contents: [{ id: "dm-test-purchase", quantity: 1 }],
          num_items: 1,
        },
      },
    ],
    test_event_code: pixel.meta_test_event_code,
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let capiRes: Response;
    try {
      capiRes = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${pixel.meta_pixel_id}/events?access_token=${pixel.meta_capi_token}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(capiPayload), signal: controller.signal },
      );
    } finally {
      clearTimeout(timer);
    }

    let json: { error?: { message?: string; error_user_msg?: string; error_user_title?: string } } = {};
    try {
      json = (await capiRes.json()) as typeof json;
    } catch {
      // resposta não-JSON (gateway 5xx)
    }

    if (!capiRes.ok || json.error) {
      const msg = json.error?.error_user_msg || json.error?.error_user_title || json.error?.message || `HTTP ${capiRes.status}`;
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao conectar com a Meta.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
