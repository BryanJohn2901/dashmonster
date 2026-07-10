import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import "./crm.css";

// PipeFlow (port fiel): .pf-app liga os tokens shadcn usados pelos componentes
// copiados — hoje aliasados pra dm-* (ver crm.css), então segue o light/dark
// e a paleta do hub. AppShell = sidebar/header originais.
export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <div className="pf-app min-h-screen">
      <AppShell>{children}</AppShell>
    </div>
  );
}
