"use client";

// ─── Tela de redefinição de senha ──────────────────────────────────────────────
// Chegada via link de e-mail (Supabase resetPasswordForEmail → redirectTo=/reset-password).
// O client Supabase troca o token da URL por uma sessão sozinho (detectSessionInUrl,
// default true) — aqui só esperamos o evento PASSWORD_RECOVERY (ou sessão já ativa)
// antes de liberar o formulário. Mesma linguagem visual da AuthScreen.

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react";
import { DashMonsterLogo } from "@/components/DashMonsterLogo";
import { supabaseClient } from "@/lib/supabase";

const INK     = "#0E1108";
const PANEL   = "#15180F";
const LIME    = "#B6F500";
const GREEN_BTN = "#A8DCA0";
const TXT     = "#F4F7F0";
const MUTED   = "#9AA388";
const HAIR    = "rgba(255,255,255,0.10)";
const FIELD_BG = "rgba(255,255,255,0.045)";

type Status = "checking" | "ready" | "invalid" | "done";

export function ResetPasswordScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(supabaseClient ? "checking" : "invalid");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!supabaseClient) return;
    let settled = false;

    // Já tem sessão (ex.: reload da página após o token já ter sido trocado).
    void supabaseClient.auth.getSession().then(({ data }) => {
      if (!settled && data.session) { settled = true; setStatus("ready"); }
    });

    // Evento disparado quando o client troca o token de recuperação da URL.
    const { data: sub } = supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        settled = true;
        setStatus("ready");
      }
    });

    // Link inválido/expirado nunca dispara sessão — desiste depois de um tempo curto.
    const timeout = setTimeout(() => { if (!settled) setStatus("invalid"); }, 4000);

    return () => { sub.subscription.unsubscribe(); clearTimeout(timeout); };
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) { setError("A senha precisa ter pelo menos 6 caracteres."); return; }
    if (password !== confirm) { setError("As senhas não coincidem."); return; }
    setSaving(true);
    try {
      const { error: updateError } = await supabaseClient!.auth.updateUser({ password });
      if (updateError) { setError(updateError.message); return; }
      setStatus("done");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main
      className="relative flex min-h-screen w-full items-center justify-center overflow-hidden p-4 sm:p-8"
      style={{
        fontFamily: "var(--font-inter), 'DM Sans', sans-serif",
        background: "radial-gradient(120% 120% at 50% 0%, #20251A 0%, #14170F 55%, #0B0D08 100%)",
      }}
    >
      <div
        className="relative w-full max-w-[420px] overflow-hidden rounded-[28px] p-8 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)]"
        style={{ background: PANEL, border: `1px solid ${HAIR}` }}
      >
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: LIME }}>
            <DashMonsterLogo size={16} className="text-[#0E1108] dark:!text-[#0E1108]" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight" style={{ color: TXT }}>Monster Hub</span>
        </div>

        {status === "checking" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Loader2 size={22} className="animate-spin" style={{ color: LIME }} />
            <p className="text-[13.5px]" style={{ color: MUTED }}>Validando o link de redefinição…</p>
          </div>
        )}

        {status === "invalid" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <ShieldAlert size={28} style={{ color: "#FCA5A5" }} />
            <h1 className="text-[20px] font-semibold" style={{ color: TXT }}>Link inválido ou expirado</h1>
            <p className="text-[13.5px] leading-relaxed" style={{ color: MUTED }}>
              Peça um novo link de redefinição na tela de login — links de recuperação valem por tempo limitado.
            </p>
            <button type="button" onClick={() => router.push("/")}
              className="mt-2 w-full text-[14px] font-semibold transition-all hover:brightness-105"
              style={{ padding: "12px", borderRadius: 11, background: GREEN_BTN, color: INK }}>
              Voltar para o login
            </button>
          </div>
        )}

        {status === "done" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 size={28} style={{ color: LIME }} />
            <h1 className="text-[20px] font-semibold" style={{ color: TXT }}>Senha atualizada</h1>
            <p className="text-[13.5px] leading-relaxed" style={{ color: MUTED }}>
              Sua senha foi redefinida com sucesso. Você já está logado.
            </p>
            <button type="button" onClick={() => router.push("/")}
              className="mt-2 w-full text-[14px] font-semibold transition-all hover:brightness-105"
              style={{ padding: "12px", borderRadius: 11, background: GREEN_BTN, color: INK }}>
              Ir para o Monster Hub
            </button>
          </div>
        )}

        {status === "ready" && (
          <>
            <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: TXT }}>Crie uma nova senha</h1>
            <p className="mt-1.5 text-[13.5px]" style={{ color: MUTED }}>Escolha uma senha forte para sua conta.</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-3">
              <PwField id="password" placeholder="Nova senha" value={password} onChange={setPassword} showPw={showPw} setShowPw={setShowPw} />
              <PwField id="confirm" placeholder="Confirme a nova senha" value={confirm} onChange={setConfirm} showPw={showPw} setShowPw={setShowPw} />

              {error && (
                <div className="rounded-xl border p-2.5 text-center text-xs font-medium"
                  style={{ borderColor: "rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.10)", color: "#FCA5A5" }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={saving}
                className="mt-1 flex w-full items-center justify-center gap-2 text-[14px] font-semibold transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ padding: "12px", borderRadius: 11, background: GREEN_BTN, color: INK }}>
                {saving ? <><Loader2 size={17} className="animate-spin" /> Salvando…</> : "Salvar nova senha"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

function PwField({ id, placeholder, value, onChange, showPw, setShowPw }: {
  id: string; placeholder: string; value: string; onChange: (v: string) => void;
  showPw: boolean; setShowPw: (v: boolean) => void;
}) {
  const [active, setActive] = useState(false);
  return (
    <div className="flex items-center" style={{ borderRadius: 11, background: FIELD_BG, border: `1px solid ${active ? LIME : "rgba(255,255,255,0.12)"}`, transition: "border-color 0.15s" }}>
      <input
        id={id} type={showPw ? "text" : "password"} placeholder={placeholder}
        value={value} required minLength={6}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setActive(true)} onBlur={() => setActive(false)}
        className="w-full bg-transparent" style={{ padding: "12px 14px", fontSize: 14, color: TXT, fontFamily: "inherit", outline: "none" }}
      />
      <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? "Ocultar senha" : "Mostrar senha"}
        className="grid h-full place-items-center px-3 transition hover:opacity-80" style={{ color: MUTED }}>
        {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}
