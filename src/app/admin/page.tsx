"use client";

// ─── Rota /admin: Painel Admin full-screen do Monster Hub ─────────────────────
// Acesso: super admin OU senha do modo DEV (digitada aqui mesmo).
// Tudo que é gestão de plataforma (empresas, usuários, produtos, tokens Meta,
// contas de anúncio, Instagram, filtros, convites) vive aqui — o modal de
// Configurações do hub fica só com o essencial do usuário.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, ShieldCheck, Unlock, ArrowLeft, KeyRound } from "lucide-react";
import { useCompany, refreshCompany } from "@/hooks/useCompany";
import { useDevMode } from "@/hooks/useDevMode";
import { activateSuperAdmin } from "@/lib/adminAudit";
import { toast } from "@/hooks/useToast";
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

        <SuperAdminActivation />
      </div>

      <button type="button" onClick={() => router.push("/")}
        className="flex items-center gap-1.5 text-[12px] font-semibold transition hover:opacity-75"
        style={{ color: "var(--dm-text-secondary)" }}>
        <ArrowLeft size={13} /> Voltar pro hub
      </button>
    </div>
  );
}

// ─── Ativação de super admin (senha mestra do servidor) ────────────────────────
// A senha vive na env SUPER_ADMIN_ACTIVATION_PASSWORD (nunca no client). Quem
// acerta entra em app_admins — vira super admin de verdade, permanente, com as
// RLS do banco valendo. Precisa estar logado no hub.
function SuperAdminActivation() {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  const activate = async () => {
    setBusy(true);
    try {
      await activateSuperAdmin(pw);
      toast.success("Super admin ativado. Bem-vindo ao painel.");
      await refreshCompany(); // isSuperAdmin vira true → AdminPage renderiza o painel
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao ativar.");
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--dm-border-default)" }}>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)}
          className="mx-auto flex items-center gap-1.5 text-[11.5px] font-semibold transition hover:opacity-75"
          style={{ color: "var(--dm-text-tertiary)" }}>
          <KeyRound size={12} /> Tenho a senha mestra — ativar super admin
        </button>
      ) : (
        <div>
          <p className="mb-2 text-left text-[11.5px] leading-relaxed" style={{ color: "var(--dm-text-tertiary)" }}>
            Senha mestra do servidor (<code>SUPER_ADMIN_ACTIVATION_PASSWORD</code>). Acertou → sua conta
            vira <b>super admin permanente</b>.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && pw.trim()) void activate(); }}
              placeholder="Senha mestra"
              autoFocus
              className="h-11 min-w-0 flex-1 rounded-xl border px-3.5 text-[13px] outline-none"
              style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}
            />
            <button type="button" onClick={() => void activate()} disabled={!pw.trim() || busy}
              className="flex h-11 flex-shrink-0 items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
              style={{ background: "#16A34A" }}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Ativar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
