"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2, KeyRound, Megaphone, SlidersHorizontal, History, Users, Loader2, Save,
  Trash2, Plus, CheckCircle2, AlertCircle, ChevronDown, ChevronRight, ArrowLeftRight,
  UserPlus, ExternalLink, BarChart3, Star, Radar,
} from "lucide-react";
import { toast } from "@/hooks/useToast";
import {
  useCompany, renameCompany, fetchCompanyToken, setCompanyToken,
  fetchCompanyMembers, inviteMemberByEmail, updateMemberRole, removeMember,
  readAdAccountSuggestions, saveAdAccountSuggestions, updateCompanySettings,
  fetchCompanyTracking, setCompanyTracking,
  type CompanyMember, type CompanyRole, type AdAccountSuggestion, type Company, type TrackingConfig,
} from "@/hooks/useCompany";
import { saveMetaCredentials } from "@/utils/metaApi";
import {
  HISTORICAL_KIND_LABELS, HISTORY_TAB_LABELS_KEY, CUSTOM_HISTORY_TABS_KEY,
  readCustomHistoryTabs, type CustomHistoryTab, type HistoricalKind,
} from "@/types/historical";
import type { UserCategory } from "@/types/userConfig";

const ROLE_LABELS: Record<CompanyRole, string> = {
  owner: "Dono", manager: "Gestor de tráfego", viewer: "Visualização",
};
const ROLE_COLORS: Record<CompanyRole, string> = { owner: "#8b5cf6", manager: "#10b981", viewer: "#64748b" };
const HISTORY_KINDS: HistoricalKind[] = ["lancamento", "evento", "perpetuo", "instagram"];
const MAX_HISTORY_TABS = 7;
const isEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const BRAND = "#6366C8";

export type SectionId = "identidade" | "conexao" | "tracking" | "contas" | "filtros" | "historico" | "equipe";

// ─── Accordion section ────────────────────────────────────────────────────────

