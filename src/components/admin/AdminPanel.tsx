"use client";

// ─── Painel Admin full-screen (/admin) ─────────────────────────────────────────
// Layout em 3 colunas no estilo "settings hub": rail de ícones | sidebar de
// navegação com busca | conteúdo. Tudo de gestão da plataforma mora aqui:
// empresas, produtos por conta, usuários/papéis, convites, token Meta,
// contas de anúncio, Instagram e filtros — com escopo por empresa.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, Building2, History, Home, KanbanSquare, KeyRound, LayoutGrid, Megaphone, Package, Plus,
  Search, Settings, ShieldCheck, SlidersHorizontal, Users, Mail, Camera, ChevronDown, Check,
} from "lucide-react";
import { useCompany, fetchAdminCompanies, type AdminCompany } from "@/hooks/useCompany";
import { useDevMode } from "@/hooks/useDevMode";
import {
  EmpresasSection, ProdutosSection, UsuariosSection, ConvitesSection, AtividadeSection,
  MetaSection, ContasSection, InstagramSection, FiltrosSection, PipeFlowSection, AuditoriaSection,
} from "./sections";
import { CreateCompanyWizard } from "./CreateCompanyWizard";

export type AdminNavId =
  | "overview" | "empresas" | "produtos" | "criar"
  | "usuarios" | "convites" | "atividade" | "auditoria"
  | "meta" | "contas" | "instagram"
  | "filtros" | "pipeflow";

interface NavItem { id: AdminNavId; label: string; icon: typeof Users; desc: string }

const NAV_GROUPS: { group: string; desc: string; items: NavItem[] }[] = [
  {
    group: "Empresas", desc: "Contas de cliente, produtos e provisionamento",
    items: [
      { id: "empresas", label: "Empresas",          icon: Building2, desc: "Todas as contas: membros, token e status" },
      { id: "produtos", label: "Produtos & acessos", icon: Package,   desc: "Ligue/desligue Dash e PipeFlow por empresa" },
      { id: "criar",    label: "Criar empresa",      icon: Plus,      desc: "Wizard completo: histórico, filtros e time" },
    ],
  },
  {
    group: "Pessoas", desc: "Quem acessa o hub e com qual papel",
    items: [
      { id: "usuarios",  label: "Usuários & papéis", icon: Users,   desc: "Status, último acesso, dispositivo e localização" },
      { id: "convites",  label: "Convites",          icon: Mail,    desc: "Convide por e-mail pra entrar numa empresa" },
      { id: "atividade", label: "Atividade",         icon: Activity, desc: "Todos os logins: quando, de onde, por qual device" },
      { id: "auditoria", label: "Auditoria",         icon: History,  desc: "Navegação, exportações e mudanças de produto por usuário" },
    ],
  },
  {
    group: "Integrações", desc: "Meta, contas de anúncio e Instagram",
    items: [
      { id: "meta",      label: "Conexão Meta",      icon: KeyRound,  desc: "Token de acesso da API por empresa" },
      { id: "contas",    label: "Contas de anúncio", icon: Megaphone, desc: "ACTs configuradas e sugestões por empresa" },
      { id: "instagram", label: "Instagram",         icon: Camera,    desc: "Perfil IG vinculado a cada empresa" },
    ],
  },
  {
    group: "Dados", desc: "Taxonomia dos dashboards",
    items: [
      { id: "filtros", label: "Filtros & histórico", icon: SlidersHorizontal, desc: "Filtros, subfiltros e abas do histórico" },
    ],
  },
  {
    group: "PipeFlow", desc: "CRM por empresa (funis, leads e negócios)",
    items: [
      { id: "pipeflow", label: "Funis do CRM", icon: KanbanSquare, desc: "Funis, etapas e volume de negócios por empresa" },
    ],
  },
];

