// ─── API pública CRM v1 — Leads ───────────────────────────────────────────────
// Auth: Authorization: Bearer pf_... (token gerado em /crm/settings/developers).
// GET  ?status=&search=&limit=  → lista (máx 200)
// POST { name, email?, phone?, whatsapp?, instagram?, company?, status?,
//        estimated_value?, notes?, origin?, utm_source?, utm_medium?, utm_campaign? }

import { NextRequest, NextResponse } from "next/server";
import { requireApiToken, requireScope } from "@/lib/crmApiAuth";
import { dispatchCrmWebhooks } from "@/lib/server/crmWebhookDispatch";

const LEAD_COLS =
  "id, name, email, phone, whatsapp, instagram, company, status, estimated_value, notes, origin, created_at, updated_at";

export async function GET(request: NextRequest) {
  const result = await requireApiToken(request);
  if (!result.ok) return result.response;
  const scopeError = requireScope(result.auth.scopes, "read");
  if (scopeError) return scopeError;

  const sp = request.nextUrl.searchParams;
  const limit = Math.min(Number(sp.get("limit") ?? 50) || 50, 200);
  const status = sp.get("status");
  const search = sp.get("search")?.trim();

  let query = result.auth.db.from("crm_leads").select(LEAD_COLS).eq("company_id", result.auth.companyId)
    .order("created_at", { ascending: false }).limit(limit);
  if (status) query = query.eq("status", status);
  if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const result = await requireApiToken(request);
  if (!result.ok) return result.response;
  const scopeError = requireScope(result.auth.scopes, "write");
  if (scopeError) return scopeError;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "'name' é obrigatório." }, { status: 400 });

  const { auth } = result;
  const { data, error } = await auth.db
    .from("crm_leads")
    .insert({
      company_id: auth.companyId,
      owner_id: auth.createdBy,
      name,
      email: typeof body.email === "string" ? body.email : null,
      phone: typeof body.phone === "string" ? body.phone : null,
      whatsapp: typeof body.whatsapp === "string" ? body.whatsapp : null,
      instagram: typeof body.instagram === "string" ? body.instagram : null,
      company: typeof body.company === "string" ? body.company : null,
      status: typeof body.status === "string" ? body.status : "new",
      estimated_value: typeof body.estimated_value === "number" ? body.estimated_value : null,
      notes: typeof body.notes === "string" ? body.notes : null,
      origin: typeof body.origin === "string" ? body.origin : "api",
      utm_source: typeof body.utm_source === "string" ? body.utm_source : null,
      utm_medium: typeof body.utm_medium === "string" ? body.utm_medium : null,
      utm_campaign: typeof body.utm_campaign === "string" ? body.utm_campaign : null,
    })
    .select(LEAD_COLS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  void dispatchCrmWebhooks(auth.db, auth.companyId, "lead.created", data);
  return NextResponse.json({ data }, { status: 201 });
}
