"use client";

import { useState } from "react";
import { UserRound, Bell, Lock, Sliders } from "lucide-react";
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
        <div className="account-avatar text-2xl flex-shrink-0">
          {initials || <UserRound size={36} />}
        </div>
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
    </div>
  );
}
