"use client";

import { useRef, useState } from "react";
import { Camera, Trash2, UserRound, Bell, Lock, Sliders, KeyRound } from "lucide-react";
import { useDevMode } from "@/hooks/useDevMode";
import { useTheme } from "next-themes";
import { useAvatarUrl, resolveAvatarSrc, AVATAR_ICON_COUNT } from "@/hooks/useAvatarUrl";
import { TabProfile } from "@/components/ControlPanel";
import { useCompany, type CompanyRole } from "@/hooks/useCompany";
import { ArrowLeftRight, Building2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
// A configuração da empresa (painel de controle) saiu daqui — virou a aba de
// topo "Empresa" (EmpresaTab, só dono). Aqui ficam só coisas do usuário.

type AccountTab =
  | "profile"
  | "privacy"
  | "notifications"
  | "personalization";

/**
 * Abas do "usuário padrão" (não-dono). O dono ganha também "personalization".
 * Exportado para a sidebar do Dashboard filtrar igual — fonte única da regra.
 */
export const STANDARD_ACCOUNT_TABS: AccountTab[] = ["profile", "privacy", "notifications"];

/** Abas só do dono (modo dev/personalização). */
const OWNER_ONLY_TABS: AccountTab[] = ["personalization"];

export function accountTabsForRole(isOwner: boolean): AccountTab[] {
  return isOwner ? [...STANDARD_ACCOUNT_TABS, ...OWNER_ONLY_TABS] : STANDARD_ACCOUNT_TABS;
}

const ACCOUNT_ROLE_LABELS: Record<CompanyRole, string> = {
  owner: "Dono", manager: "Gestor de tráfego", viewer: "Visualização",
};
const ACCOUNT_ROLE_COLORS: Record<CompanyRole, string> = { owner: "#8b5cf6", manager: "#10b981", viewer: "#64748b" };

interface MyAccountProps {
  userName:           string;
  userEmail:          string;
  onUpdateProfile:    (name: string)                => Promise<void>;
  onSignOut:          ()                            => Promise<void>;
  /** Controlled tab — lifted to Dashboard for sidebar nav */
  activeTab?:         AccountTab;
  onTabChange?:       (tab: AccountTab) => void;
}

// ─── Sub-tab definitions ──────────────────────────────────────────────────────

const TABS: { id: AccountTab; label: string }[] = [
  { id: "profile",         label: "Meu perfil"     },
  { id: "privacy",         label: "Privacidade"    },
  { id: "notifications",   label: "Notificações"   },
  { id: "personalization", label: "Personalização" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join("");
}

// ─── Placeholder tabs ─────────────────────────────────────────────────────────

function TabPrivacy() {
  const items = [
    { label: "Comunicações por e-mail",   sub: "Receba atualizações e novidades por e-mail." },
    { label: "Dados analíticos",          sub: "Ajude a melhorar o produto compartilhando dados de uso." },
    { label: "Recomendações",             sub: "Receba sugestões personalizadas com base no seu uso." },
    { label: "Visibilidade do perfil",    sub: "Controle quem pode ver suas informações de perfil." },
  ];
  return (
    <div className="space-y-3">
      {items.map(item => (
        <div
          key={item.label}
          className="flex items-center justify-between rounded-xl p-4"
          style={{ background: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-subtle)" }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>{item.label}</p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--dm-text-tertiary)" }}>{item.sub}</p>
          </div>
          {/* Toggle visual */}
          <span
            className="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full"
            style={{ background: "var(--dm-border-strong)" }}
          >
            <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow" />
          </span>
        </div>
      ))}
    </div>
  );
}

function TabNotifications() {
  const items = [
    { label: "Alertas de sincronização",  sub: "Notifique quando uma sincronização for concluída." },
    { label: "Erros de integração",       sub: "Avise sobre falhas na conexão com o Meta Ads." },
    { label: "Relatórios semanais",       sub: "Receba um resumo semanal da performance das campanhas." },
    { label: "Avisos importantes",        sub: "Alertas críticos do sistema e atualizações da plataforma." },
  ];
  return (
    <div className="space-y-3">
      {items.map(item => (
        <div
          key={item.label}
          className="flex items-center justify-between rounded-xl p-4"
          style={{ background: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-subtle)" }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>{item.label}</p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--dm-text-tertiary)" }}>{item.sub}</p>
          </div>
          <span
            className="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full"
            style={{ background: "var(--dm-border-strong)" }}
          >
            <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow" />
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Dev/preview storage key ─────────────────────────────────────────────────
const DEV_PREVIEW_KEY = "dm_dev_preview_enabled";

function TabPersonalization() {
  const [devPreview, setDevPreview] = useState<boolean>(() => {
    try { return localStorage.getItem(DEV_PREVIEW_KEY) === "1"; } catch { return false; }
  });

  const toggle = () => {
    const next = !devPreview;
    setDevPreview(next);
    try { localStorage.setItem(DEV_PREVIEW_KEY, next ? "1" : "0"); } catch {}
  };

  // ── Modo DEV (acesso total, protegido por senha) ──
  const { active: devActive, enable: enableDev, disable: disableDev } = useDevMode();
  const [pwd, setPwd] = useState("");
  const [pwdError, setPwdError] = useState(false);

  const handleEnableDev = () => {
    if (enableDev(pwd)) {
      setPwd("");
      setPwdError(false);
    } else {
      setPwdError(true);
    }
  };

  const items: { key: string; label: string; sub: string; value: boolean; onChange: () => void }[] = [
    {
      key: "devPreview",
      label: "Modo Dev Preview",
      sub: "Exibe indicadores de desenvolvimento e informações técnicas na interface. Recarregue a página após ativar.",
      value: devPreview,
      onChange: toggle,
    },
  ];

  return (
    <div className="space-y-3">
      {items.map(item => (
        <div
          key={item.key}
          className="flex items-center justify-between rounded-xl p-4"
          style={{ background: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-subtle)" }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>{item.label}</p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--dm-text-tertiary)" }}>{item.sub}</p>
          </div>
          <button
            type="button"
            onClick={item.onChange}
            aria-pressed={item.value}
            className="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200"
            style={{ background: item.value ? "var(--dm-primary)" : "var(--dm-border-strong)" }}
          >
            <span
              className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200"
              style={{ left: item.value ? "calc(100% - 18px)" : "2px" }}
            />
          </button>
        </div>
      ))}

      {/* ── Modo DEV — acesso total ── */}
      <div className="rounded-xl p-4"
        style={{
          background: devActive ? "rgba(124,58,237,0.08)" : "var(--dm-bg-elevated)",
          border: `1px solid ${devActive ? "#7C3AED" : "var(--dm-border-subtle)"}`,
        }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: devActive ? "#7C3AED" : "rgba(124,58,237,0.12)" }}>
              <KeyRound size={16} style={{ color: devActive ? "#fff" : "#7C3AED" }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>
                Modo DEV {devActive && <span className="ml-1 text-[11px] font-bold" style={{ color: "#7C3AED" }}>· ativo</span>}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--dm-text-tertiary)" }}>
                Acesso total: destrava a configuração de qualquer empresa, tokens e membros — você é tratado como dono em tudo.
              </p>
            </div>
          </div>
          {devActive && (
            <button type="button" onClick={disableDev}
              className="flex-shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition hover:opacity-80"
              style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
              Desativar
            </button>
          )}
        </div>

        {!devActive && (
          <div className="mt-3 flex gap-2">
            <input
              type="password"
              value={pwd}
              onChange={(e) => { setPwd(e.target.value); setPwdError(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleEnableDev(); }}
              placeholder="Senha do modo DEV"
              className="h-10 flex-1 rounded-xl border px-3 text-xs outline-none transition focus:ring-1"
              style={{
                borderColor: pwdError ? "#EE5D50" : "var(--dm-border-default)",
                backgroundColor: "var(--dm-bg-surface)",
                color: "var(--dm-text-primary)",
              }}
            />
            <button type="button" onClick={handleEnableDev}
              className="flex h-10 items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white transition hover:opacity-90"
              style={{ background: "var(--dm-btn-primary-bg)" }}>
              <KeyRound size={13} /> Ativar
            </button>
          </div>
        )}
        {pwdError && (
          <p className="mt-2 text-[11px] font-semibold" style={{ color: "#EE5D50" }}>
            Senha incorreta.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function MyAccount({
  userName, userEmail,
  onUpdateProfile, onSignOut,
  activeTab: propTab, onTabChange,
}: MyAccountProps) {
  const [internalTab, setInternalTab] = useState<AccountTab>("profile");
  const setActiveTab = (tab: AccountTab) => {
    setInternalTab(tab);
    onTabChange?.(tab);
  };
  const initials = getInitials(userName || userEmail || "U");

  // ── Papel na empresa: dono vê painel de controle; padrão só personaliza ──────
  const { company, role, isOwner, memberships, switchCompany } = useCompany();
  const visibleTabs = TABS.filter((t) => accountTabsForRole(isOwner).includes(t.id));
  const allowedIds = visibleTabs.map((t) => t.id);
  const requestedTab = propTab ?? internalTab;
  // Trava: se o papel não permite a aba pedida (ex: viewer com aba "Empresa"
  // herdada da sidebar), cai para o perfil — nunca renderiza painel de controle.
  const activeTab: AccountTab = allowedIds.includes(requestedTab) ? requestedTab : "profile";

  // ── Avatar picker ──────────────────────────────────────────────────────────
  const { avatarUrl, updateAvatar } = useAvatarUrl();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const resolvedAvatarSrc = resolveAvatarSrc(avatarUrl, isDark);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError(null);
    if (file.size > MAX_BYTES) {
      setAvatarError("Foto muito grande. Máximo: 5 MB.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateAvatar(reader.result as string);
      setPickerOpen(false);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <div className="mx-auto w-full px-4 pb-16 pt-8" style={{ maxWidth: 1000 }}>

      {/* ── Banner ────────────────────────────────────────────────────── */}
      <div className="profile-banner">
        <span className="profile-banner-badge">Minha conta</span>
        {/* Linhas decorativas sutis */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "repeating-linear-gradient(135deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 40px)",
          }}
        />
        {/* Glow accent pontual */}
        <div
          className="absolute rounded-full"
          style={{
            width: 320, height: 320,
            bottom: -120, right: -60,
            background: "radial-gradient(circle, rgba(108,112,255,0.18) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: 200, height: 200,
            top: -60, left: "30%",
            background: "radial-gradient(circle, rgba(124,58,237,0.22) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* ── Identity card (overlaps banner bottom) ───────────────────── */}
      <div
        className="profile-identity-card"
        style={{ marginTop: -48, position: "relative", zIndex: 2 }}
      >
        {/* ── Clickable avatar ─────────────────────────────────────── */}
        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            title="Alterar foto de perfil"
            className="account-avatar text-2xl overflow-hidden transition hover:opacity-85 focus:outline-none"
            style={{ padding: 0, border: "2px solid rgba(124,58,237,0.35)" }}
          >
            {resolvedAvatarSrc ? (
              <img src={resolvedAvatarSrc} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              <span>{initials || <UserRound size={36} />}</span>
            )}
          </button>
          {/* Camera badge */}
          <span
            className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2 pointer-events-none"
            style={{ background: "var(--dm-primary)", borderColor: "var(--dm-bg-surface)" }}
          >
            <Camera size={11} className="text-white" />
          </span>
        </div>

        {/* ── Hidden file input ─────────────────────────────────────── */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="flex-1 min-w-0">
          <h1
            className="text-[20px] font-bold leading-tight truncate"
            style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins)" }}
          >
            {userName || "Usuário"}
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "var(--dm-text-tertiary)" }}>
            {userEmail}
          </p>

          {/* ── Identificador da empresa (todos os papéis) ──────────────── */}
          {company && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)" }}>
                <Building2 size={12} style={{ color: "#7C3AED" }} />
                {company.name}
                {role && (
                  <span className="font-bold" style={{ color: ACCOUNT_ROLE_COLORS[role] }}>
                    · {ACCOUNT_ROLE_LABELS[role]}
                  </span>
                )}
              </span>
              {/* Troca rápida de empresa quando o usuário participa de 2+ */}
              {memberships.length > 1 && (
                <label className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold cursor-pointer"
                  style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)", color: "var(--dm-text-secondary)" }}>
                  <ArrowLeftRight size={12} style={{ color: "#7C3AED" }} />
                  <select value={company.id} onChange={(e) => switchCompany(e.target.value)} aria-label="Trocar empresa ativa"
                    className="cursor-pointer bg-transparent text-[11px] font-semibold outline-none" style={{ color: "var(--dm-text-secondary)" }}>
                    {memberships.map((m) => <option key={m.company.id} value={m.company.id}>{m.company.name}</option>)}
                  </select>
                </label>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Sub-tabs ──────────────────────────────────────────────────── */}
      <div className="account-tabs mt-10">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`account-tab${activeTab === tab.id ? " active" : ""}`}
          >
            {tab.id === "privacy"         && <Lock    size={13} className="mr-1.5 inline" />}
            {tab.id === "notifications"   && <Bell    size={13} className="mr-1.5 inline" />}
            {tab.id === "personalization" && <Sliders size={13} className="mr-1.5 inline" />}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ───────────────────────────────────────────────── */}
      <div className="account-content mt-8">
        {activeTab === "profile" && (
          <TabProfile
            name={userName}
            email={userEmail}
            onUpdateProfile={onUpdateProfile}
            onSignOut={onSignOut}
          />
        )}
        {activeTab === "privacy"         && <TabPrivacy />}
        {activeTab === "notifications"   && <TabNotifications />}
        {activeTab === "personalization" && <TabPersonalization />}
      </div>

      {/* ── Avatar picker modal ───────────────────────────────────────── */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="w-full rounded-2xl p-6 shadow-2xl"
            style={{
              maxWidth: 380,
              background: "var(--dm-bg-surface)",
              border: "1px solid var(--dm-border-default)",
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="mb-5 text-center">
              <h3 className="text-[17px] font-bold" style={{ color: "var(--dm-text-primary)" }}>
                Escolher foto
              </h3>
              <p className="mt-1 text-[13px]" style={{ color: "var(--dm-text-tertiary)" }}>
                Formatos aceitos: JPG, PNG, WebP, GIF · Máx. 5 MB
              </p>
            </div>

            {/* Current avatar preview */}
            <div className="flex justify-center mb-5">
              <div
                className="h-20 w-20 overflow-hidden rounded-full"
                style={{ boxShadow: "0 0 0 3px var(--dm-primary-soft)" }}
              >
                {resolvedAvatarSrc ? (
                  <img src={resolvedAvatarSrc} alt="Avatar atual" className="h-full w-full object-cover" />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center text-2xl font-bold text-white"
                    style={{ background: "linear-gradient(135deg, var(--dm-primary) 0%, var(--dm-primary-vivid) 100%)" }}
                  >
                    {initials || <UserRound size={32} />}
                  </div>
                )}
              </div>
            </div>

            {/* Error */}
            {avatarError && (
              <p className="mb-3 rounded-lg px-3 py-2 text-center text-[12px] font-medium"
                style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
                {avatarError}
              </p>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[14px] font-semibold transition hover:opacity-90"
                style={{ background: "var(--dm-primary)", color: "#fff" }}
              >
                <Camera size={16} />
                Enviar foto
              </button>

              {/* ── Icon grid ──────────────────────────────────────── */}
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--dm-text-tertiary)" }}>
                  Ícones padrão
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {Array.from({ length: AVATAR_ICON_COUNT }, (_, i) => {
                    const n = i + 1;
                    const src = `/avatars/${n} W.webp`;
                    const isSelected = avatarUrl === `icon:${n}`;
                    return (
                      <button
                        key={n}
                        type="button"
                        title={`Ícone ${n}`}
                        onClick={() => { updateAvatar(`icon:${n}`); setPickerOpen(false); setAvatarError(null); }}
                        className="aspect-square overflow-hidden rounded-xl transition hover:scale-105 hover:opacity-90"
                        style={{
                          border: isSelected ? "2px solid var(--dm-primary)" : "2px solid var(--dm-border-subtle)",
                          boxShadow: isSelected ? "0 0 0 3px var(--dm-primary-soft)" : undefined,
                        }}
                      >
                        <img src={src} alt={`Ícone ${n}`} className="h-full w-full object-cover" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {avatarUrl && (
                <button
                  type="button"
                  onClick={() => { updateAvatar(null); setPickerOpen(false); setAvatarError(null); }}
                  className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[14px] font-semibold transition hover:opacity-80"
                  style={{ background: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)", border: "1px solid var(--dm-border-default)" }}
                >
                  <Trash2 size={14} />
                  Remover foto
                </button>
              )}

              <button
                type="button"
                onClick={() => { setPickerOpen(false); setAvatarError(null); }}
                className="mt-1 rounded-xl px-4 py-2.5 text-[13px] transition hover:opacity-70"
                style={{ color: "var(--dm-text-tertiary)" }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
