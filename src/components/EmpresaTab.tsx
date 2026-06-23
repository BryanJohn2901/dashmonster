"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2, KeyRound, Megaphone, Radar, History, Users, RotateCcw,
  Loader2, ChevronLeft, ChevronRight, Check, ArrowLeftRight,
} from "lucide-react";
import {
  useCompany, fetchCompanyToken, fetchCompanyMembers,
  readAdAccountSuggestions, type CompanyMember, type CompanyRole,
} from "@/hooks/useCompany";
import {
  IdentidadeSection, ConexaoSection, TrackingSection, ContasSection,
  HistoricoSection, EquipeSection,
} from "@/components/CompanyStudio";
import { AccountsHub } from "@/components/CampaignCenter";
import { TabIntegrations, TabSync } from "@/components/ControlPanel";
import { readCustomHistoryTabs, type HistoricalKind } from "@/types/historical";
import type { UserCategory, UserAccountEntry } from "@/types/userConfig";
import type { MetaSyncResult } from "@/utils/supabaseCampaigns";

const BRAND = "#6366C8";
const ROLE_LABELS: Record<CompanyRole, string> = { owner: "Dono", manager: "Gestor de tráfego", viewer: "Visualização" };
const HISTORY_KINDS: HistoricalKind[] = ["lancamento", "evento", "perpetuo", "instagram"];

type StepId = "conexao" | "contas" | "tracking" | "historico" | "equipe" | "sync";

interface EmpresaTabProps {
  categories:         UserCategory[];
  accountEntries:     UserAccountEntry[];
  onCategoriesChange: (cats: UserCategory[])       => void;
  onEntriesChange:    (entries: UserAccountEntry[]) => void;
  syncStatus?:        { syncing: boolean; result?: MetaSyncResult; error?: string };
  campaignCount?:     number;
  dataSource?:        { type: string; label: string } | null;
  onRefresh?:         () => Promise<void>;
  onClearData?:       () => Promise<void>;
}

/**
 * Aba de topo "Empresa" (só dono). Wizard de passos com bastante respiro — um
 * concern por passo, nunca uma página longa. Reusa as seções do CompanyStudio
 * (modo "panel") + AccountsHub/Integrações/Sincronização. Stepper é clicável
 * (pula pra qualquer passo) além do Voltar/Avançar.
 */
