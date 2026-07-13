// ─── Registro de auditoria (ações relevantes, não cada clique) ────────────────
// Fire-and-forget: nunca deve travar a UI nem quebrar o fluxo principal por
// falha de rede/RLS. Ver migration 081_audit_log.sql.

import { supabaseClient } from "@/lib/supabase";

export type AuditAction = "page_view" | "export" | "product_change" | "create" | "update" | "delete";

export interface AuditLogInput {
  companyId: string | null;
  action: AuditAction;
  entityType?: string;
  entityLabel?: string;
  details?: Record<string, unknown>;
}

export async function logAudit(input: AuditLogInput): Promise<void> {
  if (!supabaseClient) return;
  try {
    const { data } = await supabaseClient.auth.getUser();
    if (!data.user) return;
    const { error } = await supabaseClient.from("audit_log").insert({
      company_id: input.companyId,
      user_id: data.user.id,
      user_email: data.user.email ?? null,
      action: input.action,
      entity_type: input.entityType ?? null,
      entity_label: input.entityLabel ?? null,
      details: input.details ?? {},
    });
    if (error) console.warn("[audit] insert falhou:", error.message);
  } catch (e) {
    console.warn("[audit] erro inesperado:", e);
  }
}
