import { NextRequest, NextResponse } from "next/server";
import { geolocation } from "@vercel/functions";
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
  const pixelSlug = request.nextUrl.searchParams.get("pixel_slug") ?? undefined;
  const headers = corsHeaders();
  if (!clientId) {
    return NextResponse.json({ error: "client_id é obrigatório." }, { status: 400, headers });
  }

  // geo extraída aqui (antes dos lookups de DB) — essa request vem sempre
  // direto do browser, então a Vercel tem o IP real do visitante, mesmo no
  // snippet legado onde PHP serve o pixel.js (o CONFIG_URL nunca passa pelo PHP).
  const g = geolocation(request);
  const geo = (g.country || g.city)
    ? {
        country: g.country ?? null,
        countryRegion: g.countryRegion ?? null,
        city: g.city ?? null,
        postalCode: g.postalCode ?? null,
        latitude: g.latitude ? parseFloat(g.latitude) || null : null,
        longitude: g.longitude ? parseFloat(g.longitude) || null : null,
      }
    : null;

  const db = supabaseAdmin();
  const company = await db.from("companies").select("id, meta_pixel_id").eq("slug", clientId).single();
  if (!company.data) {
    return NextResponse.json({ metaPixelId: null, geo }, { status: 200, headers: { ...headers, "Cache-Control": "no-store" } });
  }

  // Cada landing page pode ter o seu pixel (migration 037) — pixel_slug
  // identifica qual; sem ele, usa o `is_default` da empresa (snippet antigo,
  // `Tracker.init(empresa)` sem 2º argumento).
  let pixelQuery = db.from("tracking_pixels").select("meta_pixel_id").eq("company_id", company.data.id);
  pixelQuery = pixelSlug ? pixelQuery.eq("slug", pixelSlug) : pixelQuery.eq("is_default", true);
  const pixel = await pixelQuery.maybeSingle();

  // Tabela ainda não existe (migration 037 pendente) — cai pra coluna legada
  // de `companies`, mesmo comportamento de antes dessa migration.
  const metaPixelId = pixel.error?.message?.includes("tracking_pixels")
    ? company.data.meta_pixel_id ?? null
    : pixel.data?.meta_pixel_id ?? null;

  return NextResponse.json(
    { metaPixelId, geo },
    { status: 200, headers: { ...headers, "Cache-Control": "no-store" } },
  );
}
