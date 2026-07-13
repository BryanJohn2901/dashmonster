// ─── Webhook de entrada pública — captação de lead (formulários/landing pages) ─
// URL: /api/v1/inbound/webhooks/<webhook_key> (gerada em /crm/settings/developers).
// Sem auth de sessão — a própria chave é o segredo (mesmo padrão de tracking/webhook/[slug]).

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { dispatchCrmWebhooks } from "@/lib/server/crmWebhookDispatch";

async function parseBody(request: NextRequest): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try { return await request.json(); } catch { return {}; }
  }
  const form = await request.formData().catch(() => null);
  if (!form) return {};
  return Object.fromEntries(form.entries());
}

function pick(body: Record<string, unknown>, fieldMap: Record<string, string>, target: string): string | null {
  const sourceKey = Object.entries(fieldMap).find(([, v]) => v === target)?.[0];
  const raw = sourceKey ? body[sourceKey] : body[target];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/v1/inbound/webhooks/[key]">) {
  const { key } = await ctx.params;
  const db = supabaseAdmin();

  const { data: hook, error: hookError } = await db
    .from("inbound_webhooks")
    .select("id, company_id, pipeline_id, default_stage_id, default_owner_id, default_tags, default_product, field_map, is_active")
    .eq("webhook_key", key)
    .maybeSingle();

  if (hookError || !hook || !hook.is_active) {
    return NextResponse.json({ error: "Webhook não encontrado ou inativo." }, { status: 404 });
  }

  const body = await parseBody(request);
  const fieldMap = (hook.field_map as Record<string, string>) ?? {};
  const name = pick(body, fieldMap, "name") ?? "Lead sem nome";
  const email = pick(body, fieldMap, "email");
  const phone = pick(body, fieldMap, "phone");

  let ownerId = hook.default_owner_id as string | null;
  if (!ownerId) {
    const { data: owner } = await db.from("company_members").select("user_id").eq("company_id", hook.company_id)
      .eq("role", "owner").limit(1).maybeSingle();
    ownerId = (owner?.user_id as string) ?? null;
  }
  if (!ownerId) return NextResponse.json({ error: "Empresa sem dono configurado." }, { status: 422 });

  const { data: lead, error: leadError } = await db
    .from("crm_leads")
    .insert({
      company_id: hook.company_id, owner_id: ownerId, name, email, phone,
      whatsapp: pick(body, fieldMap, "whatsapp"), instagram: pick(body, fieldMap, "instagram"),
      company: pick(body, fieldMap, "company"), notes: pick(body, fieldMap, "notes"),
      status: "new", origin: "inbound_webhook",
      utm_source: pick(body, fieldMap, "utm_source"), utm_medium: pick(body, fieldMap, "utm_medium"),
      utm_campaign: pick(body, fieldMap, "utm_campaign"),
    })
    .select("id, name, email")
    .single();

  if (leadError) return NextResponse.json({ error: leadError.message }, { status: 500 });
  void dispatchCrmWebhooks(db, hook.company_id as string, "lead.created", lead);

  let dealId: string | null = null;
  if (hook.pipeline_id) {
    let stageId = hook.default_stage_id as string | null;
    if (!stageId) {
      const { data: stage } = await db.from("pipeline_stages").select("id").eq("pipeline_id", hook.pipeline_id)
        .eq("status_kind", "open").order("order_index", { ascending: true }).limit(1).maybeSingle();
      stageId = (stage?.id as string) ?? null;
    }
    if (stageId) {
      const { data: deal } = await db
        .from("deals")
        .insert({
          company_id: hook.company_id, owner_id: ownerId, pipeline_id: hook.pipeline_id, stage_id: stageId,
          lead_id: lead.id, title: (hook.default_product as string) || name, product_name: hook.default_product,
        })
        .select("id, title")
        .single();
      if (deal) {
        dealId = deal.id as string;
        void dispatchCrmWebhooks(db, hook.company_id as string, "deal.created", deal);

        const tagNames = (hook.default_tags as string[]) ?? [];
        for (const tagName of tagNames) {
          const { data: tag } = await db.from("tags").select("id").eq("company_id", hook.company_id)
            .ilike("name", tagName).maybeSingle();
          const tagId = tag?.id ?? (await db.from("tags").insert({ company_id: hook.company_id, name: tagName }).select("id").single()).data?.id;
          if (tagId) await db.from("deal_tags").insert({ deal_id: dealId, tag_id: tagId, company_id: hook.company_id });
        }
      }
    }
  }

  return NextResponse.json({ ok: true, lead_id: lead.id, deal_id: dealId }, { status: 201 });
}
