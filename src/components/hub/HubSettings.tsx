"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  X, UserRound, Building2, KeyRound, Megaphone, SlidersHorizontal, History, Radar, Users,
  LogOut, Loader2, Save, ShieldCheck, Lock, Unlock, CheckCircle2, Plus, Sparkles,
  ArrowLeft, ArrowRight, Mail, PartyPopper, Camera, Link2, ChevronDown, Check, Trash2,
} from "lucide-react";
import { useAvatarUrl, resolveAvatarSrc, AVATAR_ICON_COUNT } from "@/hooks/useAvatarUrl";
import { useTheme } from "next-themes";
import {
  useCompany, readAdAccountSuggestions, fetchCompanyToken, fetchCompanyMembers, createCompany,
  type CompanyMember, type Company, type CompanyRole,
} from "@/hooks/useCompany";
import { useDevMode } from "@/hooks/useDevMode";
import { toast } from "@/hooks/useToast";
import { readCustomHistoryTabs } from "@/types/historical";
import {
  IdentidadeSection, ConexaoSection, ContasSection, HistoricoSection, TrackingSection, EquipeSection,
} from "@/components/CompanyStudio";
import { CampaignCenter } from "@/components/CampaignCenter";
import type { UserCategory } from "@/types/userConfig";

type NavId = "perfil" | "identidade" | "conexao" | "contas" | "instagram" | "filtros" | "historico" | "tracking" | "colaboradores" | "devacesso" | "criarempresa";

interface HubSettingsProps {
  open: boolean;
  onClose: () => void;
  userName: string;
  email: string;
  onUpdateProfile?: (name: string) => Promise<void>;
  onSignOut?: () => void;
  categories?: UserCategory[];
}

const NAV: { group: string; items: { id: NavId; label: string; icon: typeof UserRound; sub: string }[] }[] = [
  { group: "Conta", items: [
    { id: "perfil", label: "Perfil", icon: UserRound, sub: "Seu nome e dados de acesso" },
  ]},
  { group: "Empresa", items: [
    { id: "identidade", label: "Geral",     icon: Building2,        sub: "Nome e identidade da empresa" },
    { id: "conexao",    label: "Conexão Meta", icon: KeyRound,      sub: "Token de acesso da API" },
    { id: "contas",     label: "Contas de anúncio", icon: Megaphone, sub: "ID da conta (ACT) desta empresa" },
    { id: "instagram",  label: "Instagram", icon: Camera, sub: "Conta IG desta empresa" },
    { id: "filtros",    label: "Filtros",   icon: SlidersHorizontal, sub: "Filtros ativos do dashboard" },
    { id: "historico",  label: "Histórico", icon: History,          sub: "Sub-abas e layout de dados" },
    { id: "tracking",      label: "Tracking",      icon: Radar,  sub: "Pixel server-side e Eduzz" },
    { id: "colaboradores", label: "Colaboradores", icon: Users,  sub: "Membros e papéis da empresa" },
  ]},
  { group: "Avançado", items: [
    { id: "devacesso",  label: "Acesso DEV", icon: Lock,            sub: "Senha que libera acesso total" },
  ]},
];

const ADMIN_GROUP = { group: "Admin", items: [
  { id: "criarempresa" as NavId, label: "Criar empresa", icon: Plus, sub: "Provisionar acesso p/ novo cliente" },
]};

