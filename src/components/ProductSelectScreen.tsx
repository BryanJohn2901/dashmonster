"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { ArrowRight, Building2, ChevronDown, LogOut, Settings, Sun, Moon } from "lucide-react";
import { DashMonsterLogo } from "@/components/DashMonsterLogo";
import { HubSettings } from "@/components/hub/HubSettings";
import type { UserCategory } from "@/types/userConfig";
import { PRODUCTS, canOpenProduct } from "@/config/products";

interface ProductSelectScreenProps {
  userName: string;
  email?: string;
  companyName?: string;
  onOpenDash: () => void;
  onSignOut?: () => void;
  onUpdateProfile?: (name: string) => Promise<void>;
  categories?: UserCategory[];
  /** Produtos contratados pela empresa ativa (ex.: ["dash","pipe"]). */
  products?: string[];
}

// Estruturais usam tokens dm-* (viram com .dark sozinhos) → hub fica black/white.
// Marca (lime/ink/violet/green) é constante nos dois temas.
const C = {
  page: "var(--dm-bg-page)", surface: "var(--dm-bg-surface)", border: "var(--dm-border-default)", subtle: "var(--dm-bg-elevated)",
  tp: "var(--dm-text-primary)", ts: "var(--dm-text-secondary)", tm: "var(--dm-text-tertiary)",
  lime: "#B6F500", ink: "#0E1108", inkSoft: "#191D14",
  green: "#16A34A", violet: "#16A34A", violetT: "rgba(22,163,74,0.12)",
};

const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);

/** Progresso 0→1 quando `active`; estático em 1 quando inativo (dado final). */
function useHoverProgress(active: boolean, duration = 850): number {
  const [p, setP] = useState(1);
  const raf = useRef(0);
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    if (!active) { setP(1); return; }
    let start = 0;
    setP(0);
    const tick = (ts: number) => {
      if (!start) start = ts;
      const k = Math.min(1, (ts - start) / duration);
      setP(k);
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [active, duration]);
  return p;
}

