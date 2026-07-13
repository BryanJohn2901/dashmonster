"use client";

// ─── Seções do Painel Admin ─────────────────────────────────────────────────────
// Cada seção opera sobre a empresa selecionada no escopo (sidebar) ou sobre a
// lista completa (Empresas). Tudo usa os helpers já existentes do useCompany —
// RLS de super admin (migration 026) é quem manda de verdade no servidor.

import { useEffect, useMemo, useState } from "react";
import {
  Building2, Camera, Check, CheckCircle2, Eye, EyeOff, KeyRound, Loader2,
  Mail, Megaphone, Pencil, Plus, Save, Search, SlidersHorizontal, Trash2, Users, X, History, Radar,
} from "lucide-react";
import { TrackingSection } from "@/components/CompanyStudio";
import {
  fetchCompanyMembers, updateMemberRole, removeMember, renameCompany, setCompanyProducts,
  fetchCompanyToken, setCompanyToken, inviteMemberByEmail, sendInviteEmail, fetchCompanyAdAccounts,
  readAdAccountSuggestions, saveAdAccountSuggestions, updateCompanySettings,
  fetchCompanyInvites, revokeCompanyInvite, type PendingInvite,
  readMemberProducts, MEMBER_PRODUCTS_KEY,
  readCompanyBranding, updateCompanyLogo, COMPANY_BRANDING_KEY, type CompanyBranding,
  deleteCompany, readCompanyTag, COMPANY_TAG_KEY,
  type AdminCompany, type CompanyRole, type CompanyMember, type AdAccountEntry,
} from "@/hooks/useCompany";
import { PRODUCTS } from "@/config/products";
import { readCustomHistoryTabs, CUSTOM_HISTORY_TABS_KEY, HISTORICAL_KIND_LABELS, BUILTIN_HISTORY_KINDS, type CustomHistoryTab } from "@/types/historical";
import {
  fetchGlobalMembers, fetchLoginEvents, isActiveMember, parseUserAgent, formatLocation,
  fetchAdminUser, updateAdminUser, isBanned, fetchAuditLog,
  type GlobalMember, type LoginEvent, type AdminUserDetail, type BanDuration, type AuditLogEntry,
} from "@/lib/adminAudit";
import { FacebookConnectShell, InstagramConnectShell } from "@/components/hub/ConnectShells";
import { fetchMetaAdAccounts, type MetaAdAccount } from "@/utils/metaApi";
import { fetchPipelines, fetchCrmStats, ensureDefaultPipeline, deletePipeline, type CrmPipeline, type CrmStats } from "@/lib/crm";
import { upsertUserCategory } from "@/utils/supabaseCategories";
import { toast } from "@/hooks/useToast";
import { logAudit } from "@/lib/auditLog";

export interface ScopedProps {
  companies: AdminCompany[];
  selected: AdminCompany | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  reload: () => void | Promise<void>;
}

// Papéis de convite exibidos (o banco só conhece owner/manager/viewer — o
// título "de RH" fica em companies.settings.memberTitles, chaveado por email).
export const INVITE_ROLES: { id: string; label: string; db: CompanyRole }[] = [
  { id: "dono",     label: "Dono",              db: "owner" },
  { id: "analista", label: "Analista",          db: "manager" },
  { id: "trafego",  label: "Gestor de tráfego", db: "manager" },
  { id: "designer", label: "Designer",          db: "manager" },
  { id: "viewer",   label: "Visualizador",      db: "viewer" },
];

export const MEMBER_TITLES_KEY = "memberTitles";
export const COMPANY_FILTERS_KEY = "companyFilters";
export const INSTAGRAM_HANDLE_KEY = "instagramHandle";

export interface CompanyFilter { id: string; name: string; subfilters: string[] }

export function readCompanyFilters(settings?: Record<string, unknown>): CompanyFilter[] {
  const raw = settings?.[COMPANY_FILTERS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((f): f is CompanyFilter => !!f && typeof (f as CompanyFilter).id === "string")
    .map((f) => ({ id: f.id, name: String(f.name ?? ""), subfilters: Array.isArray(f.subfilters) ? f.subfilters.map(String) : [] }));
}

export function readMemberTitles(settings?: Record<string, unknown>): Record<string, string> {
  const raw = settings?.[MEMBER_TITLES_KEY];
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, string>) : {};
}

export const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ─── UI compartilhada ───────────────────────────────────────────────────────────