export function EmpresaTab({
  categories, accountEntries, onCategoriesChange, onEntriesChange,
  syncStatus, campaignCount, dataSource, onRefresh, onClearData,
}: EmpresaTabProps) {
  const { company, role, isOwner, canWrite, loading, migrationMissing, memberships, switchCompany, isSuperAdmin } = useCompany();

  const [token, setToken]     = useState("");
  const [members, setMembers] = useState<CompanyMember[] | null>(null);
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (!company) return;
    let active = true;
    void fetchCompanyToken(company.id).then((t) => { if (active) setToken(t); }).catch(() => {});
    void fetchCompanyMembers(company.id).then((m) => { if (active) setMembers(m); }).catch(() => { if (active) setMembers([]); });
    return () => { active = false; };
  }, [company]);

  const suggestions    = useMemo(() => readAdAccountSuggestions(company?.settings), [company?.settings]);
  const customTabs     = useMemo(() => readCustomHistoryTabs(company?.settings), [company?.settings]);
  const enabledFilters = categories.filter((c) => c.isEnabled);
  const totalHistoryTabs = HISTORY_KINDS.length + customTabs.length;

  const steps = useMemo(() => ([
    { id: "conexao"   as StepId, label: "Conexão",          icon: KeyRound,  done: Boolean(token.trim()) },
    { id: "contas"    as StepId, label: "Contas & Filtros", icon: Megaphone, done: enabledFilters.length > 0 || accountEntries.length > 0 || suggestions.length > 0 },
    { id: "tracking"  as StepId, label: "Tracking",         icon: Radar,     done: false },
    { id: "historico" as StepId, label: "Histórico",        icon: History,   done: false },
    { id: "equipe"    as StepId, label: "Equipe",           icon: Users,     done: (members?.length ?? 0) > 0 },
    { id: "sync"      as StepId, label: "Sincronização",    icon: RotateCcw, done: (campaignCount ?? 0) > 0 },
  ]), [token, enabledFilters.length, accountEntries.length, suggestions.length, members, campaignCount]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20">
        <Loader2 size={18} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} />
        <span className="text-sm" style={{ color: "var(--dm-text-tertiary)" }}>Carregando empresa…</span>
      </div>
    );
  }
  if (!company) {
    return (
      <div className="mx-auto mt-10 max-w-xl rounded-2xl border p-10 text-center" style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
        <Building2 size={28} className="mx-auto mb-3" style={{ color: "var(--dm-text-tertiary)" }} />
        <p className="mb-1 text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>Nenhuma empresa configurada</p>
        <p className="text-xs" style={{ color: "var(--dm-text-tertiary)" }}>
          {migrationMissing ? "Execute a migration 021 no Supabase para ativar empresas." : "Sua conta ainda não pertence a nenhuma empresa."}
        </p>
      </div>
    );
  }

  const readiness = Math.round((steps.filter((s) => s.done).length / steps.length) * 100);
  const active = steps[stepIdx];

  return (
    <div className="mx-auto w-full px-4 pb-16 pt-8" style={{ maxWidth: 880 }}>

      {/* ── Header: identidade + prontidão + troca de empresa ── */}
      <div className="rounded-2xl border p-5" style={{ background: "linear-gradient(135deg, rgba(99,102,200,0.10), rgba(49,52,145,0.04))", borderColor: BRAND }}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: BRAND }}>
            <Building2 size={22} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold leading-tight" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
              {company.name}
            </p>
            <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
              Configuração da empresa · {role ? ROLE_LABELS[role] : "—"}{isSuperAdmin ? " · super admin" : ""}
            </p>
          </div>
          {memberships.length > 1 && (
            <label className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
              <ArrowLeftRight size={14} style={{ color: BRAND }} />
              <select value={company.id} onChange={(e) => switchCompany(e.target.value)} aria-label="Trocar empresa ativa"
                className="cursor-pointer bg-transparent text-xs font-semibold outline-none" style={{ color: "var(--dm-text-primary)" }}>
                {memberships.map((m) => <option key={m.company.id} value={m.company.id}>{m.company.name}</option>)}
              </select>
            </label>
          )}
          <div className="flex items-center gap-3 rounded-xl border px-4 py-2" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
            <div className="relative h-11 w-11" role="img" aria-label={`Prontidão: ${readiness}%`}>
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
                {readiness === 100 ? "tudo pronto" : `${steps.filter((s) => s.done).length}/${steps.length} etapas`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stepper clicável ── */}
      <div className="mt-5 flex items-center gap-1 overflow-x-auto pb-1">
        {steps.map((s, i) => {
          const isActive = i === stepIdx;
          return (
            <div key={s.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setStepIdx(i)}
                aria-current={isActive ? "step" : undefined}
                className="flex min-w-[112px] items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors"
                style={{
                  borderColor: isActive ? BRAND : "var(--dm-border-default)",
                  background:  isActive ? "rgba(99,102,200,0.08)" : "var(--dm-bg-surface)",
                }}
              >
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                  style={{
                    background: s.done ? "#05CD99" : isActive ? BRAND : "var(--dm-bg-elevated)",
                    color: s.done || isActive ? "#fff" : "var(--dm-text-tertiary)",
                  }}>
                  {s.done ? <Check size={13} /> : i + 1}
                </span>
                <span className="truncate text-[12px] font-semibold" style={{ color: isActive ? "var(--dm-text-primary)" : "var(--dm-text-secondary)" }}>
                  {s.label}
                </span>
              </button>
              {i < steps.length - 1 && <ChevronRight size={14} className="flex-shrink-0" style={{ color: "var(--dm-text-tertiary)" }} />}
            </div>
          );
        })}
      </div>

      {/* ── Corpo do passo ativo ── */}
      <div className="mt-5 space-y-4">
        {active.id === "conexao" && (<>
          <IdentidadeSection company={company} canEdit={isOwner} open onToggle={() => {}} variant="panel" />
          <ConexaoSection company={company} canEdit={isOwner} token={token} onToken={setToken} open onToggle={() => {}} variant="panel" />
          <TabIntegrations onSyncNow={() => { void onRefresh?.(); }} />
        </>)}

        {active.id === "contas" && (<>
          <AccountsHub categories={categories} accountEntries={accountEntries} onCategoriesChange={onCategoriesChange} onEntriesChange={onEntriesChange} />
          <ContasSection company={company} canEdit={isOwner} suggestions={suggestions} open onToggle={() => {}} variant="panel" />
        </>)}

        {active.id === "tracking" && (
          <TrackingSection company={company} canEdit={canWrite} open onToggle={() => {}} variant="panel" />
        )}

        {active.id === "historico" && (
          <HistoricoSection company={company} canEdit={isOwner} customTabs={customTabs} totalTabs={totalHistoryTabs} open onToggle={() => {}} variant="panel" />
        )}

        {active.id === "equipe" && (
          <EquipeSection company={company} canEdit={isOwner} members={members} setMembers={setMembers} open onToggle={() => {}} variant="panel" />
        )}

        {active.id === "sync" && (
          <TabSync syncStatus={syncStatus} campaignCount={campaignCount} dataSource={dataSource} onRefresh={onRefresh} onClearData={onClearData} />
        )}
      </div>

      {/* ── Navegação Voltar / Avançar ── */}
      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
          disabled={stepIdx === 0}
          className="flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-[13px] font-semibold transition hover:opacity-80 disabled:opacity-30"
          style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}
        >
          <ChevronLeft size={15} /> Voltar
        </button>
        <span className="text-[11px] font-semibold" style={{ color: "var(--dm-text-tertiary)" }}>
          Passo {stepIdx + 1} de {steps.length}
        </span>
        <button
          type="button"
          onClick={() => setStepIdx((i) => Math.min(steps.length - 1, i + 1))}
          disabled={stepIdx === steps.length - 1}
          className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-bold text-white transition hover:opacity-90 disabled:opacity-30"
          style={{ background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)" }}
        >
          Avançar <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
