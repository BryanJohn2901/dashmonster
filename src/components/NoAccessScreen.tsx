"use client";

import { ShieldAlert, LogOut } from "lucide-react";

/**
 * Acesso só por convite. Aparece quando o usuário autenticou mas não pertence
 * a nenhuma empresa e não tem convite pendente (e não é super admin). Barra o
 * acesso e oferece sair — cobre login E cadastro (o signup também cai aqui).
 */
export function NoAccessScreen({ email, onSignOut }: {
  email?: string;
  onSignOut: () => Promise<void> | void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10"
      style={{ background: "var(--dm-bg-page)" }}>
      <div className="w-full max-w-[420px] text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: "var(--dm-error-bg)", border: "1px solid var(--dm-error-border)" }}>
          <ShieldAlert size={26} style={{ color: "var(--dm-error-base)" }} />
        </div>

        <h1 className="text-[22px] font-bold leading-tight"
          style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
          Acesso restrito a convidados
        </h1>
        <p className="mx-auto mt-2 max-w-[360px] text-[14px] leading-relaxed" style={{ color: "var(--dm-text-secondary)" }}>
          {email ? <>A conta <strong style={{ color: "var(--dm-text-primary)" }}>{email}</strong> não está</> : "Sua conta não está"}{" "}
          vinculada a nenhuma empresa e não tem convites pendentes. O DashMonster é acessível apenas por convite —
          peça a um administrador da sua empresa para te convidar.
        </p>

        <button
          type="button"
          onClick={() => void onSignOut()}
          className="mx-auto mt-7 flex items-center justify-center gap-2 rounded-xl border px-5 py-2.5 text-[13px] font-semibold transition hover:opacity-80"
          style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)", background: "var(--dm-bg-surface)" }}
        >
          <LogOut size={15} />
          Sair
        </button>
      </div>
    </div>
  );
}
