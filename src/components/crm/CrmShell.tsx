"use client";

// ─── PipeFlow — contexto de página (pós port fiel) ────────────────────────────
// Sidebar/header/gate agora vivem no AppShell (components/layout, port fiel do
// original), montado pelo app/crm/layout.tsx. Este shell só resolve o contexto
// {companyId, canWrite} para as páginas que ainda usam o render prop.
// A prop `active` ficou sem uso (nav é por pathname no SidebarNav) — mantida
// para não tocar nas páginas até cada uma ser portada.

import type { ReactNode } from "react";
import { useCompany } from "@/hooks/useCompany";

interface CrmShellProps {
  active?: "pipeline" | "inbox" | "leads" | "calendar" | "dashboard" | "config";
  children: (ctx: { companyId: string; canWrite: boolean }) => ReactNode;
}

export function CrmShell({ children }: CrmShellProps) {
  const { company, isSuperAdmin, loading, canWrite } = useCompany();

  // AppShell já cobre loading/gate com a UI original; aqui só evita render sem contexto.
  if (loading || !company) return null;

  return <>{children({ companyId: company.id, canWrite: canWrite || isSuperAdmin })}</>;
}
