import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// service_role: rota server-side precisa atravessar o RLS multi-tenant
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * POST /api/save-creative
 *
 * Downloads the Meta CDN thumbnail server-side (avoids CORS),
 * uploads to Supabase Storage bucket "creatives", and upserts
 * a record in campaign_creatives.
 *
 * Body: { thumbnailUrl, campaignName, adAccountId, adLink }
 * Returns: { storageUrl, path }
 */
export async function POST(request: NextRequest) {
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  }

  let body: { thumbnailUrl?: string; campaignName?: string; adAccountId?: string; adLink?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const { thumbnailUrl, campaignName, adAccountId = "", adLink = "" } = body;

  if (!thumbnailUrl || !campaignName) {
    return NextResponse.json(
      { error: "thumbnailUrl e campaignName são obrigatórios." },
      { status: 400 },
    );
  }

  // Download image from Meta CDN
  let imgRes: Response;
  try {
    imgRes = await fetch(thumbnailUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Falha ao baixar imagem: ${String(e)}` },
      { status: 502 },
    );
  }

  if (!imgRes.ok) {
    return NextResponse.json(
      { error: `Meta CDN retornou ${imgRes.status}` },
      { status: 502 },
    );
  }

  const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
  const ext = contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
      ? "webp"
      : "jpg";

  const arrayBuffer = await imgRes.arrayBuffer();
  const fileData = new Uint8Array(arrayBuffer);

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Build a safe filename
  const safeName = campaignName
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);
  const path = `${safeName}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("creatives")
    .upload(path, fileData, { contentType, upsert: false });

  if (uploadError) {
    return NextResponse.json(
      { error: `Upload falhou: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const { data: urlData } = supabase.storage.from("creatives").getPublicUrl(path);
  const storageUrl = urlData.publicUrl;

  // Upsert in campaign_creatives (conflict on campaign_name)
  const { error: dbError } = await supabase
    .from("campaign_creatives")
    .upsert(
      {
        campaign_name: campaignName,
        ad_account_id: adAccountId,
        meta_url:      thumbnailUrl,
        storage_path:  path,
        storage_url:   storageUrl,
        ad_link:       adLink,
        updated_at:    new Date().toISOString(),
      },
      { onConflict: "campaign_name" },
    );

  if (dbError) {
    return NextResponse.json(
      { error: `Erro ao salvar no banco: ${dbError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ storageUrl, path });
}
