"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { isSupabaseConfigured } from "@/lib/supabase";

/**
 * Acesso ao /crm só por convite: quem autenticou mas não pertence a nenhuma
 * empresa (e não é super admin) é mandado de volta pra "/", onde o gate mostra
 * a tela de acesso restrito. Fecha o bypass de digitar /crm na URL. Em modo dev
 * (sem Supabase) libera — o preview não tem auth.
 */
export function CrmAccessGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { memberships, isSuperAdmin, loading } = useCompany();
  const denied = isSupabaseConfigured && !loading && !isSuperAdmin && memberships.length === 0;

  useEffect(() => {
    if (denied) router.replace("/");
  }, [denied, router]);

  if (isSupabaseConfigured && loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--dm-bg-page)" }}>
        <Loader2 size={22} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} />
      </div>
    );
  }
  if (denied) return null; // redirecionando

  return <>{children}</>;
}
