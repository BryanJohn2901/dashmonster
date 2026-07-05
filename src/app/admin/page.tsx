"use client";

// ─── Rota /admin: Painel Admin full-screen do Monster Hub ─────────────────────
// Acesso: super admin OU senha do modo DEV (digitada aqui mesmo).
// Tudo que é gestão de plataforma (empresas, usuários, produtos, tokens Meta,
// contas de anúncio, Instagram, filtros, convites) vive aqui — o modal de
// Configurações do hub fica só com o essencial do usuário.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, ShieldCheck, Unlock, ArrowLeft } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { useDevMode } from "@/hooks/useDevMode";
import { AdminPanel } from "@/components/admin/AdminPanel";

export default function AdminPage() {
  const { isSuperAdmin, loading } = useCompany();
  const { active: devActive, enable } = useDevMode();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "var(--dm-bg-base)" }}>
        <Loader2 size={22} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} />
      </div>
    );
  }

  if (!isSuperAdmin && !devActive) return <AdminGate onUnlock={enable} />;

  return <AdminPanel />;
}

// ─── Portão de acesso: pede a senha DEV pra quem não é super admin ─────────────
function AdminGate({ onUnlock }: { onUnlock: (pw: string) => boolean }) {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);

  const submit = () => {
    if (!onUnlock(pw)) setErr(true);
  };

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 p-6" style={{ background: "var(--dm-bg-base)" }}>
      <div className="w-full max-w-[380px] rounded-2xl border p-7 text-center"
        style={{ background: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: "rgba(22,163,74,0.12)" }}>
          <ShieldCheck size={26} style={{ color: "#16A34A" }} />
        </div>
        <h1 className="text-lg font-bold" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
          Painel Admin
        </h1>
        <p className="mt-1 text-[12px]" style={{ color: "var(--dm-text-tertiary)" }}>
          Área restrita. Entre com poderes de admin ou digite a senha DEV.
        </p>

        <div className="mt-5 flex gap-2">
          <input
            type="password"
            value={pw}
            onChange={(e) => { setPw(e.target.value); setErr(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="Senha DEV"
            autoFocus
            className="h-11 min-w-0 flex-1 rounded-xl border px-3.5 text-[13px] outline-none"
            style={{ borderColor: err ? "#ef4444" : "var(--dm-border-default)", background: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}
          />
          <button type="button" onClick={submit} disabled={!pw.trim()}
            className="flex h-11 flex-shrink-0 items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
            style={{ background: "var(--dm-btn-primary-bg)" }}>
            <Unlock size={13} /> Entrar
          </button>
        </div>
        {err && <p className="mt-2 text-left text-[12px] font-medium" style={{ color: "#ef4444" }}>Senha incorreta.</p>}

        <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
          <Lock size={11} /> Super admins entram direto, sem senha.
        </p>
      </div>

      <button type="button" onClick={() => router.push("/")}
        className="flex items-center gap-1.5 text-[12px] font-semibold transition hover:opacity-75"
        style={{ color: "var(--dm-text-secondary)" }}>
        <ArrowLeft size={13} /> Voltar pro hub
      </button>
    </div>
  );
}
