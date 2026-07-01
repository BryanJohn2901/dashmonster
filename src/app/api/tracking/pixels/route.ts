import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireCompanyAccess } from "@/lib/trackingAuth";

export const runtime = "nodejs";

const PIXEL_SELECT =
  "id, company_id, slug, name, meta_pixel_id, meta_capi_token, dominio_autorizado, meta_test_event_code, is_default, created_at, webhook_secret";

function normalizeHostname(raw: string): string {
  let v = raw.trim().toLowerCase();
  if (!v) return "";
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  v = v.split("/")[0].split("?")[0].split("#")[0].split(":")[0];
  return v;
}

function randomSlug(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function safePixel(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: (row.name as string) || "Pixel sem nome",
    metaPixelId: (row.meta_pixel_id as string) ?? "",
    hasMetaCapiToken: Boolean(row.meta_capi_token),
    hasWebhookSecret: Boolean(row.webhook_secret),
    dominioAutorizado: (row.dominio_autorizado as string) ?? "",
    metaTestEventCode: (row.meta_test_event_code as string) ?? "",
    isDefault: Boolean(row.is_default),
  };
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const access = await requireCompanyAccess(request, { companyId, write: false });
  if (!access.ok) return access.response;

  const { data, error } = await access.db
    .from("tracking_pixels")
    .select(PIXEL_SELECT)
    .eq("company_id", access.companyId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pixels: (data ?? []).map((row) => safePixel(row as Record<string, unknown>)) });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { companyId?: string; name?: string } | null;
  const access = await requireCompanyAccess(request, { companyId: body?.companyId, write: true });
  if (!access.ok) return access.response;

  const existing = await access.db
    .from("tracking_pixels")
    .select("id", { count: "exact", head: true })
    .eq("company_id", access.companyId);
  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 });

  const { data, error } = await access.db
    .from("tracking_pixels")
    .insert({
      company_id: access.companyId,
      slug: randomSlug(),
      name: body?.name?.trim() || "Novo pixel",
      is_default: (existing.count ?? 0) === 0,
    })
    .select(PIXEL_SELECT)
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? "Erro ao criar pixel." }, { status: 500 });
  return NextResponse.json({ pixel: safePixel(data as Record<string, unknown>) }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null) as
    | {
        action?: "update" | "set-default" | "generate-webhook-secret" | "clear-webhook-secret";
        pixelId?: string;
        name?: string;
        metaPixelId?: string;
        metaCapiToken?: string | null;
        dominioAutorizado?: string;
        metaTestEventCode?: string;
      }
    | null;

  if (!body?.pixelId) return NextResponse.json({ error: "pixelId obrigatorio." }, { status: 400 });

  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  const pixelRes = await auth.db
    .from("tracking_pixels")
    .select(PIXEL_SELECT)
    .eq("id", body.pixelId)
    .maybeSingle();
  if (pixelRes.error || !pixelRes.data) {
    return NextResponse.json({ error: "Pixel nao encontrado." }, { status: 404 });
  }

  const companyId = pixelRes.data.company_id as string;
  const access = await requireCompanyAccess(request, { companyId, write: true });
  if (!access.ok) return access.response;

  if (body.action === "generate-webhook-secret") {
    const newSecret = randomBytes(32).toString("hex");
    const upd = await access.db
      .from("tracking_pixels")
      .update({ webhook_secret: newSecret })
      .eq("id", body.pixelId)
      .eq("company_id", companyId);
    if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 });
    const fresh = await access.db.from("tracking_pixels").select(PIXEL_SELECT).eq("id", body.pixelId).single();
    if (fresh.error || !fresh.data) return NextResponse.json({ error: "Pixel não encontrado." }, { status: 500 });
    // webhookSecret retornado UMA VEZ — nunca mais exposto (nem em GET, nem no próximo PATCH)
    return NextResponse.json({ pixel: safePixel(fresh.data as Record<string, unknown>), webhookSecret: newSecret });
  }

  if (body.action === "clear-webhook-secret") {
    const upd = await access.db
      .from("tracking_pixels")
      .update({ webhook_secret: null })
      .eq("id", body.pixelId)
      .eq("company_id", companyId);
    if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 });
    const fresh = await access.db.from("tracking_pixels").select(PIXEL_SELECT).eq("id", body.pixelId).single();
    if (fresh.error || !fresh.data) return NextResponse.json({ error: "Pixel não encontrado." }, { status: 500 });
    return NextResponse.json({ pixel: safePixel(fresh.data as Record<string, unknown>) });
  }

  if (body.action === "set-default") {
    const rpc = await access.db.rpc("set_default_tracking_pixel", {
      p_company_id: companyId,
      p_pixel_id: body.pixelId,
    });
    if (rpc.error) {
      const missingRpc = rpc.error.code === "42883" || /set_default_tracking_pixel/i.test(rpc.error.message ?? "");
      if (!missingRpc) return NextResponse.json({ error: rpc.error.message }, { status: 500 });
      const clear = await access.db.from("tracking_pixels").update({ is_default: false }).eq("company_id", companyId);
      if (clear.error) return NextResponse.json({ error: clear.error.message }, { status: 500 });
      const mark = await access.db.from("tracking_pixels").update({ is_default: true }).eq("id", body.pixelId).eq("company_id", companyId);
      if (mark.error) return NextResponse.json({ error: mark.error.message }, { status: 500 });
    }
  } else {
    const update: Record<string, unknown> = {
      name: body.name?.trim() || "Pixel sem nome",
      meta_pixel_id: body.metaPixelId?.trim() || null,
      dominio_autorizado: normalizeHostname(body.dominioAutorizado ?? "") || null,
      meta_test_event_code: body.metaTestEventCode?.trim() || null,
    };
    if (body.metaCapiToken !== undefined) {
      update.meta_capi_token = body.metaCapiToken?.trim() || null;
    }
    const updated = await access.db
      .from("tracking_pixels")
      .update(update)
      .eq("id", body.pixelId)
      .eq("company_id", companyId);
    if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 500 });
  }

  const fresh = await access.db
    .from("tracking_pixels")
    .select(PIXEL_SELECT)
    .eq("id", body.pixelId)
    .single();
  if (fresh.error || !fresh.data) {
    return NextResponse.json({ error: fresh.error?.message ?? "Pixel nao encontrado apos salvar." }, { status: 500 });
  }
  return NextResponse.json({ pixel: safePixel(fresh.data as Record<string, unknown>) });
}

export async function DELETE(request: NextRequest) {
  const pixelId = request.nextUrl.searchParams.get("pixelId");
  if (!pixelId) return NextResponse.json({ error: "pixelId obrigatorio." }, { status: 400 });

  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  const pixelRes = await auth.db
    .from("tracking_pixels")
    .select("id, company_id")
    .eq("id", pixelId)
    .maybeSingle();
  if (pixelRes.error || !pixelRes.data) {
    return NextResponse.json({ error: "Pixel nao encontrado." }, { status: 404 });
  }

  const companyId = pixelRes.data.company_id as string;
  const access = await requireCompanyAccess(request, { companyId, write: true });
  if (!access.ok) return access.response;

  const countRes = await access.db
    .from("tracking_pixels")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);
  if (countRes.error) return NextResponse.json({ error: countRes.error.message }, { status: 500 });
  if ((countRes.count ?? 0) <= 1) {
    return NextResponse.json({ error: "A empresa precisa ter pelo menos 1 pixel." }, { status: 409 });
  }

  const deleted = await access.db.from("tracking_pixels").delete().eq("id", pixelId).eq("company_id", companyId);
  if (deleted.error) return NextResponse.json({ error: deleted.error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
