"use client";

import { FormEvent, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { DashMonsterLogo } from "@/components/DashMonsterLogo";

type OAuthProvider = "google" | "github" | "discord";

interface AuthScreenProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (name: string, email: string, password: string) => Promise<void>;
  onOAuth?: (provider: OAuthProvider) => Promise<void>;
  authError: string | null;
  supabaseReady: boolean;
}

// Paleta Monster Hub: ink escuro esverdeado + lime (ação) + neutros.
const INK       = "#0E1108";
const PANEL      = "#15180F";   // painel do form (direita)
const INK_SOFT   = "#1B1F15";
const LIME        = "#B6F500";
const GREEN_BTN   = "#A8DCA0";
const TXT         = "#F4F7F0";
const MUTED       = "#9AA388";
const HAIR        = "rgba(255,255,255,0.10)";
const FIELD_BG    = "rgba(255,255,255,0.045)";

const SLIDES = [
  { caption: "Vigiando seus números, sem piscar." },
  { caption: "Cada métrica crescendo em tempo real." },
  { caption: "Todas as suas fontes, num só hub." },
];

export function AuthScreen({ onSignIn, onSignUp, onOAuth, authError, supabaseReady }: AuthScreenProps) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [first,    setFirst]    = useState("");
  const [last,     setLast]     = useState("");
  const [mode,     setMode]     = useState<"login" | "signup">("login");
  const [agree,    setAgree]    = useState(false);
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [busy,     setBusy]     = useState<OAuthProvider | null>(null);
  const [focused,  setFocused]  = useState<string | null>(null);
  const [slide,    setSlide]    = useState(0);

  // Carrossel automático
  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 5000);
    return () => clearInterval(t);
  }, []);

  const isSignup = mode === "signup";

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignup) await onSignUp(`${first} ${last}`.trim(), email, password);
      else          await onSignIn(email, password);
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: OAuthProvider) => {
    if (!onOAuth || !supabaseReady) return;
    setBusy(provider);
    try { await onOAuth(provider); }
    finally { setBusy(null); }
  };

  return (
    <main
      className="relative flex min-h-screen w-full items-center justify-center overflow-hidden p-4 sm:p-8"
      style={{
        fontFamily: "var(--font-inter), 'DM Sans', sans-serif",
        background: "radial-gradient(120% 120% at 50% 0%, #20251A 0%, #14170F 55%, #0B0D08 100%)",
      }}
    >
      {/* ── CARD CENTRAL ──────────────────────────────────────────────── */}
      <div
        className="relative grid w-full max-w-[1060px] grid-cols-1 gap-0 overflow-hidden rounded-[28px] p-3 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)] lg:grid-cols-2"
        style={{ background: PANEL, border: `1px solid ${HAIR}` }}
      >
        {/* ── ESQUERDA — cena animada (carrossel) ─────────────────────── */}
        <div className="relative hidden min-h-[600px] overflow-hidden rounded-[20px] lg:block" style={{ background: INK }}>
          {/* Slides */}
          <SceneRadar  active={slide === 0} />
          <SceneMetrics active={slide === 1} />
          <SceneGalaxy active={slide === 2} />

          {/* Topo: marca + voltar */}
          <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between p-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: LIME }}>
                <DashMonsterLogo size={16} className="text-[#0E1108] dark:!text-[#0E1108]" />
              </div>
              <span className="text-[15px] font-semibold tracking-tight" style={{ color: TXT }}>Monster Hub</span>
            </div>
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium backdrop-blur-md transition hover:bg-white/15"
              style={{ background: "rgba(255,255,255,0.10)", color: TXT, border: `1px solid ${HAIR}` }}
            >
              Voltar ao site <ArrowRight size={13} />
            </Link>
          </div>

          {/* Base: legenda + dots */}
          <div className="absolute inset-x-0 bottom-0 z-20 p-7">
            <p className="mb-4 max-w-[300px] text-[22px] font-semibold leading-snug tracking-tight" style={{ color: TXT }}>
              {SLIDES[slide].caption}
            </p>
            <div className="flex items-center gap-2">
              {SLIDES.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Cena ${i + 1}`}
                  onClick={() => setSlide(i)}
                  className="h-1.5 rounded-full transition-all"
                  style={{ width: i === slide ? 28 : 10, background: i === slide ? LIME : "rgba(255,255,255,0.35)" }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── DIREITA — formulário ────────────────────────────────────── */}
        <div className="flex flex-col justify-center px-6 py-10 sm:px-12">
          <div className="mx-auto w-full max-w-[400px]">
            <h1 className="text-[32px] font-semibold tracking-tight sm:text-[36px]" style={{ color: TXT }}>
              {isSignup ? "Criar conta" : "Bem-vindo de volta"}
            </h1>
            <p className="mt-2 text-[14px]" style={{ color: MUTED }}>
              {isSignup ? "Já tem uma conta?" : "Ainda não tem conta?"}{" "}
              <button
                type="button"
                onClick={() => setMode(isSignup ? "login" : "signup")}
                className="font-semibold underline underline-offset-2 transition hover:opacity-80"
                style={{ color: TXT }}
              >
                {isSignup ? "Entrar" : "Criar conta"}
              </button>
            </p>

            {!supabaseReady && (
              <div className="mt-5 rounded-xl border p-3 text-xs" style={{ borderColor: "rgba(212,167,44,0.35)", background: "rgba(212,167,44,0.10)", color: "#E8C66A" }}>
                <strong>Modo Dev:</strong> configure <code className="rounded bg-black/30 px-1 py-0.5">NEXT_PUBLIC_SUPABASE_URL</code> para ativar o login real.
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-7 space-y-3">
              {isSignup && (
                <div className="grid grid-cols-2 gap-3">
                  <Field id="first" placeholder="Nome" type="text" value={first} onChange={setFirst} focused={focused} setFocused={setFocused} />
                  <Field id="last"  placeholder="Sobrenome" type="text" value={last} onChange={setLast} focused={focused} setFocused={setFocused} />
                </div>
              )}

              <Field id="email" placeholder="Email" type="email" value={email} onChange={setEmail} focused={focused} setFocused={setFocused} />

              <Field
                id="password" placeholder="Sua senha" type={showPw ? "text" : "password"}
                value={password} onChange={setPassword} focused={focused} setFocused={setFocused} minLength={6}
                trailing={
                  <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Ocultar senha" : "Mostrar senha"}
                    className="grid h-full place-items-center px-1 transition hover:opacity-80" style={{ color: MUTED }}>
                    {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                }
              />

              {isSignup && (
                <label className="flex cursor-pointer items-center gap-2.5 pt-1 text-[13px]" style={{ color: MUTED }}>
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="peer sr-only" />
                  <span
                    className="grid h-[18px] w-[18px] place-items-center rounded-[5px] transition"
                    style={{ background: agree ? LIME : "transparent", border: `1.5px solid ${agree ? LIME : "rgba(255,255,255,0.3)"}` }}
                  >
                    {agree && (
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.2l2.2 2.2 4.8-5" stroke="#0E1108" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    )}
                  </span>
                  Concordo com os <span className="font-medium underline underline-offset-2" style={{ color: TXT }}>Termos &amp; Condições</span>
                </label>
              )}

              {authError && (
                <div className="rounded-xl border p-2.5 text-center text-xs font-medium"
                  style={{ borderColor: "rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.10)", color: "#FCA5A5" }}>
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !supabaseReady || (isSignup && !agree)}
                className="mt-1 flex w-full items-center justify-center gap-2 text-[14px] font-semibold transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ padding: "12px", borderRadius: 11, background: GREEN_BTN, color: INK }}
              >
                {loading
                  ? <><Loader2 size={17} className="animate-spin" /> {isSignup ? "Criando…" : "Entrando…"}</>
                  : (isSignup ? "Criar conta" : "Continuar")}
              </button>
            </form>

            {/* Divisor */}
            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1" style={{ background: HAIR }} />
              <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: MUTED }}>ou {isSignup ? "registre" : "entre"} com</span>
              <span className="h-px flex-1" style={{ background: HAIR }} />
            </div>

            {/* Social */}
            <div className="grid grid-cols-3 gap-2.5">
              <OAuthButton label="Google"  busy={busy === "google"}  disabled={!supabaseReady || busy !== null} onClick={() => handleOAuth("google")}><GoogleIcon /></OAuthButton>
              <OAuthButton label="GitHub"  busy={busy === "github"}  disabled={!supabaseReady || busy !== null} onClick={() => handleOAuth("github")}><GitHubIcon /></OAuthButton>
              <OAuthButton label="Discord" busy={busy === "discord"} disabled={!supabaseReady || busy !== null} onClick={() => handleOAuth("discord")}><DiscordIcon /></OAuthButton>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

/* ── Cenas animadas (carrossel) ─────────────────────────────────────────────── */

function SceneWrap({ active, bg, children }: { active: boolean; bg: string; children: ReactNode }) {
  return (
    <div
      className="absolute inset-0 transition-opacity duration-700 ease-out"
      style={{ opacity: active ? 1 : 0, background: bg, pointerEvents: active ? "auto" : "none" }}
    >
      {/* grade sutil */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)", backgroundSize: "34px 34px" }}
      />
      {/* escurece base p/ legenda */}
      <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(180deg, transparent 45%, rgba(8,10,6,0.85) 100%)" }} />
      {children}
    </div>
  );
}

function SceneRadar({ active }: { active: boolean }) {
  return (
    <SceneWrap active={active} bg="radial-gradient(90% 80% at 50% 38%, #15200F 0%, #0C120A 60%, #0A0D07 100%)">
      <div className="absolute left-1/2 top-[40%] h-[320px] w-[320px] -translate-x-1/2 -translate-y-1/2">
        {/* anéis pulsando */}
        {[0, 1, 2].map((i) => (
          <span key={i} className="absolute inset-0 rounded-full" style={{ border: "1px solid rgba(182,245,0,0.35)", animation: `dm-ring-pulse 3s ease-out ${i * 1}s infinite` }} />
        ))}
        {/* anéis fixos */}
        <span className="absolute inset-[18%] rounded-full" style={{ border: "1px solid rgba(255,255,255,0.08)" }} />
        <span className="absolute inset-[36%] rounded-full" style={{ border: "1px solid rgba(255,255,255,0.08)" }} />
        {/* sweep */}
        <div className="absolute inset-0 rounded-full" style={{ background: "conic-gradient(from 0deg, rgba(182,245,0,0.32) 0deg, rgba(182,245,0,0.04) 45deg, transparent 90deg)", animation: "dm-radar-spin 4s linear infinite" }} />
        {/* eixos */}
        <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2" style={{ background: "rgba(255,255,255,0.10)" }} />
        <span className="absolute top-1/2 left-0 w-full h-px -translate-y-1/2" style={{ background: "rgba(255,255,255,0.10)" }} />
        {/* blips */}
        {[[28,32],[70,55],[48,72],[62,22]].map(([x,y],i)=>(
          <span key={i} className="absolute h-2 w-2 rounded-full" style={{ left: `${x}%`, top: `${y}%`, background: LIME, boxShadow: "0 0 10px rgba(182,245,0,0.8)", animation: `dm-blip 2.4s ease-in-out ${i * 0.5}s infinite` }} />
        ))}
      </div>
    </SceneWrap>
  );
}

function SceneMetrics({ active }: { active: boolean }) {
  const bars = [42, 64, 38, 80, 55, 92, 70];
  return (
    <SceneWrap active={active} bg="radial-gradient(90% 80% at 50% 35%, #182012 0%, #0C120A 60%, #0A0D07 100%)">
      {/* números flutuando */}
      <div className="absolute left-8 top-[24%] font-mono text-[26px] font-bold" style={{ color: LIME, animation: "dm-count-float 3.5s ease-in-out infinite" }}>8,08x</div>
      <div className="absolute right-10 top-[34%] font-mono text-[19px] font-semibold" style={{ color: TXT, animation: "dm-count-float 4s ease-in-out 0.6s infinite" }}>+312</div>
      <div className="absolute left-12 top-[46%] font-mono text-[17px] font-semibold" style={{ color: "#C7E8B0", animation: "dm-count-float 4.4s ease-in-out 1.1s infinite" }}>R$ 42k</div>

      {/* sparkline */}
      <svg className="absolute inset-x-0 top-[30%] h-[120px] w-full" viewBox="0 0 400 120" preserveAspectRatio="none">
        <path d="M0 95 L60 80 L120 88 L180 50 L240 62 L300 28 L400 12" fill="none" stroke={LIME} strokeWidth="2.5"
          strokeDasharray="700" strokeDashoffset="700" style={{ animation: active ? "dm-spark-draw 2.2s ease-out forwards" : "none" }} />
      </svg>

      {/* barras */}
      <div className="absolute inset-x-0 bottom-0 flex h-[46%] items-end justify-center gap-3 px-10 pb-[18%]">
        {bars.map((h, i) => (
          <div key={i} className="w-7 rounded-t-md" style={{
            height: `${h}%`,
            background: i % 3 === 1 ? LIME : "rgba(182,245,0,0.35)",
            transformOrigin: "bottom",
            animation: `dm-bar-grow ${2.6 + (i % 3) * 0.4}s ease-in-out ${i * 0.15}s infinite`,
          }} />
        ))}
      </div>
    </SceneWrap>
  );
}

function SceneGalaxy({ active }: { active: boolean }) {
  return (
    <SceneWrap active={active} bg={INK}>
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url(/galaxy.jpg)", animation: "dm-kenburns 12s ease-in-out infinite alternate" }} />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(14,17,8,0.30), rgba(14,17,8,0.20) 45%, rgba(8,10,6,0.85))" }} />
      {/* pontos orbitando um núcleo */}
      <div className="absolute left-1/2 top-[42%] h-[220px] w-[220px] -translate-x-1/2 -translate-y-1/2" style={{ animation: "dm-orbit 18s linear infinite" }}>
        <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full" style={{ background: LIME, boxShadow: "0 0 10px rgba(182,245,0,0.9)" }} />
        <span className="absolute bottom-0 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full" style={{ background: "#fff", opacity: 0.8 }} />
      </div>
      <div className="absolute left-1/2 top-[42%] h-[140px] w-[140px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ border: "1px dashed rgba(255,255,255,0.2)" }} />
    </SceneWrap>
  );
}

/* ── Botão de login social ──────────────────────────────────────────────────── */

function OAuthButton({ children, label, busy, disabled, onClick }: {
  children: ReactNode; label: string; busy: boolean; disabled: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      aria-label={`Entrar com ${label}`} title={`Entrar com ${label}`}
      className="flex h-11 items-center justify-center rounded-xl transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
      style={{ background: FIELD_BG, border: `1px solid ${HAIR}` }}
    >
      {busy ? <Loader2 size={17} className="animate-spin" style={{ color: TXT }} /> : children}
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.6l-6.5 5C9.6 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.3 5.3C41.6 35.9 44 30.4 44 24c0-1.3-.1-2.3-.4-3.5z"/>
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#F4F7F0" aria-hidden>
      <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17 4.6 18 4.9 18 4.9c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z"/>
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="#8C9EFF" aria-hidden>
      <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.5c1.7.4 2.6.9 3.5 1.5a13.3 13.3 0 0 0-10-.4c-.3.1-.5.2-.8.3.9-.6 1.9-1.1 3.5-1.4L11.2 3a19.8 19.8 0 0 0-4.9 1.4C3.2 9 2.3 13.5 2.7 17.9a19.9 19.9 0 0 0 6 3l.7-1.1c-.7-.3-1.4-.6-2.1-1l.5-.4c4 1.9 8.3 1.9 12.2 0l.5.4c-.7.4-1.4.7-2.1 1l.7 1.1a19.9 19.9 0 0 0 6-3c.5-5.1-.9-9.6-3.6-13.5zM8.9 15.3c-1.2 0-2.1-1.1-2.1-2.4S7.7 10.5 8.9 10.5 11 11.6 11 12.9s-.9 2.4-2.1 2.4zm6.2 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4z"/>
    </svg>
  );
}

/* ── Input Field ─────────────────────────────────────────────────────────────── */

interface FieldProps {
  id: string; placeholder: string; type: string;
  value: string; onChange: (v: string) => void;
  focused: string | null; setFocused: (v: string | null) => void;
  minLength?: number; trailing?: ReactNode;
}

function Field({ id, placeholder, type, value, onChange, focused, setFocused, minLength, trailing }: FieldProps) {
  const isActive = focused === id;
  return (
    <div
      className="flex items-center"
      style={{
        borderRadius: 11,
        background: FIELD_BG,
        border: `1px solid ${isActive ? LIME : "rgba(255,255,255,0.12)"}`,
        transition: "border-color 0.15s",
      }}
    >
      <input
        id={id} type={type} placeholder={placeholder}
        value={value} required minLength={minLength}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(id)}
        onBlur={() => setFocused(null)}
        className="w-full bg-transparent"
        style={{ padding: "12px 14px", fontSize: 14, color: TXT, fontFamily: "inherit", outline: "none" }}
      />
      {trailing}
    </div>
  );
}
