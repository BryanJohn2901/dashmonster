import { redirect } from "next/navigation";

// Port fiel: o board vive em /crm/pipeline (como /pipeline no original);
// a raiz do CRM abre o Dashboard, igual ao original pós-login.
export default function CrmPage() {
  redirect("/crm/dashboard");
}
