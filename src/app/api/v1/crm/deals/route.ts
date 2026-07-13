// ─── API pública CRM v1 — Deals ───────────────────────────────────────────────
// Auth: Authorization: Bearer pf_... (token gerado em /crm/settings/developers).
// GET  ?pipeline_id=&status=&limit=  → lista (máx 200)
// POST { title, pipeline_id?, stage_id?, value?, lead_id? }
//   pipeline_id/stage_id omitidos → primeiro funil da empresa / primeira etapa aberta.

import { NextRequest, NextResponse } from "next/server";
import { requireApiToken, requireScope } from "@/lib/crmApiAuth";
import { dispatchCrmWebhooks } from "@/lib/server/crmWebhookDispatch";

const DEAL_COLS =
  "id, title, value, status, pipeline_id, stage_id, lead_id, owner_id, created_at, updated_at, stage_entered_at";

export async function GET(request: NextRequest) {
  const result = await requireApiToken(request);
  if (!result.ok) return result.response;
  const scopeError = requireScope(result.auth.scopes, "read");
  if (scopeError) return scopeError;

  const sp = request.nextUrl.searchParams;
  const limit = Math.min(Number(sp.get("limit") ?? 50) || 50, 200);
  const pipelineId = sp.get("pipeline_id");
  const status = sp.get("status");

  let query = result.auth.db.from("deals").select(DEAL_COLS).eq("company_id", result.auth.companyId)
    .order("created_at", { ascending: false }).limit(limit);
  if (pipelineId) query = query.eq("pipeline_id", pipelineId);
  if (status) query = query.eq("status", status);

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

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "'title' é obrigatório." }, { status: 400 });

  const { auth } = result;
  let pipelineId = typeof body.pipeline_id === "string" ? body.pipeline_id : null;
  let stageId = typeof body.stage_id === "string" ? body.stage_id : null;

  if (!pipelineId) {
    const { data: pipeline } = await auth.db.from("pipelines").select("id").eq("company_id", auth.companyId)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    pipelineId = (pipeline?.id as string) ?? null;
  }
  if (!pipelineId) return NextResponse.json({ error: "Empresa sem funil configurado." }, { status: 422 });

  if (!stageId) {
    const { data: stage } = await auth.db.from("pipeline_stages").select("id").eq("pipeline_id", pipelineId)
      .eq("status_kind", "open").order("order_index", { ascending: true }).limit(1).maybeSingle();
    stageId = (stage?.id as string) ?? null;
  }
  if (!stageId) return NextResponse.json({ error: "Funil sem etapa aberta." }, { status: 422 });

  const { data: stageRow } = await auth.db.from("pipeline_stages").select("status_kind").eq("id", stageId).maybeSingle();
  const status = stageRow?.status_kind === "won" ? "won" : stageRow?.status_kind === "lost" ? "lost" : "open";

  const { data, error } = await auth.db
    .from("deals")
    .insert({
      company_id: auth.companyId,
      owner_id: auth.createdBy,
      pipeline_id: pipelineId,
      stage_id: stageId,
      lead_id: typeof body.lead_id === "string" ? body.lead_id : null,
      title,
      value: typeof body.value === "number" ? body.value : null,
      status,
    })
    .select(DEAL_COLS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  void dispatchCrmWebhooks(auth.db, auth.companyId, "deal.created", data);
  return NextResponse.json({ data }, { status: 201 });
}
