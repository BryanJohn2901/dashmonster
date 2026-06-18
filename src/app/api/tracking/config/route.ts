import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Endpoint público (sem auth, CORS aberto) — só devolve o que já é público
// em qualquer site que usa Meta Pixel (o Pixel ID aparece no HTML de
// qualquer página que o carrega). NUNCA devolver meta_capi_token,
// dominio_autorizado ou meta_test_event_code aqui — esses ficam só no
// servidor, usados em track-event/route.ts.
function corsHeaders(): HeadersInit {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("client_id");
  const headers = corsHeaders();
  if (!clientId) {
    return NextResponse.json({ error: "client_id é obrigatório." }, { status: 400, headers });
  }

  const db = supabaseAdmin();
  const { data: company } = await db
    .from("companies")
    .select("meta_pixel_id")
    .eq("slug", clientId)
    .single();

  return NextResponse.json(
    { metaPixelId: company?.meta_pixel_id ?? null },
    { status: 200, headers: { ...headers, "Cache-Control": "no-store" } },
  );
}
