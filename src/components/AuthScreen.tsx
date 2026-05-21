"use client";

import { FormEvent, useState } from "react";
import { Loader2 } from "lucide-react";
import { DashMonsterLogo } from "@/components/DashMonsterLogo";

interface AuthScreenProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (name: string, email: string, password: string) => Promise<void>;
  authError: string | null;
  supabaseReady: boolean;
}

const BRAND_GRAD = "linear-gradient(135deg, #6366C8 0%, #313491 100%)";

export function AuthScreen({ onSignIn, onSignUp, authError, supabaseReady }: AuthScreenProps) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [name,     setName]     = useState("");
  const [mode,     setMode]     = useState<"login" | "signup">("login");
  const [loading,  setLoading]  = useState(false);
  const [focused,  setFocused]  = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") await onSignIn(email, password);
      else                  await onSignUp(name, email, password);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      className="relative flex min-h-screen w-full overflow-hidden bg-white dark:bg-[#0b1437]"
      style={{ fontFamily: "var(--font-inter), 'DM Sans', sans-serif" }}
    >
      {/* ── LEFT — form column ────────────────────────────────────────── */}
      <div className="relative z-10 flex w-full flex-col justify-center px-8 py-12 sm:px-14 lg:max-w-[520px] lg:px-16">

        {/* Logo */}
        <div className="mb-10 flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[18px]"
            style={{ background: BRAND_GRAD, boxShadow: "0 4px 12px rgba(49,52,145,0.4)" }}
          >
            <DashMonsterLogo size={20} className="text-white" />
          </div>
          <span
            className="text-[18px] uppercase tracking-wide text-gray-900 dark:text-white"
            style={{ fontFamily: "var(--font-poppins), Poppins, sans-serif", fontWeight: 700 }}
          >
            Dash<span style={{ fontWeight: 400 }}>Monster</span>
          </span>
        </div>

        {/* Heading */}
        <h2
          className="mb-1.5 text-[32px] font-bold text-gray-900 dark:text-white"
          style={{ fontFamily: "var(--font-poppins), Poppins, sans-serif" }}
        >
          {mode === "login" ? "Sign In" : "Criar Conta"}
        </h2>
        <p className="mb-8 text-[15px]" style={{ color: "#A3AED0" }}>
          {mode === "login"
            ? "Entre com seu e-mail e senha para acessar!"
            : "Crie sua conta para acessar o painel."}
        </p>

        {/* Dev warning */}
        {!supabaseReady && (
          <div className="mb-5 rounded-2xl border border-amber-200/50 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
            <strong>Modo Dev:</strong> Configure{" "}
            <code className="rounded bg-amber-500/20 px-1 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
            para ativar o login real.
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">

          {mode === "signup" && (
            <Field
              id="name" label="Nome" type="text"
              placeholder="Seu nome completo"
              value={name} onChange={setName}
              focused={focused} setFocused={setFocused}
            />
          )}

          <Field
            id="email" label="Email" type="email"
            placeholder="nome@ptadigital.com.br"
            value={email} onChange={setEmail}
            focused={focused} setFocused={setFocused}
          />

          <Field
            id="password" label="Senha" type="password"
            placeholder="Mín. 6 caracteres"
            value={password} onChange={setPassword}
            focused={focused} setFocused={setFocused}
            minLength={6}
          />

          {authError && (
            <div className="rounded-2xl border border-red-200/40 bg-red-500/10 p-3 text-center text-sm font-medium text-red-600 dark:text-red-400">
              {authError}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !supabaseReady}
            className="mt-1 flex w-full items-center justify-center gap-2 text-[15px] font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              padding: "13px",
              borderRadius: 14,
              background: BRAND_GRAD,
              boxShadow: "0 4px 18px rgba(49,52,145,0.38)",
              letterSpacing: "0.01em",
            }}
          >
            {loading
              ? <><Loader2 size={18} className="animate-spin" /> Entrando…</>
              : mode === "login" ? "Sign In" : "Criar Conta"
            }
          </button>
        </form>

        {/* Switch mode */}
        <p className="mt-5 text-center text-[13px]" style={{ color: "#A3AED0" }}>
          {mode === "login" ? "Não tem conta? " : "Já tem conta? "}
          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="font-semibold transition hover:underline"
            style={{ color: "#313491" }}
          >
            {mode === "login" ? "Criar conta" : "Entrar"}
          </button>
        </p>
      </div>

      {/* ── RIGHT — gradient panel (Horizon auth: `rounded-bl-[120px]`) ── */}
      <div
        className="absolute right-0 top-0 bottom-0 hidden overflow-hidden lg:block"
        style={{ width: "49%", borderBottomLeftRadius: 120 }}
      >
        <div
          className="relative flex h-full w-full flex-col items-center justify-center p-12"
          style={{ background: "linear-gradient(160deg, #0B1437 0%, #1a1b5c 40%, #313491 80%, #6366C8 100%)" }}
        >
          {/* Orb decorations */}
          <div className="absolute right-[10%] top-[15%] h-48 w-48 rounded-full"
            style={{ background: "rgba(255,255,255,0.07)" }} />
          <div className="absolute bottom-[20%] left-[5%] h-36 w-36 rounded-full"
            style={{ background: "rgba(255,255,255,0.04)" }} />
          <div className="absolute left-[30%] top-[8%] h-24 w-24 rounded-full"
            style={{ background: "rgba(255,255,255,0.05)" }} />

          <div className="relative z-10 text-center">
            <div className="mx-auto mb-5 text-[52px]">👾</div>
            <h3
              className="mb-2 text-[26px] font-bold text-white"
              style={{ fontFamily: "var(--font-poppins), Poppins, sans-serif" }}
            >
              DashMonster
            </h3>
            <p
              className="mx-auto mb-10 max-w-[280px] text-[14px] leading-relaxed"
              style={{ color: "rgba(255,255,255,0.72)" }}
            >
              Plataforma de análise de lançamentos e campanhas da Personal Trainer Academy
            </p>

            {/* Stats pills */}
            <div className="flex flex-wrap justify-center gap-4">
              {[
                ["6",        "Lançamentos"],
                ["R$ 413k",  "Faturado"],
                ["4.215",    "Vendas"],
              ].map(([v, l]) => (
                <div
                  key={l}
                  className="rounded-2xl px-5 py-3 text-center"
                  style={{ background: "rgba(255,255,255,0.14)", backdropFilter: "blur(8px)" }}
                >
                  <div className="text-[18px] font-bold text-white">{v}</div>
                  <div className="mt-0.5 text-[11px]" style={{ color: "rgba(255,255,255,0.72)" }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

/* ── Input Field helper ───────────────────────────────────────────────────── */

interface FieldProps {
  id: string; label: string; type: string; placeholder: string;
  value: string; onChange: (v: string) => void;
  focused: string | null; setFocused: (v: string | null) => void;
  minLength?: number;
}

function Field({ id, label, type, placeholder, value, onChange, focused, setFocused, minLength }: FieldProps) {
  const isActive = focused === id;
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[13px] font-bold text-gray-800 dark:text-white"
      >
        {label}*
      </label>
      <input
        id={id} type={type} placeholder={placeholder}
        value={value} required minLength={minLength}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(id)}
        onBlur={() => setFocused(null)}
        className="w-full bg-[#F4F7FE] text-gray-900 dark:bg-[#0F1020] dark:text-white"
        style={{
          padding: "12px 16px",
          borderRadius: 14,
          border: `2px solid ${isActive ? "#313491" : "#E9EDF7"}`,
          fontSize: 14,
          fontFamily: "inherit",
          outline: "none",
          transition: "border-color 0.15s",
        }}
      />
    </div>
  );
}