export function ProductSelectScreen({ userName, email, companyName, onOpenDash, onSignOut, onUpdateProfile, categories, products = ["dash"] }: ProductSelectScreenProps) {
  const hasDash = products.includes("dash");
  const first = (userName || "").trim().split(" ").filter(Boolean)[0] || "de volta";
  const initials = (userName || "U").trim().split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "U";
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <div className="flex min-h-screen w-full flex-col" style={{ background: C.page, fontFamily: "var(--font-inter), 'DM Sans', sans-serif" }}>
      {/* Topbar */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: C.lime }}>
            <DashMonsterLogo size={17} className="text-[#0E1108] dark:!text-[#0E1108]" />
          </div>
          <span className="text-sm font-semibold tracking-tight" style={{ color: C.tp }}>Monster Hub</span>
        </div>

        <div className="flex items-center gap-2">
        {/* Toggle de tema (black/white) */}
        <button
          type="button"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          aria-label={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
          className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
          style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.ts }}
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* Avatar → gaveta de conta */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-2.5 transition hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: C.violet }}>{initials}</span>
            <span className="text-sm font-medium" style={{ color: C.tp }}>{first}</span>
            <ChevronDown size={15} style={{ color: C.tm, transform: menuOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl p-2"
                style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: "0 12px 32px rgba(16,24,40,.16)" }}>
                {/* Conta */}
                <div className="flex items-center gap-3 px-2.5 py-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-semibold text-white" style={{ background: C.violet }}>{initials}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" style={{ color: C.tp }}>{userName || first}</p>
                    {email && <p className="truncate text-xs" style={{ color: C.tm }}>{email}</p>}
                  </div>
                </div>

                <div className="my-1.5 h-px" style={{ background: C.subtle }} />

                {companyName && (
                  <div className="flex items-center gap-2.5 px-2.5 py-2">
                    <Building2 size={15} style={{ color: C.tm }} />
                    <div className="min-w-0">
                      <p className="text-[11px]" style={{ color: C.tm }}>Empresa</p>
                      <p className="truncate text-sm font-medium" style={{ color: C.tp }}>{companyName}</p>
                    </div>
                  </div>
                )}

                <MenuRow icon={Settings} label="Configurações" onClick={() => { setMenuOpen(false); setSettingsOpen(true); }} />

                <div className="my-1.5 h-px" style={{ background: C.subtle }} />

                {/* Produtos ativos — data-driven pelo entitlement da empresa */}
                <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.tm }}>Produtos ativos</p>
                {PRODUCTS.map((p) => {
                  const soon = p.status === "soon";
                  const owned = products.includes(p.id);
                  // live + não contratado: não aparece. soon: teaser p/ todos.
                  if (!soon && !owned) return null;
                  const openable = canOpenProduct(p, products);
                  return (
                    <div key={p.id} className="flex items-center justify-between px-2.5 py-1.5">
                      <span className="text-sm" style={{ color: openable ? C.tp : C.ts }}>{p.name}</span>
                      {soon ? (
                        <span className="text-xs font-medium" style={{ color: C.tm }}>Em breve</span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: C.green }}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: C.green }} /> Ativo
                        </span>
                      )}
                    </div>
                  );
                })}

                <div className="my-1.5 h-px" style={{ background: C.subtle }} />

                {onSignOut && (
                  <button type="button" onClick={onSignOut}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors hover:bg-red-50"
                    style={{ color: "#DC2626" }}>
                    <LogOut size={15} /> Sair da conta
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        </div>
      </header>

      {/* Centro — verticalmente centralizado */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-10">
        <div className="mb-9 text-center">
          <h1 className="mb-3 text-4xl font-semibold tracking-tight" style={{ color: C.tp }}>
            Bem-vindo de volta, {first}.
          </h1>
          <p className="text-base" style={{ color: C.ts }}>Escolha por onde começar.</p>
        </div>

        <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2">
          {/* PipeFlow: status "soon" → teaser p/ todos. DashMonster: só se contratado. */}
          <PipeCard />
          {hasDash && <DashCard onOpen={onOpenDash} />}
        </div>

        <p className="mt-8 text-center text-sm" style={{ color: C.tm }}>
          Dá pra trocar de produto a qualquer momento pelo menu.
        </p>
      </main>

      <HubSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        userName={userName}
        email={email ?? ""}
        onUpdateProfile={onUpdateProfile}
        onSignOut={onSignOut}
        categories={categories}
      />
    </div>
  );
}

/* ── Linha de menu ────────────────────────────────────────────────────────── */
function MenuRow({ icon: Icon, label, onClick }: { icon: typeof Settings; label: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors hover:bg-[#EEF0F3]"
      style={{ color: C.tp }}>
      <Icon size={15} style={{ color: C.ts }} /> {label}
    </button>
  );
}

/* ── Card meta (logo + nome + tag) — alturas idênticas nos dois ───────────── */
function CardMeta({ logo, name, tag, tagBg, tagText, desc, descColor }: {
  logo: ReactNode; name: string; tag: string; tagBg: string; tagText: string; desc: string; descColor: string;
}) {
  return (
    <>
      <div className="mb-2 flex h-7 items-center gap-2">
        {logo}
        <span className="text-lg font-semibold leading-none" style={{ color: name === "PipeFlow" ? "#fff" : C.tp }}>{name}</span>
        <span className="ml-1 rounded-md px-2 py-0.5 text-[11px] leading-none" style={{ background: tagBg, color: tagText }}>{tag}</span>
      </div>
      <p className="mb-6 min-h-[40px] text-sm leading-relaxed" style={{ color: descColor }}>{desc}</p>
    </>
  );
}

/* ── DashMonster card (animado) ───────────────────────────────────────────── */
function DashCard({ onOpen }: { onOpen: () => void }) {
  const [hover, setHover] = useState(false);
  const e = easeOut(useHoverProgress(hover));
  const roas = (8.08 * e).toFixed(2).replace(".", ",");
  const vendas = Math.round(425 * e).toLocaleString("pt-BR");
  const bars = [40, 55, 38, 70, 92, 61];
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="flex h-full flex-col rounded-3xl p-7 transition-shadow"
      style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: hover ? "0 16px 40px rgba(22,163,74,.16)" : "0 8px 24px rgba(16,24,40,.06)" }}
    >
      {/* Preview (altura fixa) */}
      <div className="mb-6 flex h-[150px] flex-col justify-between rounded-2xl p-4" style={{ background: C.page }}>
        <div className="flex gap-2">
          <div className="flex-1 rounded-lg px-3 py-2" style={{ background: C.surface }}>
            <div className="text-[10px]" style={{ color: C.tm }}>ROAS</div>
            <div className="text-sm font-semibold tabular-nums" style={{ color: C.green }}>{roas}x</div>
          </div>
          <div className="flex-1 rounded-lg px-3 py-2" style={{ background: C.surface }}>
            <div className="text-[10px]" style={{ color: C.tm }}>Vendas</div>
            <div className="text-sm font-semibold tabular-nums" style={{ color: C.tp }}>{vendas}</div>
          </div>
        </div>
        <div className="flex h-12 items-end gap-1.5">
          {bars.map((h, i) => (
            <div key={i} className="flex-1 rounded-sm" style={{ height: `${Math.max(4, h * e)}%`, background: i === 4 ? C.violet : C.green, opacity: i === 4 ? 1 : 0.85 }} />
          ))}
        </div>
      </div>

      <CardMeta
        logo={<span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: C.ink }}><DashMonsterLogo size={15} className="text-[#B6F500] dark:!text-[#B6F500]" /></span>}
        name="DashMonster" tag="Analytics · Meta Ads" tagBg={C.violetT} tagText={C.violet}
        desc="Tráfego pago, criativos e lançamentos — suas métricas em tempo real."
        descColor={C.ts}
      />
      <button type="button" onClick={onOpen}
        className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition hover:brightness-105"
        style={{ background: C.violet }}>
        Abrir DashMonster <ArrowRight size={16} />
      </button>
    </div>
  );
}

