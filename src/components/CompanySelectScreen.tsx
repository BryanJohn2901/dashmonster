"use client";

import { Building2, LogOut, ChevronRight } from "lucide-react";
import type { CompanyMembership, CompanyRole } from "@/hooks/useCompany";

const ROLE_LABELS: Record<CompanyRole, string> = {
  owner: "Dono", manager: "Gestor de tráfego", viewer: "Visualização",
};
const ROLE_COLORS: Record<CompanyRole, string> = { owner: "#8b5cf6", manager: "#10b981", viewer: "#64748b" };

function initialsOf(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

/**
 * Tela dedicada pós-login: aparece só quando o usuário pertence a 2+ empresas
 * e ainda não escolheu nesta sessão. Escolhe qual empresa abrir o dashboard.
 */
export function CompanySelectScreen({
  memberships, activeCompanyId, userName, onSelect, onSignOut,
}: {
  memberships: CompanyMembership[];
  activeCompanyId: string | null;
  userName?: string;
  onSelect: (companyId: string) => void;
  onSignOut: () => Promise<void> | void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10"
      style={{ background: "var(--dm-bg-base, #0C0C0C)" }}>
      <div className="w-full" style={{ maxWidth: 460 }}>
        {/* Header */}
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)" }}>
            <Building2 size={26} className="text-white" />
          </div>
          <h1 className="text-[22px] font-bold leading-tight"
            style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
            Escolha a empresa
          </h1>
          <p className="mt-1.5 text-[13px]" style={{ color: "var(--dm-text-tertiary)" }}>
            {userName ? `Olá, ${userName}. ` : ""}Você participa de {memberships.length} empresas — selecione qual dashboard abrir.
          </p>
        </div>

        {/* Lista de empresas */}
        <div className="flex flex-col gap-2.5">
          {memberships.map(({ company, role }) => {
            const active = company.id === activeCompanyId;
            return (
              <button
                key={company.id}
                type="button"
                onClick={() => onSelect(company.id)}
                className="group flex items-center gap-3.5 rounded-2xl border p-4 text-left transition-all hover:opacity-95 active:scale-[0.99]"
                style={{
                  background: "var(--dm-bg-surface)",
                  borderColor: active ? "#6366C8" : "var(--dm-border-default)",
                  boxShadow: active ? "0 0 0 3px rgba(99,102,200,0.15)" : "0 4px 16px rgba(0,0,0,0.08)",
                }}
              >
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl text-base font-bold text-white"
                  style={{ background: company.logoUrl ? "transparent" : "linear-gradient(135deg,#6366C8 0%,#313491 100%)" }}>
                  {company.logoUrl
                    ? <img src={company.logoUrl} alt={company.name} className="h-full w-full object-cover" />
                    : initialsOf(company.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold" style={{ color: "var(--dm-text-primary)" }}>
                    {company.name}
                  </p>
                  <span className="mt-0.5 inline-block text-[11px] font-bold uppercase tracking-wider"
                    style={{ color: ROLE_COLORS[role] }}>
                    {ROLE_LABELS[role]}
                  </span>
                </div>
                <ChevronRight size={18} className="flex-shrink-0 transition-transform group-hover:translate-x-0.5"
                  style={{ color: "var(--dm-text-tertiary)" }} />
              </button>
            );
          })}
        </div>

        {/* Logout */}
        <button
          type="button"
          onClick={() => void onSignOut()}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-[13px] font-semibold transition hover:bg-red-50 hover:border-red-300 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:border-red-800 dark:hover:text-red-400"
          style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}
        >
          <LogOut size={14} />
          Sair da conta
        </button>
      </div>
    </div>
  );
}
