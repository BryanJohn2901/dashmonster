"use client";

import { useRef, useState } from "react";
import { Camera, Trash2, UserRound, Bell, Lock, Sliders } from "lucide-react";
import { useTheme } from "next-themes";
import { useAvatarUrl, resolveAvatarSrc, AVATAR_ICON_COUNT } from "@/hooks/useAvatarUrl";
import {
  TabProfile, TabAccounts, TabIntegrations, TabSync,
  type TabAccountsProps,
} from "@/components/ControlPanel";
import type { UserCategory, UserAccountEntry } from "@/types/userConfig";
import type { MetaSyncResult } from "@/utils/supabaseCampaigns";

// ─── Types ────────────────────────────────────────────────────────────────────

type AccountTab =
  | "profile"
  | "accounts"
  | "integrations"
  | "sync"
  | "privacy"
  | "notifications"
  | "personalization";

interface MyAccountProps {
  userName:           string;
  userEmail:          string;
  categories:         UserCategory[];
  accountEntries:     UserAccountEntry[];
  onCategoriesChange: (cats: UserCategory[])       => void;
  onEntriesChange:    (entries: UserAccountEntry[]) => void;
  onUpdateProfile:    (name: string)                => Promise<void>;
  onSignOut:          ()                            => Promise<void>;
  syncStatus?:        { syncing: boolean; result?: MetaSyncResult; error?: string };
  campaignCount?:     number;
  dataSource?:        { type: string; label: string } | null;
  onRefresh?:         () => Promise<void>;
  onClearData?:       () => Promise<void>;
  /** Controlled tab — lifted to Dashboard for sidebar nav */
  activeTab?:         AccountTab;
  onTabChange?:       (tab: AccountTab) => void;
}

// ─── Sub-tab definitions ──────────────────────────────────────────────────────

const TABS: { id: AccountTab; label: string }[] = [
  { id: "profile",         label: "Meu perfil"     },
  { id: "accounts",        label: "Contas"          },
  { id: "integrations",    label: "Integrações"     },
  { id: "sync",            label: "Sincronização"   },
  { id: "privacy",         label: "Privacidade"     },
  { id: "notifications",   label: "Notificações"    },
  { id: "personalization", label: "Personalização"  },
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
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function MyAccount({
  userName, userEmail,
  categories, accountEntries,
  onCategoriesChange, onEntriesChange,
  onUpdateProfile, onSignOut,
  syncStatus, campaignCount, dataSource, onRefresh, onClearData,
  activeTab: propTab, onTabChange,
}: MyAccountProps) {
  const [internalTab, setInternalTab] = useState<AccountTab>("profile");
  const activeTab = propTab ?? internalTab;
  const setActiveTab = (tab: AccountTab) => {
    setInternalTab(tab);
    onTabChange?.(tab);
  };
  const initials = getInitials(userName || userEmail || "U");

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

  const tabAccountsProps: TabAccountsProps = {
    categories,
    accountEntries,
    onCategoriesChange,
    onEntriesChange,
  };

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
            background: "radial-gradient(circle, rgba(49,52,145,0.22) 0%, transparent 70%)",
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
            style={{ padding: 0, border: "2px solid rgba(49,52,145,0.35)" }}
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
        </div>
      </div>

      {/* ── Sub-tabs ──────────────────────────────────────────────────── */}
      <div className="account-tabs mt-10">
        {TABS.map(tab => (
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
        {activeTab === "accounts" && (
          <TabAccounts {...tabAccountsProps} />
        )}
        {activeTab === "integrations" && (
          <TabIntegrations onSyncNow={() => { void onRefresh?.(); }} />
        )}
        {activeTab === "sync" && (
          <TabSync
            syncStatus={syncStatus}
            campaignCount={campaignCount}
            dataSource={dataSource}
            onRefresh={onRefresh}
            onClearData={onClearData}
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