export function HubSettings({ open, onClose, userName, email, onUpdateProfile, onSignOut, categories = [] }: HubSettingsProps) {
  const [nav, setNav] = useState<NavId>("perfil");
  const { isSuperAdmin } = useCompany();
  const { active: devActive } = useDevMode();
  const groups = (isSuperAdmin || devActive) ? [...NAV, ADMIN_GROUP] : NAV;

  // Esc fecha + trava scroll do body
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      style={{ background: "rgba(8,10,6,0.55)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Configurações"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-[1000px] overflow-hidden rounded-2xl border shadow-[0_40px_120px_-30px_rgba(0,0,0,0.6)]"
        style={{ height: "min(86vh, 720px)", background: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}
      >
        {/* ── Nav lateral ──────────────────────────────────────────── */}
        <aside className="flex w-[248px] flex-shrink-0 flex-col border-r" style={{ background: "var(--dm-bg-elevated)", borderColor: "var(--dm-border-default)" }}>
          <div className="px-5 py-5">
            <p className="text-[15px] font-bold" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>Configurações</p>
            <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>{email}</p>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 pb-3">
            {groups.map((g) => (
              <div key={g.group} className="mb-4">
                <p className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>{g.group}</p>
                {g.items.map((it) => {
                  const active = nav === it.id;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => setNav(it.id)}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors"
                      style={{
                        background: active ? "var(--dm-bg-surface)" : "transparent",
                        boxShadow: active ? "inset 0 0 0 1px var(--dm-border-default)" : "none",
                      }}
                    >
                      <it.icon size={16} style={{ color: active ? "var(--dm-text-primary)" : "var(--dm-text-tertiary)" }} />
                      <span className="text-[13px] font-semibold" style={{ color: active ? "var(--dm-text-primary)" : "var(--dm-text-secondary)" }}>{it.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="m-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors hover:bg-red-500/10"
              style={{ color: "#ef4444" }}
            >
              <LogOut size={15} /> Sair da conta
            </button>
          )}
        </aside>

        {/* ── Conteúdo ─────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col">
          <Header onClose={onClose} />
          <div className="flex-1 overflow-y-auto px-7 py-6">
            {nav === "perfil"
              ? <PerfilSection userName={userName} email={email} onUpdateProfile={onUpdateProfile} />
              : nav === "devacesso"
              ? <DevAccessSection />
              : nav === "criarempresa"
              ? <CriarEmpresaSection />
              : <EmpresaSections nav={nav} categories={categories} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function Header({ onClose }: { onClose: () => void }) {
  const { company, role, isSuperAdmin } = useCompany();
  return (
    <div className="flex items-center justify-between border-b px-7 py-4" style={{ borderColor: "var(--dm-border-default)" }}>
      <div className="min-w-0">
        <p className="truncate text-[15px] font-bold" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
          {company?.name ?? "Conta"}
        </p>
        <p className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
          {role === "owner" ? "Dono" : role === "manager" ? "Gestor" : role === "viewer" ? "Visualização" : "—"}
          {isSuperAdmin && <span className="inline-flex items-center gap-1 font-semibold" style={{ color: "#22C55E" }}><ShieldCheck size={11} /> super admin</span>}
        </p>
      </div>
      <button type="button" onClick={onClose} aria-label="Fechar" className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5" style={{ color: "var(--dm-text-tertiary)" }}>
        <X size={18} />
      </button>
    </div>
  );
}

// ─── Perfil (Conta) ────────────────────────────────────────────────────────────

function PerfilSection({ userName, email, onUpdateProfile }: { userName: string; email: string; onUpdateProfile?: (name: string) => Promise<void> }) {
  const [name, setName] = useState(userName);
  const [saving, setSaving] = useState(false);
  useEffect(() => setName(userName), [userName]);
  const initials = userName.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "U";
  const dirty = name.trim() !== userName.trim() && name.trim().length > 0;
  const save = async () => {
    if (!dirty || !onUpdateProfile) return;
    setSaving(true);
    try { await onUpdateProfile(name.trim()); } finally { setSaving(false); }
  };

  // Avatar: foto enviada ou ícone do sistema (/avatars/N W.webp).
  const { avatarUrl, updateAvatar } = useAvatarUrl();
  const { resolvedTheme } = useTheme();
  const resolvedAvatarSrc = resolveAvatarSrc(avatarUrl, resolvedTheme === "dark");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [avatarErr, setAvatarErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const MAX_BYTES = 5 * 1024 * 1024;
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarErr(null);
    if (file.size > MAX_BYTES) { setAvatarErr("Foto muito grande. Máximo: 5 MB."); e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => { updateAvatar(reader.result as string); setPickerOpen(false); };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="max-w-[520px]">
      <div className="mb-6 flex items-center gap-4">
        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            title="Alterar foto de perfil"
            className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full text-lg font-bold text-white transition hover:opacity-85"
            style={{ background: "var(--dm-primary)" }}
          >
            {resolvedAvatarSrc
              ? <img src={resolvedAvatarSrc} alt="Avatar" className="h-full w-full object-cover" />
              : <span>{initials}</span>}
          </button>
          <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2"
            style={{ background: "var(--dm-primary)", borderColor: "var(--dm-bg-surface)" }}>
            <Camera size={11} className="text-white" />
          </span>
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={onFile} />
        <div>
          <p className="text-[16px] font-bold" style={{ color: "var(--dm-text-primary)" }}>{userName || "Usuário"}</p>
          <p className="text-[12px]" style={{ color: "var(--dm-text-tertiary)" }}>{email}</p>
        </div>
      </div>

      {pickerOpen && (
        <AvatarPickerModal
          initials={initials}
          avatarUrl={avatarUrl}
          resolvedAvatarSrc={resolvedAvatarSrc}
          avatarErr={avatarErr}
          onUpload={() => fileRef.current?.click()}
          onPickIcon={(n) => { updateAvatar(`icon:${n}`); setPickerOpen(false); setAvatarErr(null); }}
          onRemove={() => { updateAvatar(null); setPickerOpen(false); setAvatarErr(null); }}
          onClose={() => { setPickerOpen(false); setAvatarErr(null); }}
        />
      )}

      <label className="mb-1.5 block text-[12px] font-semibold" style={{ color: "var(--dm-text-secondary)" }}>Nome de exibição</label>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!onUpdateProfile}
          className="h-11 flex-1 rounded-xl border px-3.5 text-[13px] outline-none disabled:opacity-60"
          style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}
        />
        {onUpdateProfile && (
          <button type="button" onClick={() => void save()} disabled={!dirty || saving}
            className="flex h-11 items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-40"
            style={{ background: "var(--dm-btn-primary-bg)" }}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Salvar
          </button>
        )}
      </div>

      <label className="mb-1.5 mt-5 block text-[12px] font-semibold" style={{ color: "var(--dm-text-secondary)" }}>Email</label>
      <input value={email} disabled className="h-11 w-full rounded-xl border px-3.5 text-[13px] opacity-60 outline-none"
        style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }} />
    </div>
  );
}

// Modal de seleção de avatar: enviar foto ou escolher ícone do sistema.
function AvatarPickerModal({ initials, avatarUrl, resolvedAvatarSrc, avatarErr, onUpload, onPickIcon, onRemove, onClose }: {
  initials: string; avatarUrl: string | null; resolvedAvatarSrc: string | null; avatarErr: string | null;
  onUpload: () => void; onPickIcon: (n: number) => void; onRemove: () => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full rounded-2xl p-6 shadow-2xl"
        style={{ maxWidth: 380, background: "var(--dm-bg-surface)", border: "1px solid var(--dm-border-default)" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 text-center">
          <h3 className="text-[17px] font-bold" style={{ color: "var(--dm-text-primary)" }}>Escolher foto</h3>
          <p className="mt-1 text-[13px]" style={{ color: "var(--dm-text-tertiary)" }}>JPG, PNG, WebP, GIF · Máx. 5 MB</p>
        </div>

        <div className="mb-5 flex justify-center">
          <div className="h-20 w-20 overflow-hidden rounded-full" style={{ boxShadow: "0 0 0 3px var(--dm-primary-soft)" }}>
            {resolvedAvatarSrc
              ? <img src={resolvedAvatarSrc} alt="Avatar atual" className="h-full w-full object-cover" />
              : <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-white"
                  style={{ background: "linear-gradient(135deg, var(--dm-primary) 0%, var(--dm-primary-vivid) 100%)" }}>
                  {initials}
                </div>}
          </div>
        </div>

        {avatarErr && (
          <p className="mb-3 rounded-lg px-3 py-2 text-center text-[12px] font-medium" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>{avatarErr}</p>
        )}

        <div className="flex flex-col gap-2">
          <button type="button" onClick={onUpload}
            className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[14px] font-semibold text-white transition hover:opacity-90"
            style={{ background: "var(--dm-primary)" }}>
            <Camera size={16} /> Enviar foto
          </button>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Ícones do sistema</p>
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: AVATAR_ICON_COUNT }, (_, i) => {
                const n = i + 1;
                const selected = avatarUrl === `icon:${n}`;
                return (
                  <button key={n} type="button" title={`Ícone ${n}`} onClick={() => onPickIcon(n)}
                    className="aspect-square overflow-hidden rounded-xl transition hover:scale-105 hover:opacity-90"
                    style={{ border: selected ? "2px solid var(--dm-primary)" : "2px solid var(--dm-border-default)", boxShadow: selected ? "0 0 0 3px var(--dm-primary-soft)" : undefined }}>
                    <img src={`/avatars/${n} W.webp`} alt={`Ícone ${n}`} className="h-full w-full object-cover" />
                  </button>
                );
              })}
            </div>
          </div>

          {avatarUrl && (
            <button type="button" onClick={onRemove}
              className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[14px] font-semibold transition hover:opacity-80"
              style={{ background: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)", border: "1px solid var(--dm-border-default)" }}>
              <Trash2 size={14} /> Remover foto
            </button>
          )}

          <button type="button" onClick={onClose} className="mt-1 rounded-xl px-4 py-2.5 text-[13px] transition hover:opacity-70" style={{ color: "var(--dm-text-tertiary)" }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Acesso DEV (senha → libera acesso total) ───────────────────────────────────

function DevAccessSection() {
  const { active, enable, disable } = useDevMode();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);

  const submit = () => {
    if (enable(pw)) { setPw(""); setErr(false); toast.success("Acesso DEV liberado. Você vê e edita todas as empresas."); }
    else { setErr(true); }
  };

  return (
    <div className="max-w-[520px]">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: active ? "rgba(5,205,153,0.12)" : "rgba(22,163,74,0.12)" }}>
          {active ? <Unlock size={19} style={{ color: "#05CD99" }} /> : <Lock size={19} style={{ color: "#16A34A" }} />}
        </div>
        <div>
          <p className="text-[16px] font-bold" style={{ color: "var(--dm-text-primary)" }}>Acesso DEV</p>
          <p className="text-[12px]" style={{ color: "var(--dm-text-tertiary)" }}>Senha que libera acesso total a todas as empresas e configurações.</p>
        </div>
      </div>

      {active ? (
        <div className="rounded-2xl border p-5" style={{ borderColor: "rgba(5,205,153,0.4)", background: "rgba(5,205,153,0.06)" }}>
          <p className="mb-3 flex items-center gap-2 text-[13px] font-semibold" style={{ color: "#05CD99" }}>
            <CheckCircle2 size={16} /> Acesso liberado
          </p>
          <p className="mb-4 text-[12px]" style={{ color: "var(--dm-text-secondary)" }}>
            Você é tratado como dono em qualquer empresa e vê todas no seletor.
          </p>
          <button type="button" onClick={disable}
            className="flex h-10 items-center gap-1.5 rounded-xl border px-4 text-xs font-bold transition hover:bg-black/5 dark:hover:bg-white/5"
            style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
            <Lock size={13} /> Bloquear acesso DEV
          </button>
        </div>
      ) : (
        <>
          <label className="mb-1.5 block text-[12px] font-semibold" style={{ color: "var(--dm-text-secondary)" }}>Senha de acesso</label>
          <div className="flex gap-2">
            <input
              type="password" value={pw}
              onChange={(e) => { setPw(e.target.value); setErr(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder="Digite a senha DEV"
              className="h-11 flex-1 rounded-xl border px-3.5 text-[13px] outline-none"
              style={{ borderColor: err ? "#ef4444" : "var(--dm-border-default)", background: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}
            />
            <button type="button" onClick={submit} disabled={!pw.trim()}
              className="flex h-11 items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-40"
              style={{ background: "var(--dm-btn-primary-bg)" }}>
              <Unlock size={13} /> Liberar
            </button>
          </div>
          {err && <p className="mt-2 text-[12px] font-medium" style={{ color: "#ef4444" }}>Senha incorreta.</p>}
          <p className="mt-4 rounded-xl border p-3 text-[11px] leading-relaxed" style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)" }}>
            Portão de conveniência (UI). As políticas de segurança do servidor (RLS) continuam valendo — escrever em dados de outra empresa ainda exige ser membro dela no banco.
          </p>
        </>
      )}
    </div>
  );
}

// ─── Criar empresa (super admin → provisiona cliente novo) ──────────────────────

const WIZARD_STEPS = [
  { icon: Building2, label: "Identidade" },
  { icon: Mail,      label: "Acesso" },
  { icon: CheckCircle2, label: "Revisar" },
];

function CriarEmpresaSection() {
  const { switchCompany } = useCompany();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ name: string; email: string } | null>(null);

  const emailValid = !ownerEmail.trim() || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail.trim());
  const canNext = step === 0 ? name.trim().length > 0 : step === 1 ? emailValid : true;

  const submit = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const company = await createCompany(name.trim(), ownerEmail.trim() || undefined);
      switchCompany(company.id);
      setCreated({ name: company.name, email: ownerEmail.trim() });
      toast.success(`Empresa "${company.name}" criada.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar empresa.");
    } finally { setCreating(false); }
  };

  const reset = () => { setCreated(null); setStep(0); setName(""); setOwnerEmail(""); };

  // ── Sucesso ──
  if (created) {
    return (
      <div className="max-w-[520px]">
        <div className="rounded-2xl border p-6 text-center" style={{ borderColor: "rgba(5,205,153,0.4)", background: "rgba(5,205,153,0.06)" }}>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "rgba(5,205,153,0.14)" }}>
            <PartyPopper size={22} style={{ color: "#05CD99" }} />
          </div>
          <p className="text-[16px] font-bold" style={{ color: "var(--dm-text-primary)" }}>Empresa criada!</p>
          <p className="mt-1 text-[12px]" style={{ color: "var(--dm-text-secondary)" }}>
            <strong>{created.name}</strong> já está ativa no seletor.{created.email ? ` Acesso de dono liberado para ${created.email}.` : ""}
          </p>
          <p className="mt-3 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
            Agora configure Conexão Meta, Filtros e Tracking nas abas de Empresa.
          </p>
          <button type="button" onClick={reset}
            className="mt-5 flex h-10 items-center gap-1.5 rounded-xl border px-4 text-xs font-bold transition hover:bg-black/5 dark:hover:bg-white/5 mx-auto"
            style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
            <Plus size={13} /> Criar outra empresa
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[520px]">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: "rgba(22,163,74,0.12)" }}>
          <Sparkles size={19} style={{ color: "#16A34A" }} />
        </div>
        <div>
          <p className="text-[16px] font-bold" style={{ color: "var(--dm-text-primary)" }}>Criar empresa</p>
          <p className="text-[12px]" style={{ color: "var(--dm-text-tertiary)" }}>Provisiona uma empresa nova e libera o acesso pro cliente.</p>
        </div>
      </div>

      {/* Stepper */}
      <div className="mb-6 flex items-center">
        {WIZARD_STEPS.map((s, i) => {
          const done = i < step, active = i === step;
          return (
            <div key={s.label} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <div className="flex h-8 w-8 items-center justify-center rounded-full text-white transition-colors"
                  style={{ background: done || active ? "#16A34A" : "var(--dm-bg-elevated)", color: done || active ? "#fff" : "var(--dm-text-tertiary)", border: done || active ? "none" : "1px solid var(--dm-border-default)" }}>
                  {done ? <CheckCircle2 size={15} /> : <s.icon size={15} />}
                </div>
                <span className="text-[10px] font-semibold" style={{ color: active ? "var(--dm-text-primary)" : "var(--dm-text-tertiary)" }}>{s.label}</span>
              </div>
              {i < WIZARD_STEPS.length - 1 && <div className="mx-2 h-px flex-1" style={{ background: done ? "#16A34A" : "var(--dm-border-default)" }} />}
            </div>
          );
        })}
      </div>

      {/* Conteúdo do passo */}
      {step === 0 && (
        <div>
          <label className="mb-1.5 block text-[12px] font-semibold" style={{ color: "var(--dm-text-secondary)" }}>Nome da empresa</label>
          <input
            autoFocus value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && canNext) setStep(1); }}
            placeholder="Ex: Loja do Cliente"
            className="h-11 w-full rounded-xl border px-3.5 text-[13px] outline-none"
            style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}
          />
          <p className="mt-2 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Como o cliente vai aparecer no seletor de empresas.</p>
        </div>
      )}

      {step === 1 && (
        <div>
          <label className="mb-1.5 block text-[12px] font-semibold" style={{ color: "var(--dm-text-secondary)" }}>
            Email do dono <span className="font-normal" style={{ color: "var(--dm-text-tertiary)" }}>(opcional)</span>
          </label>
          <input
            autoFocus type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && canNext) setStep(2); }}
            placeholder="cliente@email.com"
            className="h-11 w-full rounded-xl border px-3.5 text-[13px] outline-none"
            style={{ borderColor: emailValid ? "var(--dm-border-default)" : "#ef4444", background: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}
          />
          {!emailValid && <p className="mt-1.5 text-[11px] font-medium" style={{ color: "#ef4444" }}>Email inválido.</p>}
          <p className="mt-2 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
            Já tem conta → vira dono na hora. Senão → fica convite que ativa quando ele se cadastrar. Pode deixar em branco e convidar depois.
          </p>
        </div>
      )}

      {step === 2 && (
        <div className="rounded-2xl border p-4" style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)" }}>
          <p className="mb-3 text-[12px] font-bold" style={{ color: "var(--dm-text-primary)" }}>Revisar</p>
          <div className="flex items-center justify-between border-b py-2" style={{ borderColor: "var(--dm-border-default)" }}>
            <span className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Empresa</span>
            <span className="text-[12px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>{name.trim() || "—"}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Dono</span>
            <span className="text-[12px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>{ownerEmail.trim() || "Sem convite (você como super admin)"}</span>
          </div>
        </div>
      )}

      {/* Navegação */}
      <div className="mt-6 flex items-center justify-between">
        <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}
          className="flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition disabled:opacity-30"
          style={{ color: "var(--dm-text-secondary)" }}>
          <ArrowLeft size={14} /> Voltar
        </button>
        {step < 2 ? (
          <button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canNext}
            className="flex h-10 items-center gap-1.5 rounded-xl px-5 text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-40"
            style={{ background: "var(--dm-btn-primary-bg)" }}>
            Continuar <ArrowRight size={14} />
          </button>
        ) : (
          <button type="button" onClick={() => void submit()} disabled={creating || !name.trim()}
            className="flex h-10 items-center gap-1.5 rounded-xl px-5 text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-40"
            style={{ background: "var(--dm-btn-primary-bg)" }}>
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Criar empresa
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Seções de empresa (reuso da lógica do CompanyStudio) ───────────────────────

function EmpresaSections({ nav, categories }: { nav: NavId; categories: UserCategory[] }) {
  const { company, role, isOwner, canWrite, loading, memberships, switchCompany } = useCompany();
  const [token, setToken] = useState("");
  const [members, setMembers] = useState<CompanyMember[] | null>(null);

  useEffect(() => {
    if (!company) return;
    let active = true;
    void fetchCompanyToken(company.id).then((t) => { if (active) setToken(t); }).catch(() => {});
    void fetchCompanyMembers(company.id).then((m) => { if (active) setMembers(m); }).catch(() => { if (active) setMembers([]); });
    return () => { active = false; };
  }, [company]);

  const suggestions = useMemo(() => readAdAccountSuggestions(company?.settings), [company?.settings]);
  const customTabs = useMemo(() => readCustomHistoryTabs(company?.settings), [company?.settings]);
  const enabledFilters = categories.filter((c) => c.isEnabled);
  const totalTabs = 4 + customTabs.length; // 4 tipos padrão + customizadas

  if (loading) {
    return <div className="flex items-center justify-center gap-2 py-16"><Loader2 size={18} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} /><span className="text-sm" style={{ color: "var(--dm-text-tertiary)" }}>Carregando empresa…</span></div>;
  }
  if (!company) {
    return (
      <div className="rounded-2xl border p-10 text-center" style={{ background: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
        <Building2 size={28} className="mx-auto mb-3" style={{ color: "var(--dm-text-tertiary)" }} />
        <p className="mb-1 text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>Nenhuma empresa configurada</p>
        <p className="text-xs" style={{ color: "var(--dm-text-tertiary)" }}>Sua conta ainda não pertence a nenhuma empresa.</p>
      </div>
    );
  }

  const noop = () => {};
  const section = (() => {
    switch (nav) {
      case "identidade":
        return <IdentidadeSection company={company} canEdit={isOwner} open onToggle={noop} variant="panel" />;
      case "conexao":
        return (
          <div className="space-y-3">
            <FacebookConnectShell />
            <ConexaoSection company={company} canEdit={isOwner} token={token} onToken={setToken} open onToggle={noop} variant="panel" />
          </div>
        );
      case "contas":
        return (
          <div className="space-y-4">
            <ContasSection company={company} canEdit={isOwner} suggestions={suggestions} open onToggle={noop} variant="panel" />
            <div className="rounded-2xl border p-5" style={{ background: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
              <p className="mb-1 text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>Acoplar conta a um filtro</p>
              <p className="mb-4 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
                Em <strong style={{ color: "var(--dm-text-secondary)" }}>Conectar conta</strong> você liga o ACT a um filtro (existente ou novo) junto com nome e campanhas — tudo de uma vez.
              </p>
              <CampaignCenter />
            </div>
          </div>
        );
      case "instagram":
        return <InstagramShell />;
      case "historico":
        return <HistoricoSection company={company} canEdit={isOwner} customTabs={customTabs} totalTabs={totalTabs} open onToggle={noop} variant="panel" />;
      case "tracking":
        return <TrackingSection company={company} canEdit={canWrite} open onToggle={noop} variant="panel" />;
      case "colaboradores":
        return <EquipeSection company={company} canEdit={isOwner} members={members} setMembers={setMembers} open onToggle={noop} variant="panel" />;
      case "filtros":
        return (
          <div className="rounded-2xl border p-5" style={{ background: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
            <p className="mb-1 text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>Filtros ativos</p>
            <p className="mb-4 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Filtros habilitados aparecem no dashboard. Gerencie-os na aba de filtros do dashboard.</p>
            <div className="flex flex-wrap gap-1.5">
              {enabledFilters.length === 0
                ? <span className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Nenhum filtro habilitado.</span>
                : enabledFilters.map((f) => (
                    <span key={f.id} className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold" style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
                      <span>{f.emoji ?? "🏷️"}</span> {f.name}
                    </span>
                  ))}
            </div>
          </div>
        );
      default:
        return null;
    }
  })();

  return (
    <div className="space-y-4">
      <CompanyContextBar company={company} role={role} memberships={memberships} switchCompany={switchCompany} />
      {section}
    </div>
  );
}

// ─── Conexão do app (Facebook) — GLOBAL, vale pra todas as empresas ─────────────
// Shell de UI. O fluxo OAuth real (Facebook Login → token do app → puxar contas
// de anúncio + Instagram via Graph API) liga no ambiente com o Meta app.
function FacebookConnectShell() {
  const soon = () => toast.success("Conexão real do Facebook liga no ambiente com o Meta app configurado.");
  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)" }}>
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-default)" }}>
          <FacebookIcon />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>Conexão do app (Meta)</p>
            <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: "rgba(100,116,139,0.14)", color: "var(--dm-text-tertiary)" }}>global</span>
          </div>
          <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Conecta 1x e o token vale pra todas as empresas.</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: "rgba(244,166,13,0.14)", color: "#F4A60D" }}>
          Não conectado
        </span>
      </div>
      <button type="button" onClick={soon}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-xl text-xs font-bold text-white transition hover:opacity-90"
        style={{ background: "#1877F2" }}>
        <FacebookIcon light /> Conectar Facebook
      </button>
      <p className="mt-3 rounded-lg border p-2.5 text-[11px] leading-relaxed" style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)" }}>
        Um app conecta <strong style={{ color: "var(--dm-text-secondary)" }}>todas</strong> as contas de anúncio e Instagram. O token é o mesmo pra todo mundo —
        o que muda por empresa é só o <strong style={{ color: "var(--dm-text-secondary)" }}>ID da conta de anúncio (ACT)</strong>, na aba <em>Contas de anúncio</em>.
      </p>
    </div>
  );
}