export function SectionHeader({ icon: Icon, title, desc, right }: { icon: typeof Users; title: string; desc: string; right?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: "var(--dm-primary-soft, rgba(22,163,74,0.12))" }}>
          <Icon size={19} style={{ color: "var(--dm-primary)" }} />
        </span>
        <div>
          <h1 className="text-[20px] font-bold" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>{title}</h1>
          <p className="text-[12px]" style={{ color: "var(--dm-text-tertiary)" }}>{desc}</p>
        </div>
      </div>
      {right}
    </div>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border p-5 ${className ?? ""}`} style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)" }}>
      {children}
    </div>
  );
}

function ScopeHint({ selected }: { selected: AdminCompany | null }) {
  if (selected) return null;
  return (
    <Card>
      <p className="text-[13px]" style={{ color: "var(--dm-text-tertiary)" }}>Selecione uma empresa no seletor da barra lateral.</p>
    </Card>
  );
}

const inputStyle: React.CSSProperties = {
  borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)",
};

// ─── Empresas ───────────────────────────────────────────────────────────────────

export function EmpresasSection({ companies, onSelect, reload, onCreate, onGo }: ScopedProps & { onCreate: () => void; onGo?: (section: string) => void }) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTag, setEditTag] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const filtered = companies.filter((c) => !q || c.company.name.toLowerCase().includes(q) || c.company.slug.toLowerCase().includes(q) || readCompanyTag(c.company.settings).toLowerCase().includes(q));

  const saveEdit = async (c: AdminCompany) => {
    const nm = editName.trim();
    const tg = editTag.trim().toUpperCase();
    if (!nm) { toast.error("Nome não pode ficar vazio."); return; }
    if (tg && !/^[A-Z]{3}$/.test(tg)) { toast.error("TAG: exatamente 3 letras (ex.: PTA)."); return; }
    if (tg && companies.some((x) => x.company.id !== c.company.id && readCompanyTag(x.company.settings) === tg)) {
      toast.error(`A TAG ${tg} já está em uso por outra empresa.`);
      return;
    }
    setEditingId(null);
    setBusyId(c.company.id);
    try {
      if (nm !== c.company.name) await renameCompany(c.company.id, nm);
      if (tg !== readCompanyTag(c.company.settings)) {
        await updateCompanySettings(c.company.id, { ...c.company.settings, [COMPANY_TAG_KEY]: tg });
      }
      await reload();
      toast.success("Empresa atualizada.");
    }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao salvar."); }
    finally { setBusyId(null); }
  };

  const doDelete = async (c: AdminCompany) => {
    setConfirmDeleteId(null);
    setBusyId(c.company.id);
    try { await deleteCompany(c.company.id); await reload(); toast.success(`Empresa "${c.company.name}" excluída.`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao excluir."); }
    finally { setBusyId(null); }
  };

  return (
    <div>
      <SectionHeader icon={Building2} title="Empresas" desc={`${companies.length} conta${companies.length === 1 ? "" : "s"} na plataforma`}
        right={
          <button type="button" onClick={onCreate}
            className="flex h-10 items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white transition hover:opacity-90"
            style={{ background: "var(--dm-btn-primary-bg)" }}>
            <Plus size={14} /> Criar empresa
          </button>
        } />

      <div className="relative mb-4">
        <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--dm-text-tertiary)" }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrar por nome ou slug…"
          className="h-10 w-full rounded-xl border pl-10 pr-3 text-[13px] outline-none" style={inputStyle} />
      </div>

      <div className="flex flex-col gap-2">
        {filtered.length === 0 && (
          <Card><p className="text-[13px]" style={{ color: "var(--dm-text-tertiary)" }}>Nenhuma empresa encontrada.</p></Card>
        )}
        {filtered.map((c) => {
          const editing = editingId === c.company.id;
          const open = openId === c.company.id;
          return (
            <div key={c.company.id} className="rounded-2xl border"
              style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)" }}>
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                style={{ background: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-default)" }}>
                <Building2 size={16} style={{ color: "var(--dm-text-secondary)" }} />
              </span>
              <div className="min-w-0 flex-1">
                {editing ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input value={editName} autoFocus onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void saveEdit(c); if (e.key === "Escape") setEditingId(null); }}
                      placeholder="Nome da empresa"
                      className="h-8 min-w-0 flex-1 rounded-lg border px-2 text-[13px] outline-none" style={inputStyle} />
                    <input value={editTag} maxLength={3}
                      onChange={(e) => setEditTag(e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase())}
                      onKeyDown={(e) => { if (e.key === "Enter") void saveEdit(c); if (e.key === "Escape") setEditingId(null); }}
                      placeholder="TAG"
                      className="h-8 w-16 rounded-lg border px-2 text-center text-[12px] font-bold tracking-widest uppercase outline-none"
                      style={{ ...inputStyle, borderColor: editTag && !/^[A-Z]{3}$/.test(editTag) ? "#ef4444" : "var(--dm-border-default)" }} />
                    <button type="button" onClick={() => void saveEdit(c)}
                      className="flex h-8 items-center gap-1 rounded-lg px-3 text-[11px] font-bold text-white transition hover:opacity-90"
                      style={{ background: "var(--dm-btn-primary-bg)" }}>
                      <Check size={12} /> Finalizar
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} title="Cancelar"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border transition hover:opacity-80"
                      style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)" }}>
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <p className="flex items-center gap-2 truncate text-[14px] font-bold" style={{ color: "var(--dm-text-primary)" }}>
                    <span className="truncate">{c.company.name}</span>
                    {readCompanyTag(c.company.settings) && (
                      <span className="flex-shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold tracking-widest"
                        style={{ borderColor: "var(--dm-primary)", color: "var(--dm-primary)" }}>
                        {readCompanyTag(c.company.settings)}
                      </span>
                    )}
                  </p>
                )}
                <p className="truncate text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
                  {c.memberCount} membro{c.memberCount === 1 ? "" : "s"} · {c.company.slug}
                </p>
              </div>

              {/* Produtos contratados */}
              <div className="hidden items-center gap-1 sm:flex">
                {PRODUCTS.map((p) => {
                  const on = (c.company.products ?? []).includes(p.id);
                  return (
                    <span key={p.id} className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={on
                        ? { background: "var(--dm-primary-soft, rgba(22,163,74,0.12))", color: "var(--dm-primary)" }
                        : { background: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)", opacity: 0.7 }}>
                      {p.name}
                    </span>
                  );
                })}
              </div>

              <span className="hidden rounded-full px-2 py-0.5 text-[10px] font-bold md:inline"
                style={c.hasToken
                  ? { background: "rgba(34,197,94,0.14)", color: "#22C55E" }
                  : { background: "rgba(244,166,13,0.14)", color: "#F4A60D" }}>
                {c.hasToken ? "Meta ok" : "Sem token"}
              </span>

              {busyId === c.company.id && <Loader2 size={14} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} />}
              <button type="button" title="Editar nome e TAG" onClick={() => { setEditingId(c.company.id); setEditName(c.company.name); setEditTag(readCompanyTag(c.company.settings)); }}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition hover:bg-black/5 dark:hover:bg-white/5"
                style={{ color: "var(--dm-text-tertiary)" }}>
                <Pencil size={14} />
              </button>
              <button type="button" title="Selecionar como escopo" onClick={() => { onSelect(c.company.id); toast.success(`Escopo: ${c.company.name}`); }}
                className="flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-bold transition hover:opacity-80"
                style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
                <Check size={12} /> Usar
              </button>
              <button type="button" title="Detalhes" onClick={() => setOpenId(open ? null : c.company.id)}
                className="flex h-8 items-center rounded-lg border px-2.5 text-[11px] font-bold transition hover:opacity-80"
                style={{ borderColor: "var(--dm-border-default)", color: open ? "var(--dm-primary)" : "var(--dm-text-secondary)" }}>
                {open ? "Fechar" : "Detalhes"}
              </button>
              <button type="button" title="Excluir empresa"
                onClick={() => setConfirmDeleteId(confirmDeleteId === c.company.id ? null : c.company.id)}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition hover:bg-red-500/10"
                style={{ color: "#EE5D50" }}>
                <Trash2 size={14} />
              </button>
            </div>

            {/* Confirmação de exclusão — apaga a empresa e TODOS os dados dela */}
            {confirmDeleteId === c.company.id && (
              <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3"
                style={{ borderColor: "rgba(238,93,80,0.4)", background: "rgba(238,93,80,0.06)" }}>
                <p className="min-w-0 flex-1 text-[12px] font-semibold" style={{ color: "#EE5D50" }}>
                  Excluir &quot;{c.company.name}&quot;? Apaga membros, filtros, contas e histórico. Não tem volta.
                </p>
                <button type="button" onClick={() => setConfirmDeleteId(null)}
                  className="h-8 rounded-lg border px-3 text-[11px] font-bold transition hover:opacity-80"
                  style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
                  Cancelar
                </button>
                <button type="button" onClick={() => void doDelete(c)} disabled={busyId === c.company.id}
                  className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                  style={{ background: "#EE5D50" }}>
                  <Trash2 size={12} /> Excluir de vez
                </button>
              </div>
            )}

            {/* Drill-down: visão completa da conta + atalhos pras seções já no escopo dela */}
            {open && (
              <div className="border-t px-4 py-3" style={{ borderColor: "var(--dm-border-default)" }}>
                <div className="grid gap-x-6 gap-y-1.5 text-[12px] sm:grid-cols-2" style={{ color: "var(--dm-text-secondary)" }}>
                  <span><b style={{ color: "var(--dm-text-tertiary)" }}>Produtos:</b> {(c.company.products ?? []).map((p) => PRODUCTS.find((x) => x.id === p)?.name ?? p).join(", ") || "nenhum"}</span>
                  <span><b style={{ color: "var(--dm-text-tertiary)" }}>Token Meta:</b> {c.hasToken ? "configurado" : "pendente"}</span>
                  <span><b style={{ color: "var(--dm-text-tertiary)" }}>Instagram:</b> {String(c.company.settings?.[INSTAGRAM_HANDLE_KEY] ?? "") ? `@${String(c.company.settings?.[INSTAGRAM_HANDLE_KEY])}` : "não vinculado"}</span>
                  <span><b style={{ color: "var(--dm-text-tertiary)" }}>Filtros:</b> {readCompanyFilters(c.company.settings).map((f) => f.name).join(", ") || "nenhum"}</span>
                  <span><b style={{ color: "var(--dm-text-tertiary)" }}>Abas custom:</b> {readCustomHistoryTabs(c.company.settings).map((t) => t.label).join(", ") || "nenhuma"}</span>
                  <span><b style={{ color: "var(--dm-text-tertiary)" }}>Contas de anúncio:</b> {readAdAccountSuggestions(c.company.settings).length} registrada(s)</span>
                </div>
                {onGo && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {([["meta", "Token Meta"], ["usuarios", "Usuários"], ["convites", "Convites"], ["contas", "Contas de anúncio"], ["instagram", "Instagram"], ["filtros", "Filtros & histórico"]] as const).map(([sec, label]) => (
                      <button key={sec} type="button"
                        onClick={() => { onSelect(c.company.id); onGo(sec); }}
                        className="rounded-full border px-3 py-1.5 text-[11px] font-bold transition hover:opacity-80"
                        style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-primary)" }}>
                        {label} →
                      </button>
                    ))}
                  </div>
                )}

                <CompanyBrandingEditor company={c} reload={reload} />
              </div>
            )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Personalização (banner + logo + descrição, estilo WhatsApp Business) ──────

function CompanyBrandingEditor({ company: c, reload }: { company: AdminCompany; reload: () => void | Promise<void> }) {
  const branding = readCompanyBranding(c.company.settings);
  const [logoUrl, setLogoUrl] = useState(c.company.logoUrl ?? "");
  const [bannerUrl, setBannerUrl] = useState(branding.bannerUrl ?? "");
  const [description, setDescription] = useState(branding.description ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const next: CompanyBranding = {};
      if (bannerUrl.trim()) next.bannerUrl = bannerUrl.trim();
      if (description.trim()) next.description = description.trim().slice(0, 300);
      await updateCompanySettings(c.company.id, { ...c.company.settings, [COMPANY_BRANDING_KEY]: next });
      if ((c.company.logoUrl ?? "") !== logoUrl.trim()) {
        await updateCompanyLogo(c.company.id, logoUrl.trim() || null);
      }
      await reload();
      toast.success("Personalização salva.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao salvar personalização."); }
    finally { setSaving(false); }
  };

  return (
    <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--dm-border-default)" }}>
      <p className="mb-2 text-[12px] font-bold" style={{ color: "var(--dm-text-primary)" }}>Personalização</p>

      {/* Prévia do perfil (banner + logo + descrição) */}
      {(bannerUrl.trim() || logoUrl.trim() || description.trim()) && (
        <div className="mb-3 overflow-hidden rounded-xl border" style={{ borderColor: "var(--dm-border-default)" }}>
          {bannerUrl.trim() && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={bannerUrl.trim()} alt="Banner da empresa" className="h-24 w-full object-cover" />
          )}
          <div className="flex items-center gap-2.5 px-3 py-2.5" style={{ background: "var(--dm-bg-elevated)" }}>
            {logoUrl.trim() && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={logoUrl.trim()} alt="Logo" className="h-9 w-9 rounded-full border object-cover" style={{ borderColor: "var(--dm-border-default)" }} />
            )}
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-bold" style={{ color: "var(--dm-text-primary)" }}>{c.company.name}</p>
              {description.trim() && <p className="line-clamp-2 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>{description.trim()}</p>}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="URL do logo (quadrado)"
          className="h-10 rounded-xl border px-3 text-[12.5px] outline-none" style={inputStyle} />
        <input value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} placeholder="URL do banner (paisagem)"
          className="h-10 rounded-xl border px-3 text-[12.5px] outline-none" style={inputStyle} />
      </div>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={2}
        placeholder="Descrição da empresa (aparece no hub, máx. 300 caracteres)"
        className="mt-2 w-full resize-none rounded-xl border px-3 py-2 text-[12.5px] outline-none" style={inputStyle} />
      <div className="mt-2 flex justify-end">
        <button type="button" onClick={() => void save()} disabled={saving}
          className="flex h-9 items-center gap-1.5 rounded-xl px-4 text-[11.5px] font-bold text-white transition hover:opacity-90 disabled:opacity-40"
          style={{ background: "var(--dm-btn-primary-bg)" }}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Salvar personalização
        </button>
      </div>
    </div>
  );
}

// ─── Produtos & acessos ─────────────────────────────────────────────────────────

// Presets de duração do acesso (076). null = ilimitado.
const ACCESS_DURATIONS: { id: string; label: string; days: number | null }[] = [
  { id: "unlimited", label: "Ilimitado",       days: null },
  { id: "7d",        label: "Teste · 7 dias",  days: 7 },
  { id: "15d",       label: "Teste · 15 dias", days: 15 },
  { id: "30d",       label: "30 dias",         days: 30 },
  { id: "90d",       label: "90 dias",         days: 90 },
  { id: "365d",      label: "1 ano",           days: 365 },
];

export function ProdutosSection({ companies, reload }: ScopedProps) {
  const [busy, setBusy] = useState<string | null>(null);

  // Liga/desliga e/ou define a validade de um produto (trigger 071/076 no banco).
  const setAccess = async (c: AdminCompany, productId: string, on: boolean, days?: number | null) => {
    const owned = c.company.products ?? ["dash"];
    const expiry = { ...(c.company.productExpiry ?? {}) };
    let next = owned;
    if (on) {
      if (!owned.includes(productId)) next = [...owned, productId];
      if (days) expiry[productId] = new Date(Date.now() + days * 86_400_000).toISOString();
      else delete expiry[productId];
    } else {
      next = owned.filter((p) => p !== productId);
      delete expiry[productId];
    }
    setBusy(`${c.company.id}:${productId}`);
    try {
      await setCompanyProducts(c.company.id, next, expiry);
      await reload();
      void logAudit({
        companyId: c.company.id, action: "product_change", entityType: "product",
        entityLabel: `${c.company.name} — ${productId}`,
        details: { productId, enabled: on, before: owned, after: next, expiryDays: days ?? null },
      });
    }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao salvar produtos."); }
    finally { setBusy(null); }
  };

  return (
    <div>
      <SectionHeader icon={Building2} title="Produtos & acessos" desc="O que cada empresa contratou e até quando — trava real é o trigger 071/076 no banco" />
      <div className="flex flex-col gap-2">
        {companies.map((c) => (
          <Card key={c.company.id}>
            <p className="mb-3 text-[14px] font-bold" style={{ color: "var(--dm-text-primary)" }}>{c.company.name}</p>
            <div className="flex flex-col gap-2">
              {PRODUCTS.map((p) => {
                const on = (c.company.products ?? []).includes(p.id);
                const until = c.company.productExpiry?.[p.id];
                const expired = !!until && new Date(until).getTime() <= Date.now();
                const k = `${c.company.id}:${p.id}`;
                return (
                  <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3.5 py-2.5"
                    style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)" }}>
                    <div className="min-w-0 flex-1">
                      <span className="text-[13px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>{p.name}</span>
                      <span className="ml-2 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>{p.tagline}</span>
                    </div>

                    {on && (
                      <>
                        {/* Situação do acesso */}
                        <span className="rounded-full px-2.5 py-0.5 text-[10.5px] font-bold"
                          style={expired
                            ? { background: "rgba(238,93,80,0.12)", color: "#EE5D50" }
                            : until
                              ? { background: "rgba(244,166,13,0.14)", color: "#F4A60D" }
                              : { background: "rgba(34,197,94,0.14)", color: "#22C55E" }}>
                          {expired
                            ? `Expirado em ${new Date(until!).toLocaleDateString("pt-BR")}`
                            : until
                              ? `Expira ${new Date(until).toLocaleDateString("pt-BR")}`
                              : "Ilimitado"}
                        </span>

                        {/* Duração: aplicar direto (a partir de agora) */}
                        <select value="" disabled={busy === k}
                          onChange={(e) => {
                            const d = ACCESS_DURATIONS.find((x) => x.id === e.target.value);
                            if (d) void setAccess(c, p.id, true, d.days);
                          }}
                          className="h-8 rounded-lg border px-2 text-[11.5px] font-semibold outline-none disabled:opacity-50" style={inputStyle}>
                          <option value="" disabled>Definir duração…</option>
                          {ACCESS_DURATIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                        </select>
                      </>
                    )}

                    <button type="button" onClick={() => void setAccess(c, p.id, !on)} disabled={busy === k} aria-pressed={on}
                      className="relative h-6 w-11 flex-shrink-0 rounded-full transition disabled:opacity-60"
                      style={{ background: on && !expired ? "var(--dm-primary)" : on ? "#F4A60D" : "var(--dm-border-default)" }}>
                      <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: on ? "22px" : "2px" }} />
                    </button>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Usuários & papéis ──────────────────────────────────────────────────────────

const DB_ROLE_LABEL: Record<CompanyRole, string> = { owner: "Dono", manager: "Gestor", viewer: "Visualizador" };

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "nunca";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins} min atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h atrás`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d atrás`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function UsuariosSection(props: ScopedProps) {
  const [tab, setTab] = useState<"todos" | "empresa">("todos");
  return (
    <div>
      <SectionHeader icon={Users} title="Usuários & papéis" desc="Quem acessa a plataforma: status, último acesso, dispositivo e localização"
        right={
          <div className="flex rounded-xl border p-1" style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)" }}>
            {([["todos", "Todos os usuários"], ["empresa", "Por empresa"]] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setTab(id)}
                className="rounded-lg px-3 py-1.5 text-[12px] font-bold transition"
                style={tab === id
                  ? { background: "var(--dm-primary-soft, rgba(22,163,74,0.12))", color: "var(--dm-primary)" }
                  : { color: "var(--dm-text-tertiary)" }}>
                {label}
              </button>
            ))}
          </div>
        } />
      {tab === "todos" ? <GlobalUsersView /> : <CompanyMembersView {...props} />}
    </div>
  );
}

// Visão global de auditoria: todos os usuários da plataforma.
function GlobalUsersView() {
  const [members, setMembers] = useState<GlobalMember[] | null>(null);
  const [query, setQuery] = useState("");
  const [onlyInactive, setOnlyInactive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    void fetchGlobalMembers().then(setMembers).catch((e) => {
      toast.error(e instanceof Error ? e.message : "Erro ao listar usuários.");
      setMembers([]);
    });
  }, []);

  if (!members) return <Card><Loader2 size={16} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} /></Card>;

  const q = query.trim().toLowerCase();
  const filtered = members
    .filter((m) => !q || m.email.toLowerCase().includes(q) || m.companies.some((c) => c.companyName.toLowerCase().includes(q)))
    .filter((m) => !onlyInactive || !isActiveMember(m));
  const activeCount = members.filter(isActiveMember).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--dm-text-tertiary)" }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por e-mail ou empresa…"
            className="h-10 w-full rounded-xl border pl-10 pr-3 text-[13px] outline-none" style={inputStyle} />
        </div>
        <button type="button" onClick={() => setOnlyInactive((v) => !v)}
          className="flex h-10 items-center gap-2 rounded-xl border px-3.5 text-[12px] font-bold transition"
          style={onlyInactive
            ? { borderColor: "#F4A60D", color: "#F4A60D", background: "rgba(244,166,13,0.08)" }
            : { borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
          Só inativos
        </button>
        <span className="text-[12px]" style={{ color: "var(--dm-text-tertiary)" }}>
          {members.length} usuário{members.length === 1 ? "" : "s"} · {activeCount} ativo{activeCount === 1 ? "" : "s"} (30d)
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {filtered.length === 0 && <Card><p className="text-[13px]" style={{ color: "var(--dm-text-tertiary)" }}>Nenhum usuário encontrado.</p></Card>}
        {filtered.map((m) => {
          const active = isActiveMember(m);
          return (
            <div key={m.userId} className="rounded-2xl border px-4 py-3"
              style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)" }}>
              <div className="flex items-center gap-3">
                <span className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ background: "var(--dm-primary)" }}>
                  {m.email.slice(0, 2).toUpperCase()}
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2"
                    style={{ background: active ? "#22C55E" : "#94A3B8", borderColor: "var(--dm-bg-surface)" }} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-bold" style={{ color: "var(--dm-text-primary)" }}>{m.email}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
                    {m.companies.map((c) => (
                      <span key={c.companyId}>{c.companyName} · {DB_ROLE_LABEL[c.role as CompanyRole] ?? c.role}</span>
                    ))}
                  </p>
                </div>
                <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold"
                  style={active
                    ? { background: "rgba(34,197,94,0.14)", color: "#22C55E" }
                    : { background: "rgba(148,163,184,0.14)", color: "#94A3B8" }}>
                  {active ? "Ativo" : "Inativo"}
                </span>
                <button type="button" onClick={() => setEditingId((v) => (v === m.userId ? null : m.userId))}
                  title="Editar usuário"
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition hover:opacity-70"
                  style={{ color: editingId === m.userId ? "var(--dm-primary)" : "var(--dm-text-tertiary)" }}>
                  <Pencil size={13} />
                </button>
              </div>
              <div className="mt-2.5 grid gap-x-6 gap-y-1 border-t pt-2.5 text-[11.5px] sm:grid-cols-2 lg:grid-cols-4"
                style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
                <span title={m.lastLogin?.createdAt ?? ""}><b style={{ color: "var(--dm-text-tertiary)" }}>Último acesso:</b> {timeAgo(m.lastLogin?.createdAt)}</span>
                <span><b style={{ color: "var(--dm-text-tertiary)" }}>Dispositivo:</b> {parseUserAgent(m.lastLogin?.userAgent ?? null)}</span>
                <span><b style={{ color: "var(--dm-text-tertiary)" }}>Local:</b> {formatLocation(m.lastLogin)}</span>
                <span><b style={{ color: "var(--dm-text-tertiary)" }}>IP:</b> {m.lastLogin?.ip ?? "—"}</span>
              </div>
              {editingId === m.userId && <UserEditor userId={m.userId} onClose={() => setEditingId(null)} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Editor inline de usuário (rota /api/admin/users, service role — só super admin).
function UserEditor({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [banFor, setBanFor] = useState<BanDuration>("24h");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetchAdminUser(userId)
      .then((d) => { if (!active) return; setDetail(d); setName(d.name); setEmail(d.email); setAvatarUrl(d.avatarUrl ?? ""); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Erro ao carregar usuário."); });
    return () => { active = false; };
  }, [userId]);

  if (error) return <p className="mt-3 border-t pt-3 text-[12px]" style={{ borderColor: "var(--dm-border-default)", color: "#EE5D50" }}>{error}</p>;
  if (!detail) return <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--dm-border-default)" }}><Loader2 size={14} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} /></div>;

  const banned = isBanned(detail.bannedUntil);

  const apply = async (input: Parameters<typeof updateAdminUser>[0]) => {
    setSaving(true);
    try {
      await updateAdminUser(input);
      const d = await fetchAdminUser(userId);
      setDetail(d); setName(d.name); setEmail(d.email); setAvatarUrl(d.avatarUrl ?? "");
      toast.success("Usuário atualizado.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao atualizar."); }
    finally { setSaving(false); }
  };

  const save = () => {
    const input: Parameters<typeof updateAdminUser>[0] = { userId };
    if (name.trim() && name.trim() !== detail.name) input.name = name.trim();
    if (email.trim() && email.trim().toLowerCase() !== detail.email) input.email = email.trim();
    if (avatarUrl.trim() !== (detail.avatarUrl ?? "")) input.avatarUrl = avatarUrl.trim();
    if (!input.name && !input.email && input.avatarUrl === undefined) { onClose(); return; }
    void apply(input);
  };

  return (
    <div className="mt-3 flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--dm-border-default)" }}>
      {banned && (
        <p className="rounded-lg px-3 py-2 text-[12px] font-bold" style={{ background: "rgba(238,93,80,0.1)", color: "#EE5D50" }}>
          Banido até {new Date(detail.bannedUntil!).toLocaleString("pt-BR")}
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome"
          className="h-10 rounded-xl border px-3 text-[12.5px] outline-none" style={inputStyle} />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail"
          className="h-10 rounded-xl border px-3 text-[12.5px] outline-none" style={inputStyle} />
        <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="URL da foto (vazio remove)"
          className="h-10 rounded-xl border px-3 text-[12.5px] outline-none" style={inputStyle} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={saving}
          className="flex h-9 items-center gap-1.5 rounded-xl px-4 text-[11.5px] font-bold text-white transition hover:opacity-90 disabled:opacity-40"
          style={{ background: "var(--dm-btn-primary-bg)" }}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Salvar
        </button>
        <div className="flex-1" />
        {banned ? (
          <button type="button" onClick={() => void apply({ userId, ban: "none" })} disabled={saving}
            className="flex h-9 items-center gap-1.5 rounded-xl border px-3.5 text-[11.5px] font-bold transition hover:opacity-80 disabled:opacity-40"
            style={{ borderColor: "rgba(34,197,94,0.4)", color: "#22C55E" }}>
            Desbanir
          </button>
        ) : (
          <>
            <select value={banFor} onChange={(e) => setBanFor(e.target.value as BanDuration)}
              className="h-9 rounded-xl border px-2.5 text-[11.5px] font-semibold outline-none" style={inputStyle}>
              <option value="24h">24 horas</option>
              <option value="168h">7 dias</option>
              <option value="876000h">Permanente</option>
            </select>
            <button type="button" disabled={saving}
              onClick={() => { if (confirm(`Banir ${detail.email}? A pessoa perde o acesso na hora.`)) void apply({ userId, ban: banFor }); }}
              className="flex h-9 items-center gap-1.5 rounded-xl border px-3.5 text-[11.5px] font-bold transition hover:opacity-80 disabled:opacity-40"
              style={{ borderColor: "rgba(238,93,80,0.45)", color: "#EE5D50" }}>
              Banir
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function CompanyMembersView({ selected, reload }: ScopedProps) {
  const [members, setMembers] = useState<CompanyMember[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setMembers(null);
    if (!selected) return;
    let active = true;
    void fetchCompanyMembers(selected.company.id)
      .then((m) => { if (active) setMembers(m); })
      .catch(() => { if (active) setMembers([]); });
    return () => { active = false; };
  }, [selected]);

  if (!selected) return <ScopeHint selected={selected} />;

  const titles = readMemberTitles(selected.company.settings);
  const memberProducts = readMemberProducts(selected.company.settings);
  const ownedProducts = selected.company.products ?? ["dash"];

  // Liga/desliga um produto pra UM membro (allowlist em settings.memberProducts).
  const toggleMemberProduct = async (m: CompanyMember, productId: string) => {
    const email = m.email.toLowerCase();
    const current = memberProducts[email] ?? ownedProducts;
    const next = current.includes(productId) ? current.filter((p) => p !== productId) : [...current, productId];
    const map = { ...memberProducts };
    if (ownedProducts.every((p) => next.includes(p))) delete map[email]; // tudo liberado → sem entrada
    else map[email] = next;
    setBusyId(m.id);
    try {
      await updateCompanySettings(selected.company.id, { ...selected.company.settings, [MEMBER_PRODUCTS_KEY]: map });
      await reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao salvar acesso."); }
    finally { setBusyId(null); }
  };

  const changeRole = async (m: CompanyMember, role: CompanyRole) => {
    setBusyId(m.id);
    try { await updateMemberRole(m.id, role); setMembers((prev) => prev?.map((x) => (x.id === m.id ? { ...x, role } : x)) ?? null); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao trocar papel."); }
    finally { setBusyId(null); }
  };

  const remove = async (m: CompanyMember) => {
    if (!confirm(`Remover ${m.email} de ${selected.company.name}?`)) return;
    setBusyId(m.id);
    try { await removeMember(m.id); setMembers((prev) => prev?.filter((x) => x.id !== m.id) ?? null); await reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao remover."); }
    finally { setBusyId(null); }
  };

  return (
    <div>
      <p className="mb-3 text-[12px] font-bold" style={{ color: "var(--dm-text-secondary)" }}>Membros de {selected.company.name}</p>
      {members === null ? (
        <Card><Loader2 size={16} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} /></Card>
      ) : members.length === 0 ? (
        <Card><p className="text-[13px]" style={{ color: "var(--dm-text-tertiary)" }}>Nenhum membro ainda. Use Convites pra chamar o time.</p></Card>
      ) : (
        <div className="flex flex-col gap-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-2xl border px-4 py-3"
              style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)" }}>
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ background: "var(--dm-primary)" }}>
                {m.email.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>{m.email}</p>
                <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
                  {titles[m.email.toLowerCase()] ?? DB_ROLE_LABEL[m.role]}
                </p>
              </div>
              {busyId === m.id && <Loader2 size={14} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} />}
              {/* Acesso por produto deste membro (interseção com os da empresa) */}
              <div className="flex flex-shrink-0 gap-1">
                {PRODUCTS.filter((p) => ownedProducts.includes(p.id)).map((p) => {
                  const allowed = (memberProducts[m.email.toLowerCase()] ?? ownedProducts).includes(p.id);
                  return (
                    <button key={p.id} type="button" disabled={busyId === m.id}
                      onClick={() => void toggleMemberProduct(m, p.id)}
                      title={`${p.name}: ${allowed ? "liberado" : "bloqueado"} pra este membro`}
                      className="rounded-lg border px-2 py-1 text-[10.5px] font-bold transition disabled:opacity-50"
                      style={allowed
                        ? { borderColor: "rgba(34,197,94,0.4)", background: "rgba(34,197,94,0.1)", color: "#22C55E" }
                        : { borderColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)", textDecoration: "line-through" }}>
                      {p.name}
                    </button>
                  );
                })}
              </div>
              <select value={m.role} onChange={(e) => void changeRole(m, e.target.value as CompanyRole)}
                className="h-9 rounded-lg border px-2 text-[12px] font-semibold outline-none" style={inputStyle}>
                <option value="owner">Dono</option>
                <option value="manager">Gestor</option>
                <option value="viewer">Visualizador</option>
              </select>
              <button type="button" title="Remover" onClick={() => void remove(m)}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition hover:bg-red-500/10"
                style={{ color: "#EE5D50" }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Atividade (login events) ───────────────────────────────────────────────────

export function AtividadeSection(_props: ScopedProps) {
  const [events, setEvents] = useState<LoginEvent[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    void fetchLoginEvents(200).then(setEvents).catch((e) => {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar atividade.");
      setEvents([]);
    });
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = (events ?? []).filter((e) => !q || e.email.toLowerCase().includes(q) || (e.ip ?? "").includes(q));

  return (
    <div>
      <SectionHeader icon={History} title="Atividade" desc="Todos os logins na plataforma: quando, de onde e por qual dispositivo" />
      <div className="relative mb-4">
        <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--dm-text-tertiary)" }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrar por e-mail ou IP…"
          className="h-10 w-full rounded-xl border pl-10 pr-3 text-[13px] outline-none" style={inputStyle} />
      </div>

      {events === null ? (
        <Card><Loader2 size={16} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} /></Card>
      ) : filtered.length === 0 ? (
        <Card>
          <p className="text-[13px]" style={{ color: "var(--dm-text-tertiary)" }}>
            Nenhum login registrado ainda. Os eventos começam a aparecer assim que alguém entrar
            (rota /api/auth/login-event — exige a migration 074 aplicada).
          </p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--dm-border-default)" }}>
          {filtered.map((e, i) => (
            <div key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-[12px]"
              style={{ background: "var(--dm-bg-surface)", borderTop: i > 0 ? "1px solid var(--dm-border-default)" : undefined }}>
              <span className="w-[150px] font-semibold tabular-nums" style={{ color: "var(--dm-text-tertiary)" }}>
                {new Date(e.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="min-w-[180px] flex-1 truncate font-bold" style={{ color: "var(--dm-text-primary)" }}>{e.email}</span>
              <span style={{ color: "var(--dm-text-secondary)" }}>{parseUserAgent(e.userAgent)}</span>
              <span style={{ color: "var(--dm-text-secondary)" }}>{formatLocation(e)}</span>
              <span className="tabular-nums" style={{ color: "var(--dm-text-tertiary)" }}>{e.ip ?? "—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Auditoria ────────────────────────────────────────────────────────────────

const AUDIT_ACTION_LABELS: Record<string, string> = {
  page_view: "Navegação", export: "Exportação", product_change: "Produto",
  create: "Criação", update: "Edição", delete: "Exclusão",
};

function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

function auditDetail(e: AuditLogEntry): string {
  const d = e.details;
  if (e.action === "export") {
    const count = d.campaignCount ?? d.count;
    return typeof count === "number" ? `${count} item${count === 1 ? "" : "s"}` : "";
  }
  if (e.action === "product_change") {
    return d.enabled ? "ativado" : "desativado";
  }
  return "";
}

export function AuditoriaSection({ selected, selectedId }: ScopedProps) {
  const [events, setEvents] = useState<AuditLogEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [scopeAll, setScopeAll] = useState(true);

  useEffect(() => {
    setEvents(null);
    void fetchAuditLog(scopeAll ? undefined : (selectedId ?? undefined))
      .then(setEvents)
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Erro ao carregar auditoria.");
        setEvents([]);
      });
  }, [scopeAll, selectedId]);

  const q = query.trim().toLowerCase();
  const filtered = (events ?? []).filter((e) =>
    (actionFilter === "all" || e.action === actionFilter)
    && (!q || (e.userEmail ?? "").toLowerCase().includes(q) || (e.entityLabel ?? "").toLowerCase().includes(q)),
  );

  return (
    <div>
      <SectionHeader icon={History} title="Auditoria" desc="Navegação, exportações e mudanças relevantes — não é log de cada clique" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--dm-text-tertiary)" }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrar por e-mail ou item…"
            className="h-10 w-full rounded-xl border pl-10 pr-3 text-[13px] outline-none" style={inputStyle} />
        </div>
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}
          className="h-10 rounded-xl border px-3 text-[13px] outline-none" style={inputStyle}>
          <option value="all">Todas as ações</option>
          {Object.entries(AUDIT_ACTION_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <button type="button" onClick={() => setScopeAll((v) => !v)}
          className="h-10 rounded-xl border px-3 text-[12px] font-semibold transition-colors"
          style={scopeAll
            ? { borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }
            : { borderColor: "var(--dm-primary)", color: "var(--dm-primary)", background: "var(--dm-primary-soft)" }}>
          {scopeAll ? "Todas as empresas" : `Só ${selected?.company.name ?? "empresa selecionada"}`}
        </button>
      </div>

      {events === null ? (
        <Card><Loader2 size={16} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} /></Card>
      ) : filtered.length === 0 ? (
        <Card>
          <p className="text-[13px]" style={{ color: "var(--dm-text-tertiary)" }}>
            Nenhum evento de auditoria ainda (migration 081 precisa estar aplicada no Supabase).
          </p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--dm-border-default)" }}>
          {filtered.map((e, i) => (
            <div key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-[12px]"
              style={{ background: "var(--dm-bg-surface)", borderTop: i > 0 ? "1px solid var(--dm-border-default)" : undefined }}>
              <span className="w-[130px] font-semibold tabular-nums" style={{ color: "var(--dm-text-tertiary)" }}>
                {new Date(e.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="w-[110px] font-bold" style={{ color: "var(--dm-primary)" }}>{auditActionLabel(e.action)}</span>
              <span className="min-w-[160px] flex-1 truncate font-semibold" style={{ color: "var(--dm-text-primary)" }}>{e.entityLabel ?? "—"}</span>
              {scopeAll && <span className="w-[140px] truncate" style={{ color: "var(--dm-text-secondary)" }}>{e.companyName ?? "—"}</span>}
              <span className="min-w-[140px] truncate" style={{ color: "var(--dm-text-secondary)" }}>{e.userEmail ?? "—"}</span>
              <span className="w-[90px]" style={{ color: "var(--dm-text-tertiary)" }}>{auditDetail(e)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Convites ───────────────────────────────────────────────────────────────────

export function ConvitesSection({ selected, reload }: ScopedProps) {
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("analista");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ email: string; label: string; result: string }[]>([]);
  const [pending, setPending] = useState<PendingInvite[] | null>(null);

  const loadPending = (companyId: string) =>
    fetchCompanyInvites(companyId).then(setPending).catch(() => setPending([]));

  useEffect(() => {
    setPending(null);
    if (selected) void loadPending(selected.company.id);
  }, [selected]);

  if (!selected) return <><SectionHeader icon={Mail} title="Convites" desc="Convide alguém pra entrar numa empresa" /><ScopeHint selected={selected} /></>;

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  const invite = async () => {
    const role = INVITE_ROLES.find((r) => r.id === roleId)!;
    setSending(true);
    try {
      await inviteMemberByEmail(selected.company.id, email.trim(), role.db);
      // Título "de RH" (Analista, Designer…) fica em settings.memberTitles.
      const titles = readMemberTitles(selected.company.settings);
      await updateCompanySettings(selected.company.id, {
        ...selected.company.settings,
        [MEMBER_TITLES_KEY]: { ...titles, [email.trim().toLowerCase()]: role.label },
      }).catch(() => {});
      // E-mail de verdade (magic link do Supabase) — a pessoa clica e cai
      // autenticada em /aceitar-convite, vendo o convite pra aceitar/recusar.
      await sendInviteEmail(email.trim()).catch((e) => {
        toast.error(e instanceof Error ? `Convite criado, mas o e-mail falhou: ${e.message}` : "Convite criado, mas o e-mail falhou ao enviar.");
      });
      setSent((prev) => [{ email: email.trim(), label: role.label, result: "invited" }, ...prev]);
      setEmail("");
      toast.success("Convite enviado por e-mail. A pessoa precisa aceitar em /aceitar-convite.");
      await Promise.all([reload(), loadPending(selected.company.id)]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao convidar.");
    } finally { setSending(false); }
  };

  return (
    <div>
      <SectionHeader icon={Mail} title="Convites" desc={`Convidar pessoas para ${selected.company.name}`} />
      <Card>
        <p className="mb-3 text-[12px] leading-relaxed" style={{ color: "var(--dm-text-tertiary)" }}>
          Manda um e-mail de verdade (magic link) pra pessoa, com ou sem conta no Monster Hub.
          Ela clica, entra logada e precisa <strong>aceitar</strong> o convite em /aceitar-convite —
          nada acontece sozinho.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && emailValid) void invite(); }}
            placeholder="pessoa@email.com"
            className="h-11 min-w-0 flex-1 rounded-xl border px-3.5 text-[13px] outline-none" style={inputStyle} />
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)}
            className="h-11 rounded-xl border px-3 text-[13px] font-semibold outline-none" style={inputStyle}>
            {INVITE_ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <button type="button" onClick={() => void invite()} disabled={!emailValid || sending}
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl px-5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
            style={{ background: "var(--dm-btn-primary-bg)" }}>
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Convidar
          </button>
        </div>
      </Card>

      {sent.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {sent.map((s, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border px-4 py-2.5"
              style={{ borderColor: "rgba(34,197,94,0.35)", background: "rgba(34,197,94,0.06)" }}>
              <CheckCircle2 size={15} style={{ color: "#22C55E" }} />
              <p className="min-w-0 flex-1 truncate text-[12.5px]" style={{ color: "var(--dm-text-primary)" }}>
                <strong>{s.email}</strong> · {s.label}
              </p>
              <span className="text-[11px] font-bold" style={{ color: "#22C55E" }}>
                {s.result === "added" ? "Adicionado" : "Convite pendente"}
              </span>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-2 mt-8 text-[13px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
        Convites pendentes
      </h2>
      {pending === null ? (
        <Card><Loader2 size={16} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} /></Card>
      ) : pending.length === 0 ? (
        <Card><p className="text-[13px]" style={{ color: "var(--dm-text-tertiary)" }}>Nenhum convite aguardando cadastro.</p></Card>
      ) : (
        <div className="flex flex-col gap-1.5">
          {pending.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl border px-4 py-2.5"
              style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)" }}>
              <Mail size={14} style={{ color: "var(--dm-text-tertiary)" }} />
              <p className="min-w-0 flex-1 truncate text-[12.5px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>
                {p.email} <span className="font-normal" style={{ color: "var(--dm-text-tertiary)" }}>· {DB_ROLE_LABEL[p.role] ?? p.role} · {new Date(p.createdAt).toLocaleDateString("pt-BR")}</span>
              </p>
              <button type="button" title="Revogar convite"
                onClick={() => {
                  void revokeCompanyInvite(p.id)
                    .then(() => { setPending((prev) => prev?.filter((x) => x.id !== p.id) ?? null); toast.success("Convite revogado."); })
                    .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao revogar."));
                }}
                className="flex h-7 w-7 items-center justify-center rounded-md transition hover:opacity-70" style={{ color: "#EE5D50" }}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Conexão Meta (token por empresa) ───────────────────────────────────────────

// ─── Tracking (pixel server-side + Eduzz) por empresa ──────────────────────────
// Reusa a TrackingSection do Estúdio (variant painel). Super admin sempre edita.
export function TrackingAdminSection({ selected }: ScopedProps) {
  return (
    <div>
      <SectionHeader icon={Radar} title="Tracking" desc="Pixel server-side e conexão Eduzz, por empresa" />
      {selected ? (
        <TrackingSection company={selected.company} canEdit open onToggle={() => {}} variant="panel" />
      ) : (
        <ScopeHint selected={null} />
      )}
    </div>
  );
}

export function MetaSection({ companies, selected, reload }: ScopedProps) {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setToken(""); setShowToken(false);
    if (!selected) return;
    setLoading(true);
    let active = true;
    void fetchCompanyToken(selected.company.id)
      .then((t) => { if (active) setToken(t); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selected]);

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try { await setCompanyToken(selected.company.id, token.trim()); await reload(); toast.success("Token salvo."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao salvar token."); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <SectionHeader icon={KeyRound} title="Conexão Meta" desc="OAuth do Facebook (BM) + token de acesso da API, por empresa" />

      <div className="mb-4">
        <FacebookConnectShell connected={Boolean(token.trim()) || (selected?.hasToken ?? false)} />
      </div>

      {selected ? (
        <Card>
          <p className="mb-2 text-[13px] font-bold" style={{ color: "var(--dm-text-primary)" }}>Token de {selected.company.name}</p>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <input type={showToken ? "text" : "password"} value={loading ? "…" : token}
                onChange={(e) => setToken(e.target.value)} disabled={loading}
                placeholder="EAAB… (token longo do Meta)"
                className="h-11 w-full rounded-xl border px-3.5 pr-10 text-[13px] outline-none disabled:opacity-60" style={inputStyle} />
              <button type="button" onClick={() => setShowToken((v) => !v)} title={showToken ? "Ocultar" : "Mostrar"}
                className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--dm-text-tertiary)" }}>
                {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <button type="button" onClick={() => void save()} disabled={saving || loading}
              className="flex h-11 items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
              style={{ background: "var(--dm-btn-primary-bg)" }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Salvar
            </button>
          </div>
        </Card>
      ) : <ScopeHint selected={selected} />}

      <h2 className="mb-2 mt-8 text-[13px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Status por empresa</h2>
      <div className="flex flex-col gap-1.5">
        {companies.map((c) => (
          <div key={c.company.id} className="flex items-center justify-between rounded-xl border px-4 py-2.5"
            style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)" }}>
            <span className="truncate text-[13px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>{c.company.name}</span>
            <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold"
              style={c.hasToken
                ? { background: "rgba(34,197,94,0.14)", color: "#22C55E" }
                : { background: "rgba(244,166,13,0.14)", color: "#F4A60D" }}>
              {c.hasToken ? "Conectado" : "Sem token"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Contas de anúncio ──────────────────────────────────────────────────────────

export function ContasSection({ selected, reload }: ScopedProps) {
  const [entries, setEntries] = useState<AdAccountEntry[] | null>(null);
  const [newId, setNewId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [discovered, setDiscovered] = useState<MetaAdAccount[] | null>(null);
  const [discovering, setDiscovering] = useState(false);

  useEffect(() => {
    setEntries(null);
    setDiscovered(null);
    if (!selected) return;
    let active = true;
    void fetchCompanyAdAccounts(selected.company.id)
      .then((e) => { if (active) setEntries(e); })
      .catch(() => { if (active) setEntries([]); });
    return () => { active = false; };
  }, [selected]);

  if (!selected) return <><SectionHeader icon={Megaphone} title="Contas de anúncio" desc="ACTs por empresa" /><ScopeHint selected={selected} /></>;

  const suggestions = readAdAccountSuggestions(selected.company.settings);

  // Descobre TODAS as contas que o token da empresa enxerga (app + BM vinculada).
  const discover = async () => {
    setDiscovering(true);
    try {
      const token = await fetchCompanyToken(selected.company.id);
      if (!token) { toast.error("Empresa sem token Meta. Configure em Conexão Meta primeiro."); return; }
      setDiscovered(await fetchMetaAdAccounts(token));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao buscar contas no Meta."); }
    finally { setDiscovering(false); }
  };

  const saveSuggestion = async (id: string, label: string) => {
    setBusy(true);
    try {
      await saveAdAccountSuggestions(selected.company.id, selected.company.settings,
        [...suggestions.filter((s) => s.id !== id), { id, label: label || id }]);
      await reload();
      toast.success("Conta registrada nas sugestões da empresa.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao registrar conta."); }
    finally { setBusy(false); }
  };

  const addSuggestion = async () => {
    const id = newId.trim().replace(/^act_/, "");
    if (!id) return;
    await saveSuggestion(id, newLabel.trim());
    setNewId(""); setNewLabel("");
  };

  const removeSuggestion = async (id: string) => {
    setBusy(true);
    try {
      await saveAdAccountSuggestions(selected.company.id, selected.company.settings, suggestions.filter((s) => s.id !== id));
      await reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao remover."); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <SectionHeader icon={Megaphone} title="Contas de anúncio" desc={`ACTs de ${selected.company.name}`} />

      <Card>
        <p className="mb-1 text-[13px] font-bold" style={{ color: "var(--dm-text-primary)" }}>Registrar conta (sugestão)</p>
        <p className="mb-3 text-[11px] leading-relaxed" style={{ color: "var(--dm-text-tertiary)" }}>
          Entra no autocomplete do &quot;Conectar conta&quot; da empresa. O acoplamento a um filtro acontece lá, quando o time conectar de fato.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="ID da conta (ACT) — só números"
            className="h-11 min-w-0 flex-1 rounded-xl border px-3.5 text-[13px] outline-none" style={inputStyle} />
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Apelido (opcional)"
            className="h-11 min-w-0 flex-1 rounded-xl border px-3.5 text-[13px] outline-none" style={inputStyle} />
          <button type="button" onClick={() => void addSuggestion()} disabled={!newId.trim() || busy}
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
            style={{ background: "var(--dm-btn-primary-bg)" }}>
            <Plus size={14} /> Registrar
          </button>
        </div>

        {suggestions.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5">
            {suggestions.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-xl border px-3 py-2"
                style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)" }}>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>
                  act_{s.id}{s.label && s.label !== s.id ? ` · ${s.label}` : ""}
                </span>
                <button type="button" onClick={() => void removeSuggestion(s.id)} disabled={busy} title="Remover"
                  className="flex h-7 w-7 items-center justify-center rounded-md transition hover:opacity-70" style={{ color: "#EE5D50" }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-[13px] font-bold" style={{ color: "var(--dm-text-primary)" }}>Descobrir contas do Meta</p>
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--dm-text-tertiary)" }}>
              Lista todas as contas de anúncio que o token da empresa enxerga (app + Business Manager vinculada).
            </p>
          </div>
          <button type="button" onClick={() => void discover()} disabled={discovering}
            className="flex h-10 flex-shrink-0 items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
            style={{ background: "var(--dm-btn-primary-bg)" }}>
            {discovering ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Carregar contas
          </button>
        </div>

        {discovered !== null && (
          <div className="mt-3 flex flex-col gap-1.5">
            {discovered.length === 0 && (
              <p className="text-[12px]" style={{ color: "var(--dm-text-tertiary)" }}>O token não enxerga nenhuma conta de anúncio.</p>
            )}
            {discovered.map((a) => {
              const id = a.id.replace(/^act_/, "");
              const already = suggestions.some((s) => s.id === id);
              return (
                <div key={a.id} className="flex items-center gap-2.5 rounded-xl border px-3 py-2"
                  style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)" }}>
                  <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: a.account_status === 1 ? "#22C55E" : "#94A3B8" }}
                    title={a.account_status === 1 ? "Ativa" : "Inativa"} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>
                    {a.name} <span className="font-normal" style={{ color: "var(--dm-text-tertiary)" }}>· act_{id} · {a.currency}</span>
                  </span>
                  {already ? (
                    <span className="flex items-center gap-1 text-[11px] font-bold" style={{ color: "#22C55E" }}><Check size={12} /> Registrada</span>
                  ) : (
                    <button type="button" onClick={() => void saveSuggestion(id, a.name)} disabled={busy}
                      className="flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-bold transition hover:opacity-80 disabled:opacity-40"
                      style={{ background: "var(--dm-primary-soft, rgba(22,163,74,0.12))", color: "var(--dm-primary)" }}>
                      <Plus size={12} /> Adicionar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <h2 className="mb-2 mt-8 text-[13px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
        Contas conectadas (acopladas a filtros)
      </h2>
      {entries === null ? (
        <Card><Loader2 size={16} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} /></Card>
      ) : entries.length === 0 ? (
        <Card><p className="text-[13px]" style={{ color: "var(--dm-text-tertiary)" }}>Nenhuma conta conectada ainda nesta empresa.</p></Card>
      ) : (
        <div className="flex flex-col gap-1.5">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between rounded-xl border px-4 py-2.5"
              style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)", opacity: e.isEnabled ? 1 : 0.55 }}>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>
                {e.label || `act_${e.adAccountId}`}
              </span>
              <span className="text-[11px] tabular-nums" style={{ color: "var(--dm-text-tertiary)" }}>act_{e.adAccountId}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Instagram ──────────────────────────────────────────────────────────────────

export function InstagramSection({ selected, reload }: ScopedProps) {
  if (!selected) return <><SectionHeader icon={Camera} title="Instagram" desc="Perfil IG de cada empresa" /><ScopeHint selected={selected} /></>;
  return (
    <div>
      <SectionHeader icon={Camera} title="Instagram" desc={`Perfil vinculado a ${selected.company.name}`} />
      <InstagramConnectShell company={selected.company} onSaved={() => void reload()} />
    </div>
  );
}

// ─── Filtros & histórico ────────────────────────────────────────────────────────

export function FiltrosSection({ selected, reload }: ScopedProps) {
  const [newFilter, setNewFilter] = useState("");
  const [newSub, setNewSub] = useState<Record<string, string>>({});
  const [newTab, setNewTab] = useState("");
  const [busy, setBusy] = useState(false);

  const filters = useMemo(() => readCompanyFilters(selected?.company.settings), [selected]);
  const customTabs = useMemo(() => readCustomHistoryTabs(selected?.company.settings), [selected]);

  if (!selected) return <><SectionHeader icon={SlidersHorizontal} title="Filtros & histórico" desc="Taxonomia dos dashboards por empresa" /><ScopeHint selected={selected} /></>;

  const saveSettings = async (patch: Record<string, unknown>) => {
    setBusy(true);
    try {
      await updateCompanySettings(selected.company.id, { ...selected.company.settings, ...patch });
      await reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao salvar."); }
    finally { setBusy(false); }
  };

  const addFilter = () => {
    const nm = newFilter.trim();
    if (!nm) return;
    const id = slugify(nm) || `f-${Date.now()}`;
    void saveSettings({ [COMPANY_FILTERS_KEY]: [...filters, { id, name: nm, subfilters: [] }] });
    // Materializa a categoria no dashboard da empresa (propagação imediata pro
    // Painel de Controle / Conectar conta). Falha silenciosa: o template
    // dinâmico do ControlPanel cobre quando o membro abrir o painel.
    void upsertUserCategory({ slug: id, name: nm, type: "fixed", emoji: "🏷️", position: filters.length, companyId: selected.company.id }).catch(() => {});
    setNewFilter("");
  };

  const removeFilter = (id: string) =>
    void saveSettings({ [COMPANY_FILTERS_KEY]: filters.filter((f) => f.id !== id) });

  const addSub = (id: string) => {
    const nm = (newSub[id] ?? "").trim();
    if (!nm) return;
    void saveSettings({
      [COMPANY_FILTERS_KEY]: filters.map((f) => (f.id === id ? { ...f, subfilters: [...f.subfilters, nm] } : f)),
    });
    setNewSub((p) => ({ ...p, [id]: "" }));
  };

  const removeSub = (id: string, sub: string) =>
    void saveSettings({
      [COMPANY_FILTERS_KEY]: filters.map((f) => (f.id === id ? { ...f, subfilters: f.subfilters.filter((s) => s !== sub) } : f)),
    });

  const addTab = () => {
    const nm = newTab.trim();
    if (!nm) return;
    const tab: CustomHistoryTab = { id: slugify(nm) || `tab-${Date.now()}`, label: nm };
    void saveSettings({ [CUSTOM_HISTORY_TABS_KEY]: [...customTabs, tab] });
    setNewTab("");
  };

  const removeTab = (id: string) =>
    void saveSettings({ [CUSTOM_HISTORY_TABS_KEY]: customTabs.filter((t) => t.id !== id) });

  return (
    <div>
      <SectionHeader icon={SlidersHorizontal} title="Filtros & histórico" desc={`Taxonomia de ${selected.company.name}`} />

      {/* Filtros + subfiltros */}
      <Card>
        <p className="mb-1 text-[13px] font-bold" style={{ color: "var(--dm-text-primary)" }}>Filtros da empresa</p>
        <p className="mb-3 text-[11px] leading-relaxed" style={{ color: "var(--dm-text-tertiary)" }}>
          Ex.: Lançamentos, Eventos — cada filtro pode ter subfiltros (Pós-graduação, Info produtos…).
        </p>
        <div className="mb-3 flex gap-2">
          <input value={newFilter} onChange={(e) => setNewFilter(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addFilter(); }}
            placeholder="Novo filtro (ex.: Lançamentos)"
            className="h-10 min-w-0 flex-1 rounded-xl border px-3.5 text-[13px] outline-none" style={inputStyle} />
          <button type="button" onClick={addFilter} disabled={!newFilter.trim() || busy}
            className="flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
            style={{ background: "var(--dm-btn-primary-bg)" }}>
            <Plus size={13} /> Adicionar
          </button>
        </div>

        {filters.length === 0 && <p className="text-[12px]" style={{ color: "var(--dm-text-tertiary)" }}>Nenhum filtro ainda.</p>}
        <div className="flex flex-col gap-2">
          {filters.map((f) => (
            <div key={f.id} className="rounded-xl border p-3" style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)" }}>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px] font-bold" style={{ color: "var(--dm-text-primary)" }}>{f.name}</span>
                <button type="button" onClick={() => removeFilter(f.id)} disabled={busy} title="Excluir filtro"
                  className="flex h-7 w-7 items-center justify-center rounded-md transition hover:opacity-70" style={{ color: "#EE5D50" }}>
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {f.subfilters.map((s) => (
                  <span key={s} className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                    style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)", background: "var(--dm-bg-surface)" }}>
                    {s}
                    <button type="button" onClick={() => removeSub(f.id, s)} disabled={busy} title="Remover subfiltro"
                      style={{ color: "var(--dm-text-tertiary)" }}>
                      <X size={11} />
                    </button>
                  </span>
                ))}
                <input value={newSub[f.id] ?? ""} onChange={(e) => setNewSub((p) => ({ ...p, [f.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") addSub(f.id); }}
                  placeholder="+ subfiltro"
                  className="h-7 w-32 rounded-full border px-2.5 text-[11px] outline-none" style={inputStyle} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Abas do histórico */}
      <div className="mt-4">
        <Card>
          <div className="mb-1 flex items-center gap-2">
            <History size={14} style={{ color: "var(--dm-text-secondary)" }} />
            <p className="text-[13px] font-bold" style={{ color: "var(--dm-text-primary)" }}>Abas do histórico</p>
          </div>
          <p className="mb-3 text-[11px] leading-relaxed" style={{ color: "var(--dm-text-tertiary)" }}>
            As 4 padrão vêm de fábrica; abas custom são desta empresa.
          </p>
          {/* Abas padrão: liga/desliga (enabledHistoryKinds) e renomeia (historyTabLabels) */}
          <div className="mb-3 flex flex-col gap-1.5">
            {BUILTIN_HISTORY_KINDS.map((k) => {
              const enabledList = Array.isArray(selected.company.settings?.enabledHistoryKinds)
                ? (selected.company.settings.enabledHistoryKinds as string[])
                : [...BUILTIN_HISTORY_KINDS];
              const on = enabledList.includes(k);
              const labels = (selected.company.settings?.historyTabLabels ?? {}) as Record<string, string>;
              return (
                <div key={k} className="flex items-center gap-2 rounded-xl border px-3 py-2"
                  style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)", opacity: on ? 1 : 0.55 }}>
                  <input
                    defaultValue={labels[k] ?? HISTORICAL_KIND_LABELS[k]}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v === (labels[k] ?? HISTORICAL_KIND_LABELS[k])) return;
                      void saveSettings({ historyTabLabels: { ...labels, [k]: v || HISTORICAL_KIND_LABELS[k] } });
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    className="h-7 min-w-0 flex-1 rounded-lg border-none bg-transparent px-1 text-[12.5px] font-semibold outline-none"
                    style={{ color: "var(--dm-text-primary)" }}
                    title="Clique pra renomear a aba"
                  />
                  <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: "rgba(100,116,139,0.14)", color: "var(--dm-text-tertiary)" }}>padrão</span>
                  <button type="button" disabled={busy} aria-pressed={on}
                    onClick={() => void saveSettings({
                      enabledHistoryKinds: on ? enabledList.filter((x) => x !== k) : [...enabledList, k],
                    })}
                    className="relative h-5 w-9 flex-shrink-0 rounded-full transition disabled:opacity-60"
                    style={{ background: on ? "var(--dm-primary)" : "var(--dm-border-default)" }}
                    title={on ? "Aba visível" : "Aba oculta"}>
                    <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all" style={{ left: on ? "18px" : "2px" }} />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {customTabs.map((t) => (
              <span key={t.id} className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold"
                style={{ borderColor: "var(--dm-primary)", color: "var(--dm-primary)", background: "var(--dm-primary-soft, rgba(22,163,74,0.10))" }}>
                {t.emoji ? `${t.emoji} ` : ""}{t.label}
                <button type="button" onClick={() => removeTab(t.id)} disabled={busy} title="Remover aba">
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={newTab} onChange={(e) => setNewTab(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addTab(); }}
              placeholder="Nova aba (ex.: Mentorias)"
              className="h-10 min-w-0 flex-1 rounded-xl border px-3.5 text-[13px] outline-none" style={inputStyle} />
            <button type="button" onClick={addTab} disabled={!newTab.trim() || busy}
              className="flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
              style={{ background: "var(--dm-btn-primary-bg)" }}>
              <Plus size={13} /> Adicionar
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── PipeFlow (funis do CRM da empresa selecionada) ─────────────────────────────
// Unificação do painel: o super admin enxerga e gerencia o básico do CRM de
// qualquer empresa daqui (RLS: migration 075). Gestão fina continua no /crm.

const STAGE_DOT: Record<string, string> = {
  emerald: "#10B981", rose: "#F43F5E", slate: "#94A3B8", sky: "#0EA5E9",
  amber: "#F59E0B", violet: "#8B5CF6", lime: "#84CC16", blue: "#3B82F6",
};

export function PipeFlowSection({ selected }: ScopedProps) {
  const [pipelines, setPipelines] = useState<CrmPipeline[] | null>(null);
  const [stats, setStats] = useState<CrmStats | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (companyId: string) => {
    const [p, s] = await Promise.all([
      fetchPipelines(companyId),
      fetchCrmStats(companyId).catch(() => null),
    ]);
    setPipelines(p);
    setStats(s);
  };

  useEffect(() => {
    setPipelines(null); setStats(null);
    if (!selected) return;
    let active = true;
    void load(selected.company.id).catch((e) => {
      if (!active) return;
      setPipelines([]);
      toast.error(e instanceof Error ? e.message : "Erro ao carregar o CRM (rodou a migration 075?).");
    });
    return () => { active = false; };
  }, [selected]);

  if (!selected) return <><SectionHeader icon={Users} title="PipeFlow · Funis" desc="CRM da empresa selecionada" /><ScopeHint selected={selected} /></>;

  const hasPipe = (selected.company.products ?? []).includes("pipe");

  const createDefault = async () => {
    setBusy(true);
    try { await ensureDefaultPipeline(selected.company.id); await load(selected.company.id); toast.success("Funil Principal criado."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao criar funil."); }
    finally { setBusy(false); }
  };

  const removePipeline = async (p: CrmPipeline) => {
    if (!confirm(`Excluir o funil "${p.name}" de ${selected.company.name}? Os negócios dele somem do Kanban.`)) return;
    setBusy(true);
    try { await deletePipeline(p.id, selected.company.id); await load(selected.company.id); toast.success("Funil excluído."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao excluir funil."); }
    finally { setBusy(false); }
  };

  const dealsByPipeline = new Map<string, number>();
  for (const d of stats?.deals ?? []) dealsByPipeline.set(d.pipelineId, (dealsByPipeline.get(d.pipelineId) ?? 0) + 1);

  return (
    <div>
      <SectionHeader icon={Users} title="PipeFlow · Funis" desc={`CRM de ${selected.company.name}`}
        right={
          <a href="/crm" className="flex h-10 items-center gap-1.5 rounded-xl border px-4 text-xs font-bold transition hover:opacity-80"
            style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-primary)" }}>
            Abrir PipeFlow →
          </a>
        } />

      {!hasPipe && (
        <Card className="mb-4">
          <p className="text-[13px]" style={{ color: "#F4A60D" }}>
            Esta empresa ainda não tem o PipeFlow liberado. Ative em <b>Produtos &amp; acessos</b> — os dados abaixo só aparecem pro time depois disso.
          </p>
        </Card>
      )}

      {stats && (
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          {[
            ["Leads", stats.leadsCount],
            ["Leads no mês", stats.leadsThisMonth],
            ["Negócios", stats.deals.length],
          ].map(([label, n]) => (
            <Card key={String(label)}>
              <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>{label}</p>
              <p className="mt-1 text-[22px] font-bold tabular-nums" style={{ color: "var(--dm-text-primary)" }}>{n}</p>
            </Card>
          ))}
        </div>
      )}

      {pipelines === null ? (
        <Card><Loader2 size={16} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} /></Card>
      ) : pipelines.length === 0 ? (
        <Card>
          <p className="mb-3 text-[13px]" style={{ color: "var(--dm-text-tertiary)" }}>
            Nenhum funil ainda. Crie o padrão (Funil Principal com 6 etapas) pra empresa começar.
          </p>
          <button type="button" onClick={() => void createDefault()} disabled={busy}
            className="flex h-10 items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
            style={{ background: "var(--dm-btn-primary-bg)" }}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Criar funil padrão
          </button>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {pipelines.map((p) => (
            <Card key={p.id}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold" style={{ color: "var(--dm-text-primary)" }}>{p.name}</p>
                  <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
                    {p.stages.length} etapa{p.stages.length === 1 ? "" : "s"} · {dealsByPipeline.get(p.id) ?? 0} negócio{(dealsByPipeline.get(p.id) ?? 0) === 1 ? "" : "s"}
                  </p>
                </div>
                <button type="button" title="Excluir funil" onClick={() => void removePipeline(p)} disabled={busy}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition hover:bg-red-500/10 disabled:opacity-40"
                  style={{ color: "#EE5D50" }}>
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {p.stages.map((s) => (
                  <span key={s.id} className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                    style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: STAGE_DOT[s.color] ?? "#94A3B8" }} />
                    {s.name}
                  </span>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