function Section({ id, icon: Icon, title, summary, status, open, onToggle, children }: {
  id: SectionId; icon: typeof Building2; title: string; summary: string;
  status: "ok" | "todo" | "neutral"; open: boolean; onToggle: (id: SectionId) => void; children: React.ReactNode;
}) {
  const statusColor = status === "ok" ? "#05CD99" : status === "todo" ? "#F4A60D" : "var(--dm-text-tertiary)";
  return (
    <div id={`studio-section-${id}`} className="rounded-2xl border transition-colors scroll-mt-4" style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: open ? BRAND : "var(--dm-border-default)" }}>
      <button type="button" onClick={() => onToggle(id)} aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-2xl px-5 py-4 text-left transition-colors hover:bg-black/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366C8] dark:hover:bg-white/[0.03]">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(99,102,200,0.12)" }}>
          <Icon size={17} style={{ color: BRAND }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>{title}</p>
          <p className="truncate text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>{summary}</p>
        </div>
        {status !== "neutral" && (
          status === "ok"
            ? <CheckCircle2 size={14} style={{ color: statusColor }} aria-label="configurado" />
            : <AlertCircle size={14} style={{ color: statusColor }} aria-label="pendente" />
        )}
        <ChevronDown size={16} className="flex-shrink-0 transition-transform duration-200"
          style={{ color: "var(--dm-text-tertiary)", transform: open ? "rotate(0deg)" : "rotate(-90deg)" }} />
      </button>
      <div className="grid transition-[grid-template-rows] duration-200 ease-out" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
        <div className="overflow-hidden">
          <div className="space-y-3 border-t px-5 py-4" style={{ borderColor: "var(--dm-border-default)" }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

const inputCls = "h-11 rounded-xl border px-3.5 text-[13px] outline-none transition focus:ring-1";
const inputStyle = { borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" } as React.CSSProperties;
const btnPrimary = "flex items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366C8] focus-visible:ring-offset-1";
const iconBtn = "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-40";
const btnPrimaryStyle = { background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)" } as React.CSSProperties;

// ─── Estúdio da Empresa ───────────────────────────────────────────────────────

export function CompanyStudio({ categories = [], onNavigate, focusSection }: {
  categories?: UserCategory[];
  onNavigate?: (tab: "accounts" | "sync") => void;
  /** Abre + rola até essa seção ao montar/mudar (ex: vindo de "Configurar agora" na aba Tracking). */
  focusSection?: SectionId | null;
}) {
  const { company, role, isOwner, loading, migrationMissing, memberships, switchCompany, isSuperAdmin } = useCompany();
  const [open, setOpen] = useState<Set<SectionId>>(new Set(["conexao", "contas"]));
  const toggle = (id: SectionId) => setOpen((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  useEffect(() => {
    if (!focusSection) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen((p) => (p.has(focusSection) ? p : new Set(p).add(focusSection)));
    const el = document.getElementById(`studio-section-${focusSection}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusSection]);

  // ── dados assíncronos ──
  const [token, setTokenVal] = useState<string>("");
  const [tracking, setTrackingVal] = useState<TrackingConfig>({ metaPixelId: "", metaCapiToken: "", dominioAutorizado: "" });
  const [members, setMembers] = useState<CompanyMember[] | null>(null);
  useEffect(() => {
    if (!company) return;
    let active = true;
    void fetchCompanyToken(company.id).then((t) => { if (active) setTokenVal(t); }).catch(() => {});
    void fetchCompanyTracking(company.id).then((t) => { if (active) setTrackingVal(t); }).catch(() => {});
    void fetchCompanyMembers(company.id).then((m) => { if (active) setMembers(m); }).catch(() => { if (active) setMembers([]); });
    return () => { active = false; };
  }, [company]);

  const suggestions = useMemo(() => readAdAccountSuggestions(company?.settings), [company?.settings]);
  const customTabs = useMemo(() => readCustomHistoryTabs(company?.settings), [company?.settings]);
  const enabledFilters = categories.filter((c) => c.isEnabled);

  if (loading) {
    return <div className="flex items-center justify-center gap-2 py-16"><Loader2 size={18} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} /><span className="text-sm" style={{ color: "var(--dm-text-tertiary)" }}>Carregando empresa…</span></div>;
  }
  if (!company) {
    return (
      <div className="rounded-2xl border p-10 text-center" style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
        <Building2 size={28} className="mx-auto mb-3" style={{ color: "var(--dm-text-tertiary)" }} />
        <p className="mb-1 text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>Nenhuma empresa configurada</p>
        <p className="text-xs" style={{ color: "var(--dm-text-tertiary)" }}>
          {migrationMissing ? "Execute a migration 021 no Supabase para ativar empresas." : "Sua conta ainda não pertence a nenhuma empresa."}
        </p>
      </div>
    );
  }

  // ── prontidão ──
  const checks = [Boolean(token.trim()), suggestions.length > 0, enabledFilters.length > 0, (members?.length ?? 0) > 0];
  const readiness = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  const totalHistoryTabs = HISTORY_KINDS.length + customTabs.length;

  // ── pipeline nodes ──
  const nodes = [
    { label: "Token", icon: KeyRound, ok: Boolean(token.trim()), info: token.trim() ? "ativo" : "faltando" },
    { label: "Contas", icon: Megaphone, ok: suggestions.length > 0, info: `${suggestions.length}` },
    { label: "Filtros", icon: SlidersHorizontal, ok: enabledFilters.length > 0, info: `${enabledFilters.length}` },
    { label: "Histórico", icon: History, ok: true, info: `${totalHistoryTabs}` },
    { label: "Dashboard", icon: BarChart3, ok: readiness === 100, info: "saída" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header: seletor + prontidão ── */}
      <div className="rounded-2xl border p-5" style={{ background: "linear-gradient(135deg, rgba(99,102,200,0.10), rgba(49,52,145,0.04))", borderColor: BRAND }}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: BRAND }}>
            <Building2 size={22} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold leading-tight" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
              {company.name}
            </p>
            <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
              Estúdio da Empresa · {role ? ROLE_LABELS[role] : "—"}{isSuperAdmin ? " · super admin" : ""}
            </p>
          </div>
          {memberships.length > 1 && (
            <div className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
              <ArrowLeftRight size={14} style={{ color: BRAND }} />
              <select value={company.id} onChange={(e) => switchCompany(e.target.value)} aria-label="Trocar empresa ativa"
                className="cursor-pointer bg-transparent text-xs font-semibold outline-none" style={{ color: "var(--dm-text-primary)" }}>
                {memberships.map((m) => <option key={m.company.id} value={m.company.id}>{m.company.name}</option>)}
              </select>
            </div>
          )}
          {/* Prontidão */}
          <div className="flex items-center gap-3 rounded-xl border px-4 py-2" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
            <div className="relative h-11 w-11" role="img" aria-label={`Prontidão da empresa: ${readiness} por cento`}>
              <svg viewBox="0 0 36 36" className="h-11 w-11 -rotate-90" aria-hidden="true">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--dm-border-default)" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke={readiness === 100 ? "#05CD99" : BRAND} strokeWidth="3"
                  strokeDasharray={`${(readiness / 100) * 97.4} 97.4`} strokeLinecap="round" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums" style={{ color: "var(--dm-text-primary)" }}>{readiness}%</span>
            </div>
            <div className="leading-tight">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Prontidão</p>
              <p className="text-[11px] font-semibold" style={{ color: readiness === 100 ? "#05CD99" : "var(--dm-text-secondary)" }}>
                {readiness === 100 ? "tudo pronto" : `${checks.filter(Boolean).length}/${checks.length} etapas`}
              </p>
            </div>
          </div>
        </div>

        {/* ── Pipeline ── */}
        <div className="mt-4 flex items-center gap-1 overflow-x-auto pb-1">
          {nodes.map((n, i) => (
            <div key={n.label} className="flex items-center gap-1">
              <div className="flex min-w-[80px] flex-col items-center gap-1 rounded-xl border px-2.5 py-2 transition-colors"
                style={{ borderColor: n.ok ? "rgba(5,205,153,0.5)" : "var(--dm-border-default)", backgroundColor: n.ok ? "rgba(5,205,153,0.06)" : "var(--dm-bg-surface)" }}>
                <n.icon size={15} style={{ color: n.ok ? "#05CD99" : "var(--dm-text-tertiary)" }} aria-hidden="true" />
                <span className="text-[10px] font-bold" style={{ color: "var(--dm-text-primary)" }}>{n.label}</span>
                <span className="text-[10px] font-semibold tabular-nums" style={{ color: n.ok ? "#05CD99" : "var(--dm-text-tertiary)" }}>{n.info}</span>
              </div>
              {i < nodes.length - 1 && <ChevronRight size={14} style={{ color: "var(--dm-text-tertiary)" }} className="flex-shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      {/* ── Seções ── */}
      <IdentidadeSection company={company} canEdit={isOwner} open={open.has("identidade")} onToggle={toggle} />
      <ConexaoSection company={company} canEdit={isOwner} token={token} onToken={setTokenVal} open={open.has("conexao")} onToggle={toggle} />
      <TrackingSection company={company} canEdit={isOwner} tracking={tracking} onTracking={setTrackingVal} open={open.has("tracking")} onToggle={toggle} />
      <ContasSection company={company} canEdit={isOwner} suggestions={suggestions} open={open.has("contas")} onToggle={toggle} />
      <FiltrosSection filters={enabledFilters} onNavigate={onNavigate} open={open.has("filtros")} onToggle={toggle} />
      <HistoricoSection company={company} canEdit={isOwner} customTabs={customTabs} totalTabs={totalHistoryTabs} open={open.has("historico")} onToggle={toggle} />
      <EquipeSection company={company} canEdit={isOwner} members={members} setMembers={setMembers} open={open.has("equipe")} onToggle={toggle} />
    </div>
  );
}

// ─── Identidade ───────────────────────────────────────────────────────────────

function IdentidadeSection({ company, canEdit, open, onToggle }: { company: Company; canEdit: boolean; open: boolean; onToggle: (id: SectionId) => void }) {
  const [name, setName] = useState(company.name);
  const [saving, setSaving] = useState(false);
  useEffect(() => setName(company.name), [company.name]);
  const save = async () => {
    if (!name.trim() || name.trim() === company.name) return;
    setSaving(true);
    try { await renameCompany(company.id, name.trim()); toast.success("Nome atualizado!"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro."); } finally { setSaving(false); }
  };
  return (
    <Section id="identidade" icon={Building2} title="Identidade" summary={company.name} status="ok" open={open} onToggle={onToggle}>
      <div className="flex gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} className={`flex-1 ${inputCls} disabled:opacity-60`} style={inputStyle} />
        {canEdit && (
          <button type="button" onClick={() => void save()} disabled={saving || !name.trim() || name.trim() === company.name} className={`h-11 ${btnPrimary}`} style={btnPrimaryStyle}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Salvar
          </button>
        )}
      </div>
    </Section>
  );
}

// ─── Conexão Meta (token) ─────────────────────────────────────────────────────

function ConexaoSection({ company, canEdit, token, onToken, open, onToggle }: {
  company: Company; canEdit: boolean; token: string; onToken: (t: string) => void; open: boolean; onToggle: (id: SectionId) => void;
}) {
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [reveal, setReveal] = useState(false);
  const has = Boolean(token.trim());
  const masked = has ? `${token.slice(0, 8)}${"•".repeat(20)}${token.slice(-4)}` : "";
  const save = async () => {
    if (!input.trim()) return;
    setSaving(true);
    try {
      await setCompanyToken(company.id, input.trim());
      saveMetaCredentials({ accessToken: input.trim() }); // empresa ativa → cache local p/ dashboard
      onToken(input.trim()); setInput("");
      toast.success("Token salvo! Propaga para todos os membros.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao salvar token."); } finally { setSaving(false); }
  };
  return (
    <Section id="conexao" icon={KeyRound} title="Conexão Meta" summary={has ? "Token configurado e ativo" : "Nenhum token ainda"} status={has ? "ok" : "todo"} open={open} onToggle={onToggle}>
      {has && (
        <div className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
          <span className="min-w-0 flex-1 truncate font-mono text-[11px]" style={{ color: "var(--dm-text-secondary)" }}>{reveal ? token : masked}</span>
          <button type="button" onClick={() => setReveal((v) => !v)} className="text-[10px] font-bold" style={{ color: BRAND }}>{reveal ? "Ocultar" : "Revelar"}</button>
        </div>
      )}
      {canEdit && (
        <div className="flex gap-3">
          <input type="password" value={input} onChange={(e) => setInput(e.target.value)} placeholder={has ? "Colar novo token para substituir…" : "EAAxxxx…"} className={`flex-1 ${inputCls} font-mono`} style={inputStyle} />
          <button type="button" onClick={() => void save()} disabled={saving || !input.trim()} className={`h-11 ${btnPrimary}`} style={btnPrimaryStyle}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {has ? "Substituir" : "Salvar"}
          </button>
        </div>
      )}
    </Section>
  );
}

// ─── Tracking Pixel (Server-Side) ─────────────────────────────────────────────

function TrackingSection({ company, canEdit, tracking, onTracking, open, onToggle }: {
  company: Company; canEdit: boolean; tracking: TrackingConfig; onTracking: (t: TrackingConfig) => void; open: boolean; onToggle: (id: SectionId) => void;
}) {
  const [pixelId, setPixelId] = useState(tracking.metaPixelId);
  const [capiToken, setCapiToken] = useState(tracking.metaCapiToken);
  const [dominio, setDominio] = useState(tracking.dominioAutorizado);
  const [saving, setSaving] = useState(false);
  const [revealToken, setRevealToken] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPixelId(tracking.metaPixelId);
    setCapiToken(tracking.metaCapiToken);
    setDominio(tracking.dominioAutorizado);
  }, [tracking]);

  const metaConfigured = Boolean(tracking.metaPixelId.trim());
  const dirty = pixelId !== tracking.metaPixelId || capiToken !== tracking.metaCapiToken || dominio !== tracking.dominioAutorizado;
  const slug = company.slug;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const snippet = `<script src="${origin}/api/tracking/pixel.js"></script>\n<script>Tracker.init("${slug}");</script>`;
  const [copied, setCopied] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const next: TrackingConfig = { metaPixelId: pixelId.trim(), metaCapiToken: capiToken.trim(), dominioAutorizado: dominio.trim() };
      await setCompanyTracking(company.id, next);
      onTracking(next);
      toast.success("Tracking pixel configurado!");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao salvar."); } finally { setSaving(false); }
  };

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error("Não foi possível copiar."); }
  };

  return (
    <Section id="tracking" icon={Radar} title="Tracking Pixel" summary={metaConfigured ? "Pixel ativo + envio pra Meta" : "Pixel ativo (sem Meta CAPI)"} status="ok" open={open} onToggle={onToggle}>
      <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
        Pixel server-side próprio (form submit, clique WhatsApp, dataLayer) — captura e mostra na aba{" "}
        <strong style={{ color: "var(--dm-text-secondary)" }}>Tracking</strong> mesmo sem nenhuma credencial da Meta abaixo.
        O envio pra Meta Conversions API é opcional, só acontece se Pixel ID e Token CAPI estiverem preenchidos.
      </p>
      <div className="rounded-xl border" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
        <div className="flex items-center justify-between border-b px-3 py-1.5" style={{ borderColor: "var(--dm-border-default)" }}>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Código de instalação</span>
          <button type="button" onClick={() => void copySnippet()} className="text-[10px] font-bold transition-opacity hover:opacity-70" style={{ color: copied ? "#05CD99" : BRAND }}>
            {copied ? "Copiado!" : "Copiar"}
          </button>
        </div>
        <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[11px] leading-relaxed" style={{ color: "var(--dm-text-secondary)" }}>{snippet}</pre>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Domínio autorizado (opcional)</span>
        <input value={dominio} disabled={!canEdit} onChange={(e) => setDominio(e.target.value)} placeholder="meusite.com.br" className={`${inputCls} h-10 font-mono disabled:opacity-60`} style={inputStyle} />
        <span className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
          Só o hostname, sem protocolo nem porta (ex: <code>meusite.com.br</code>, não <code>https://meusite.com.br</code>). Em branco = aceita qualquer origem (ok pra testar).
        </span>
      </label>

      <div className="mt-1 flex items-center gap-2 border-t pt-3" style={{ borderColor: "var(--dm-border-default)" }}>
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Enviar também pra Meta Conversions API</span>
        <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold" style={{ background: "rgba(100,116,139,0.12)", color: "var(--dm-text-tertiary)" }}>opcional</span>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Pixel ID (Meta)</span>
        <input value={pixelId} disabled={!canEdit} onChange={(e) => setPixelId(e.target.value)} placeholder="123456789012345" className={`${inputCls} h-10 font-mono disabled:opacity-60`} style={inputStyle} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Token CAPI (Conversions API)</span>
        <div className="flex items-center gap-2">
          <input
            type={revealToken ? "text" : "password"}
            value={capiToken}
            disabled={!canEdit}
            onChange={(e) => setCapiToken(e.target.value)}
            placeholder="EAAxxxx…"
            className={`flex-1 ${inputCls} h-10 font-mono disabled:opacity-60`}
            style={inputStyle}
          />
          {capiToken && (
            <button type="button" onClick={() => setRevealToken((v) => !v)} className="text-[10px] font-bold" style={{ color: BRAND }}>{revealToken ? "Ocultar" : "Revelar"}</button>
          )}
        </div>
        <span className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>Diferente do token de gestão de anúncios da Conexão Meta — gere em Events Manager → Configurações → Conversions API.</span>
      </label>
      {canEdit && (
        <button type="button" onClick={() => void save()} disabled={saving || !dirty} className={`h-11 w-full ${btnPrimary}`} style={btnPrimaryStyle}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Salvar tracking
        </button>
      )}
    </Section>
  );
}

// ─── Contas (registro de sugestões) ───────────────────────────────────────────

function ContasSection({ company, canEdit, suggestions, open, onToggle }: {
  company: Company; canEdit: boolean; suggestions: AdAccountSuggestion[]; open: boolean; onToggle: (id: SectionId) => void;
}) {
  const [list, setList] = useState<AdAccountSuggestion[]>(suggestions);
  const [id, setId] = useState(""); const [label, setLabel] = useState(""); const [saving, setSaving] = useState(false);
  useEffect(() => setList(suggestions), [suggestions]);
  const persist = async (next: AdAccountSuggestion[]) => {
    setSaving(true);
    try { await saveAdAccountSuggestions(company.id, company.settings, next); setList(next); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao salvar."); } finally { setSaving(false); }
  };
  const add = async () => {
    const clean = id.trim().replace(/^act_/, "");
    if (!clean) return;
    if (list.some((a) => a.id === clean)) { toast.error("Essa conta já está na lista."); return; }
    await persist([...list, { id: clean, label: label.trim() || clean }]);
    setId(""); setLabel(""); toast.success(`Conta ${clean} registrada — vira sugestão ★ no Adicionar conta.`);
  };
  return (
    <Section id="contas" icon={Megaphone} title="Contas de anúncio" summary={list.length ? `${list.length} registrada${list.length > 1 ? "s" : ""} · vira sugestão` : "Nenhuma registrada"} status={list.length ? "ok" : "todo"} open={open} onToggle={onToggle}>
      <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
        Registre os IDs de conta da empresa. Eles aparecem como sugestão ★ (com o nome certo) no &ldquo;Adicionar conta&rdquo; para todos os membros — sem acoplar a nenhum filtro.
      </p>
      {canEdit && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={id} onChange={(e) => setId(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }} placeholder="ID (act_123… ou 123…)" className={`flex-1 ${inputCls} font-mono`} style={inputStyle} />
          <input value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }} placeholder="Nome da conta (opcional)" className={`flex-1 ${inputCls}`} style={inputStyle} />
          <button type="button" onClick={() => void add()} disabled={saving || !id.trim()} className={`h-11 ${btnPrimary}`} style={btnPrimaryStyle}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Registrar
          </button>
        </div>
      )}
      {list.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {list.map((a) => (
            <div key={a.id} className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
              <Star size={13} className="flex-shrink-0" style={{ color: BRAND, fill: BRAND }} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>{a.label || a.id}</p>
                <p className="truncate font-mono text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>act_{a.id}</p>
              </div>
              {canEdit && (
                <button type="button" onClick={() => void persist(list.filter((x) => x.id !== a.id))} disabled={saving}
                  aria-label={`Remover conta ${a.label || a.id}`} title="Remover"
                  className={`${iconBtn} hover:bg-red-500/10`} style={{ color: "#ef4444" }}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ─── Filtros (resumo + link) ──────────────────────────────────────────────────

function FiltrosSection({ filters, onNavigate, open, onToggle }: {
  filters: UserCategory[]; onNavigate?: (tab: "accounts" | "sync") => void; open: boolean; onToggle: (id: SectionId) => void;
}) {
  return (
    <Section id="filtros" icon={SlidersHorizontal} title="Filtros" summary={filters.length ? filters.slice(0, 3).map((f) => f.name).join(" · ") + (filters.length > 3 ? ` · +${filters.length - 3}` : "") : "Nenhum filtro ativo"} status={filters.length ? "ok" : "todo"} open={open} onToggle={onToggle}>
      <div className="flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <span key={f.id} className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold" style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
            <span>{f.emoji ?? "🏷️"}</span> {f.name}
          </span>
        ))}
        {filters.length === 0 && <span className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Nenhum filtro habilitado ainda.</span>}
      </div>
      {onNavigate && (
        <button type="button" onClick={() => onNavigate("accounts")} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition hover:opacity-80" style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
          <ExternalLink size={12} style={{ color: BRAND }} /> Configurar filtros e contas
        </button>
      )}
    </Section>
  );
}

// ─── Histórico (rename + custom) ──────────────────────────────────────────────

function HistoricoSection({ company, canEdit, customTabs, totalTabs, open, onToggle }: {
  company: Company; canEdit: boolean; customTabs: CustomHistoryTab[]; totalTabs: number; open: boolean; onToggle: (id: SectionId) => void;
}) {
  const initial = (company.settings?.[HISTORY_TAB_LABELS_KEY] as Record<string, string> | undefined) ?? {};
  const [labels, setLabels] = useState<Record<string, string>>(() => Object.fromEntries(HISTORY_KINDS.map((k) => [k, initial[k] ?? ""])));
  const [tabs, setTabs] = useState<CustomHistoryTab[]>(customTabs);
  const [newLabel, setNewLabel] = useState(""); const [newEmoji, setNewEmoji] = useState("🏷️"); const [saving, setSaving] = useState(false);
  const canAdd = HISTORY_KINDS.length + tabs.length < MAX_HISTORY_TABS;
  const save = async () => {
    setSaving(true);
    try {
      const clean: Record<string, string> = {};
      for (const k of HISTORY_KINDS) { const v = labels[k]?.trim(); if (v) clean[k] = v; }
      await updateCompanySettings(company.id, { ...company.settings, [HISTORY_TAB_LABELS_KEY]: clean, [CUSTOM_HISTORY_TABS_KEY]: tabs });
      toast.success("Sub-abas do Histórico atualizadas.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao salvar."); } finally { setSaving(false); }
  };
  return (
    <Section id="historico" icon={History} title="Sub-abas do Histórico" summary={`${totalTabs}/${MAX_HISTORY_TABS} abas`} status="ok" open={open} onToggle={onToggle}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {HISTORY_KINDS.map((k) => (
          <label key={k} className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>{HISTORICAL_KIND_LABELS[k]}</span>
            <input value={labels[k]} disabled={!canEdit} onChange={(e) => setLabels((p) => ({ ...p, [k]: e.target.value }))} placeholder={HISTORICAL_KIND_LABELS[k]} className={`${inputCls} h-10 disabled:opacity-60`} style={inputStyle} />
          </label>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
          <span className="text-base">{t.emoji || "🏷️"}</span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>{t.label}</span>
          <span className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>como Lançamento</span>
          {canEdit && <button type="button" onClick={() => setTabs((p) => p.filter((x) => x.id !== t.id))} aria-label={`Remover sub-aba ${t.label}`} title="Remover" className={`${iconBtn} hover:bg-red-500/10`} style={{ color: "#ef4444" }}><Trash2 size={13} /></button>}
        </div>
      ))}
      {canEdit && canAdd && (
        <div className="flex gap-2">
          <input value={newEmoji} onChange={(e) => setNewEmoji(e.target.value)} maxLength={2} className={`${inputCls} h-10 w-12 text-center`} style={inputStyle} />
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Nova sub-aba (ex: Mentorias)" className={`${inputCls} h-10 flex-1`} style={inputStyle} />
          <button type="button" onClick={() => { if (newLabel.trim()) { setTabs((p) => [...p, { id: `ct_${Date.now().toString(36)}`, label: newLabel.trim(), emoji: newEmoji || undefined }]); setNewLabel(""); setNewEmoji("🏷️"); } }} disabled={!newLabel.trim()} className="flex h-10 items-center gap-1 rounded-xl border px-3 text-xs font-bold disabled:opacity-40" style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
            <Plus size={13} /> Add
          </button>
        </div>
      )}
      {canEdit && (
        <button type="button" onClick={() => void save()} disabled={saving} className={`h-11 w-full ${btnPrimary}`} style={btnPrimaryStyle}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Salvar sub-abas
        </button>
      )}
    </Section>
  );
}

// ─── Equipe (membros) ─────────────────────────────────────────────────────────

function EquipeSection({ company, canEdit, members, setMembers, open, onToggle }: {
  company: Company; canEdit: boolean; members: CompanyMember[] | null; setMembers: (m: CompanyMember[]) => void; open: boolean; onToggle: (id: SectionId) => void;
}) {
  const [email, setEmail] = useState(""); const [role, setRole] = useState<CompanyRole>("manager");
  const [inviting, setInviting] = useState(false); const [busyId, setBusyId] = useState<string | null>(null);
  const list = members ?? [];
  const invite = async () => {
    const e = email.trim().toLowerCase();
    if (!isEmail(e)) { toast.error("Informe um e-mail válido."); return; }
    setInviting(true);
    try {
      const r = await inviteMemberByEmail(company.id, e, role); setEmail("");
      if (r === "added") { toast.success(`${e} adicionado como ${ROLE_LABELS[role]}.`); setMembers(await fetchCompanyMembers(company.id)); }
      else toast.success(`Convite registrado para ${e}.`);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Erro ao convidar."); } finally { setInviting(false); }
  };
  const changeRole = async (m: CompanyMember, r: CompanyRole) => {
    setBusyId(m.id);
    try { await updateMemberRole(m.id, r); setMembers(list.map((x) => x.id === m.id ? { ...x, role: r } : x)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro."); } finally { setBusyId(null); }
  };
  const remove = async (m: CompanyMember) => {
    setBusyId(m.id);
    try { await removeMember(m.id); setMembers(list.filter((x) => x.id !== m.id)); toast.success(`${m.email || "Membro"} removido.`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro."); } finally { setBusyId(null); }
  };
  return (
    <Section id="equipe" icon={Users} title="Equipe" summary={`${list.length} membro${list.length !== 1 ? "s" : ""}`} status="neutral" open={open} onToggle={onToggle}>
      {canEdit && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <UserPlus size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--dm-text-tertiary)" }} />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void invite(); }} placeholder="email@pessoa.com" className={`${inputCls} h-10 w-full pl-9`} style={inputStyle} />
          </div>
          <select value={role} onChange={(e) => setRole(e.target.value as CompanyRole)} className="h-10 rounded-xl border px-2.5 text-xs font-semibold outline-none" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: ROLE_COLORS[role] }}>
            {(["manager", "viewer", "owner"] as CompanyRole[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          <button type="button" onClick={() => void invite()} disabled={inviting || !email.trim()} className={`h-10 ${btnPrimary}`} style={btnPrimaryStyle}>
            {inviting ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />} Convidar
          </button>
        </div>
      )}
      {members === null ? (
        <div className="flex items-center gap-2 py-1"><Loader2 size={13} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} /><span className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Carregando…</span></div>
      ) : (
        <div className="flex flex-col gap-1">
          {list.map((m) => (
            <div key={m.id} className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
              <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: "var(--dm-text-primary)" }}>{m.email || "—"}</span>
              {canEdit ? (
                <select value={m.role} onChange={(e) => void changeRole(m, e.target.value as CompanyRole)} disabled={busyId === m.id} className="h-7 rounded-md border px-1.5 text-[10px] font-semibold outline-none disabled:opacity-50" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)", color: ROLE_COLORS[m.role] }}>
                  {(["owner", "manager", "viewer"] as CompanyRole[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              ) : <span className="text-[10px] font-bold" style={{ color: ROLE_COLORS[m.role] }}>{ROLE_LABELS[m.role]}</span>}
              {canEdit && <button type="button" onClick={() => void remove(m)} disabled={busyId === m.id} aria-label={`Remover ${m.email || "membro"}`} title="Remover" className={`${iconBtn} hover:bg-red-500/10`} style={{ color: "#ef4444" }}>{busyId === m.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={13} />}</button>}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