// ─── Instagram (por empresa: escolhe qual conta IG é desta empresa) ─────────────
function InstagramShell() {
  const soon = () => toast.success("Lista de contas IG vem da conexão do app (Facebook), no ambiente real.");
  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)" }}>
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-default)" }}>
          <InstagramIcon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>Conta do Instagram</p>
          <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Qual perfil IG pertence a esta empresa.</p>
        </div>
      </div>
      <div className="mb-3 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-8 text-center" style={{ borderColor: "var(--dm-border-default)" }}>
        <InstagramIcon size={26} muted />
        <p className="text-[12px] font-semibold" style={{ color: "var(--dm-text-secondary)" }}>Nenhuma conta conectada</p>
        <p className="max-w-[300px] text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Conecte o app primeiro — as contas IG disponíveis aparecem aqui pra escolher.</p>
      </div>
      <button type="button" onClick={soon}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-xl text-xs font-bold text-white transition hover:opacity-90"
        style={{ background: "var(--dm-btn-primary-bg)" }}>
        <Link2 size={14} /> Conectar conta do Instagram
      </button>
    </div>
  );
}

function InstagramIcon({ size = 18, muted }: { size?: number; muted?: boolean }) {
  const c = muted ? "var(--dm-text-tertiary)" : "var(--dm-text-secondary)";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill={c} stroke="none" />
    </svg>
  );
}

