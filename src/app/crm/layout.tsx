import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { CrmAccessGuard } from "@/components/CrmAccessGuard";
import "./crm.css";

// PipeFlow (port fiel): .pf-app liga os tokens shadcn usados pelos componentes
// copiados — hoje aliasados pra dm-* (ver crm.css), então segue o light/dark
// e a paleta do hub. AppShell = sidebar/header originais.
// CrmAccessGuard: bloqueia quem não pertence a nenhuma empresa (acesso só por convite).
export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <div className="pf-app min-h-screen">
      <CrmAccessGuard>
        <AppShell>{children}</AppShell>
      </CrmAccessGuard>
    </div>
  );
}