export function AdminPanel() {
  const router = useRouter();
  const { memberships, isSuperAdmin } = useCompany();
  const { active: devActive } = useDevMode();
  const [nav, setNav] = useState<AdminNavId>("overview");
  const [query, setQuery] = useState("");
  const [companies, setCompanies] = useState<AdminCompany[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const list = await fetchAdminCompanies();
      if (list.length > 0) { setCompanies(list); return; }
    } catch { /* RLS pode negar; cai no fallback */ }
    // Fallback (demo/preview sem Supabase): monta a partir das memberships.
    setCompanies(memberships.map((m) => ({ company: m.company, hasToken: false, memberCount: 1 })));
  }, [memberships]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (!selectedId && companies && companies.length > 0) setSelectedId(companies[0].company.id);
  }, [companies, selectedId]);

  const selected = companies?.find((c) => c.company.id === selectedId) ?? null;

  // Busca da sidebar filtra os itens de navegação (como no mock).
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return NAV_GROUPS;
    return NAV_GROUPS
      .map((g) => ({ ...g, items: g.items.filter((it) => it.label.toLowerCase().includes(q) || it.desc.toLowerCase().includes(q)) }))
      .filter((g) => g.items.length > 0);
  }, [query]);

  const scoped = { companies: companies ?? [], selected, selectedId, onSelect: setSelectedId, reload };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--dm-bg-base)" }}>
      {/* ── Rail de ícones ─────────────────────────────────────────── */}
      <aside className="flex w-[64px] flex-shrink-0 flex-col items-center gap-2 border-r py-4"
        style={{ background: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
        <button type="button" onClick={() => router.push("/")} title="Monster Hub"
          className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl text-white transition hover:opacity-90"
          style={{ background: "var(--dm-primary)" }}>
          <LayoutGrid size={18} />
        </button>
        <RailButton icon={Home} title="Voltar pro hub" onClick={() => router.push("/")} />
        <RailButton icon={Settings} title="Painel Admin" active />
        <div className="flex-1" />
        <div className="flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-bold text-white"
          style={{ background: "var(--dm-primary)" }} title={isSuperAdmin ? "Super admin" : devActive ? "Acesso DEV" : ""}>
          <ShieldCheck size={15} />
        </div>
      </aside>

      {/* ── Sidebar de navegação ───────────────────────────────────── */}
      <aside className="flex w-[264px] flex-shrink-0 flex-col border-r"
        style={{ background: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
        <div className="px-5 pb-3 pt-5">
          <p className="text-[15px] font-bold" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
            Painel Admin
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
            <ShieldCheck size={11} style={{ color: "#22C55E" }} />
            {isSuperAdmin ? "Super admin" : "Acesso DEV"}
          </p>
        </div>

        <div className="px-4 pb-3">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--dm-text-tertiary)" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar"
              className="h-9 w-full rounded-xl border pl-9 pr-3 text-[12px] outline-none"
              style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}
            />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          <button
            type="button"
            onClick={() => setNav("overview")}
            className="mb-3 flex w-full items-center rounded-xl px-3 py-2.5 text-left text-[13px] font-bold transition-colors"
            style={nav === "overview"
              ? { background: "var(--dm-primary-soft, rgba(22,163,74,0.12))", color: "var(--dm-text-primary)" }
              : { color: "var(--dm-text-secondary)" }}
          >
            Visão geral
          </button>

          {groups.map((g) => (
            <div key={g.group} className="mb-4">
              <p className="px-3 pb-1.5 text-[11px] font-semibold" style={{ color: "var(--dm-text-tertiary)" }}>{g.group}</p>
              {g.items.map((it) => {
                const active = nav === it.id;
                return (
                  <button key={it.id} type="button" onClick={() => setNav(it.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors"
                    style={{
                      color: active ? "var(--dm-text-primary)" : "var(--dm-text-secondary)",
                      background: active ? "var(--dm-bg-elevated)" : "transparent",
                      fontWeight: active ? 700 : 500,
                    }}>
                    {it.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Escopo: empresa selecionada (vale pras seções por-empresa) */}
        {companies && companies.length > 0 && nav !== "overview" && nav !== "empresas" && nav !== "criar" && (
          <div className="border-t px-4 py-3" style={{ borderColor: "var(--dm-border-default)" }}>
            <CompanyScope companies={companies} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
        )}
      </aside>

      {/* ── Conteúdo ───────────────────────────────────────────────── */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[980px] px-8 py-10">
          {nav === "overview" && <Overview onGo={setNav} companies={companies} />}
          {nav === "empresas" && <EmpresasSection {...scoped} onCreate={() => setNav("criar")} onGo={(s) => setNav(s as AdminNavId)} />}
          {nav === "produtos" && <ProdutosSection {...scoped} />}
          {nav === "criar" && <CreateCompanyWizard onDone={() => { void reload(); setNav("empresas"); }} />}
          {nav === "usuarios" && <UsuariosSection {...scoped} />}
          {nav === "convites" && <ConvitesSection {...scoped} />}
          {nav === "atividade" && <AtividadeSection {...scoped} />}
          {nav === "auditoria" && <AuditoriaSection {...scoped} />}
          {nav === "meta" && <MetaSection {...scoped} />}
          {nav === "contas" && <ContasSection {...scoped} />}
          {nav === "instagram" && <InstagramSection {...scoped} />}
          {nav === "filtros" && <FiltrosSection {...scoped} />}
          {nav === "pipeflow" && <PipeFlowSection {...scoped} />}
        </div>
      </main>
    </div>
  );
}

function RailButton({ icon: Icon, title, active, onClick }: { icon: typeof Home; title: string; active?: boolean; onClick?: () => void }) {
  return (
    <button type="button" title={title} onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-full transition"
      style={active
        ? { background: "var(--dm-text-primary)", color: "var(--dm-bg-surface)" }
        : { color: "var(--dm-text-tertiary)" }}>
      <Icon size={17} />
    </button>
  );
}

// ─── Seletor de escopo (empresa ativa das seções) ──────────────────────────────
export function CompanyScope({ companies, selectedId, onSelect, label = "Empresa" }: {
  companies: AdminCompany[]; selectedId: string | null; onSelect: (id: string) => void; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = companies.find((c) => c.company.id === selectedId);
  return (
    <div className="relative">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>{label}</p>
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left"
        style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)" }}>
        <Building2 size={14} style={{ color: "var(--dm-text-secondary)" }} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>
          {selected?.company.name ?? "Selecionar…"}
        </span>
        <ChevronDown size={14} style={{ color: "var(--dm-text-tertiary)", transform: open ? "rotate(180deg)" : "none" }} className="transition-transform" />
      </button>
      {open && (
        <div className="absolute bottom-[calc(100%+6px)] left-0 right-0 z-30 max-h-[260px] overflow-y-auto rounded-xl border shadow-xl"
          style={{ background: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
          {companies.map((c) => {
            const active = c.company.id === selectedId;
            return (
              <button key={c.company.id} type="button" onClick={() => { onSelect(c.company.id); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--dm-bg-elevated)]"
                style={active ? { background: "var(--dm-bg-elevated)" } : undefined}>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>{c.company.name}</span>
                {active && <Check size={13} style={{ color: "var(--dm-primary)" }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Visão geral: cards agrupados (como no mock) ────────────────────────────────
function Overview({ onGo, companies }: { onGo: (id: AdminNavId) => void; companies: AdminCompany[] | null }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const groups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((it) => !q || it.label.toLowerCase().includes(q) || it.desc.toLowerCase().includes(q)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div>
      <h1 className="text-[28px] font-bold tracking-tight" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
        Painel Admin
      </h1>
      <p className="mt-1 text-[13px]" style={{ color: "var(--dm-text-tertiary)" }}>
        Gerencie empresas, usuários, produtos e integrações do Monster Hub.
        {companies ? ` ${companies.length} empresa${companies.length === 1 ? "" : "s"} na plataforma.` : ""}
      </p>

      <div className="relative mt-6">
        <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--dm-text-tertiary)" }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar seções…"
          className="h-11 w-full rounded-xl border pl-10 pr-3 text-[13px] outline-none"
          style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)", color: "var(--dm-text-primary)" }} />
      </div>

      {groups.map((g, i) => (
        <section key={g.group} className={i > 0 ? "mt-10 border-t pt-8" : "mt-8"} style={i > 0 ? { borderColor: "var(--dm-border-default)" } : undefined}>
          <h2 className="text-[16px] font-bold" style={{ color: "var(--dm-text-primary)" }}>{g.group}</h2>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--dm-text-tertiary)" }}>{g.desc}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {g.items.map((it) => (
              <button key={it.id} type="button" onClick={() => onGo(it.id)}
                className="flex items-start gap-3 rounded-2xl border p-4 text-left transition hover:shadow-md"
                style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)" }}>
                <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
                  style={{ background: "var(--dm-primary-soft, rgba(22,163,74,0.12))" }}>
                  <it.icon size={16} style={{ color: "var(--dm-primary)" }} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold" style={{ color: "var(--dm-text-primary)" }}>{it.label}</span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed" style={{ color: "var(--dm-text-tertiary)" }}>{it.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