function FacebookIcon({ light }: { light?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={light ? "#fff" : "#1877F2"} aria-hidden>
      <path d="M24 12c0-6.627-5.373-12-12-12S0 5.373 0 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874V12h3.328l-.532 3.469h-2.796v8.385C19.612 22.954 24 17.99 24 12z"/>
    </svg>
  );
}

// Barra de contexto: deixa SEMPRE visível qual empresa está sendo editada + troca rápida.
function roleLabelOf(role: CompanyRole | null) {
  return role === "owner" ? "Dono" : role === "manager" ? "Gestor" : role === "viewer" ? "Visualização" : "—";
}

function CompanyContextBar({ company, role, memberships, switchCompany }: {
  company: Company; role: CompanyRole | null;
  memberships: { company: Company; role: CompanyRole }[]; switchCompany: (id: string) => void;
}) {
  const multi = memberships.length > 1;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora / Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const pick = (id: string) => { switchCompany(id); setOpen(false); };

  return (
    <div
      ref={ref}
      className="relative flex items-center gap-3 rounded-xl border p-3"
      style={{ borderColor: open ? "var(--dm-accent, var(--dm-text-secondary))" : "var(--dm-border-default)", background: "var(--dm-bg-elevated)" }}
    >
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--dm-bg-surface)", border: "1px solid var(--dm-border-default)" }}>
        <Building2 size={18} style={{ color: "var(--dm-text-secondary)" }} />
      </div>

      <button
        type="button"
        onClick={() => multi && setOpen((v) => !v)}
        aria-haspopup={multi ? "listbox" : undefined}
        aria-expanded={multi ? open : undefined}
        disabled={!multi}
        className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none disabled:cursor-default"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Editando empresa</p>
          <p className="truncate text-[15px] font-bold" style={{ color: "var(--dm-text-primary)" }}>{company.name}</p>
        </div>
        {multi && (
          <ChevronDown
            size={18}
            className="flex-shrink-0 transition-transform"
            style={{ color: "var(--dm-text-tertiary)", transform: open ? "rotate(180deg)" : "none" }}
          />
        )}
      </button>

      <span className="flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: "var(--dm-bg-surface)", color: "var(--dm-text-secondary)", border: "1px solid var(--dm-border-default)" }}>{roleLabelOf(role)}</span>

      {multi && open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-xl border shadow-xl"
          style={{ background: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}
        >
          {memberships.map((m) => {
            const active = m.company.id === company.id;
            return (
              <button
                key={m.company.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => pick(m.company.id)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--dm-bg-elevated)]"
                style={active ? { background: "var(--dm-bg-elevated)" } : undefined}
              >
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-default)" }}>
                  <Building2 size={13} style={{ color: "var(--dm-text-secondary)" }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>{m.company.name}</p>
                  <p className="text-[10px] font-medium" style={{ color: "var(--dm-text-tertiary)" }}>{roleLabelOf(m.role)}</p>
                </div>
                {active && <Check size={16} className="flex-shrink-0" style={{ color: "var(--dm-text-primary)" }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