/* ── PipeFlow card (animado, placeholder) ─────────────────────────────────── */
function PipeCard() {
  const [hover, setHover] = useState(false);
  const e = easeOut(useHoverProgress(hover));
  const cols = [
    { l: "Novo", n: 8 }, { l: "Contato", n: 5 }, { l: "Proposta", n: 4 }, { l: "Fechado", n: 12, on: true },
  ];
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative flex h-full flex-col rounded-3xl p-7 transition-shadow"
      style={{ background: C.ink, boxShadow: hover ? "0 16px 40px rgba(14,17,8,.22)" : "0 8px 24px rgba(14,17,8,.12)" }}
    >
      <span className="absolute right-5 top-5 rounded-md px-2 py-0.5 text-[11px] font-semibold" style={{ background: "#22271A", color: "#9AA37C" }}>Em breve</span>

      {/* Preview (altura fixa) */}
      <div className="mb-6 flex h-[150px] items-end rounded-2xl p-4" style={{ background: C.inkSoft }}>
        <div className="grid w-full grid-cols-4 gap-2">
          {cols.map((c) => (
            <div key={c.l} className="flex flex-col rounded-lg px-2 pb-2 pt-2.5" style={{ background: "#22271A", borderTop: `2px solid ${c.on ? C.lime : "#33391F"}` }}>
              <div className="text-[10px]" style={{ color: "#8A9170" }}>{c.l}</div>
              <div className="mb-1.5 text-sm font-semibold tabular-nums" style={{ color: c.on ? C.lime : "#E6E9DC" }}>{Math.round(c.n * e)}</div>
              <div className="flex h-7 items-end">
                <div className="w-full rounded-sm" style={{ height: `${Math.max(8, (c.n / 12) * 100 * e)}%`, background: c.on ? C.lime : "#3A4226" }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <CardMeta
        logo={<span className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold" style={{ background: C.lime, color: C.ink }}>P</span>}
        name="PipeFlow" tag="CRM · Social Selling" tagBg="#22271A" tagText="#9AA37C"
        desc="Pipeline Kanban, gestão de leads e CRM para quem vende pelo Instagram."
        descColor="#9DA38C"
      />
      <button type="button" disabled
        className="mt-auto flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold opacity-60"
        style={{ background: "#2A301F", color: "#9AA37C" }}>
        Em breve
      </button>
    </div>
  );
}
