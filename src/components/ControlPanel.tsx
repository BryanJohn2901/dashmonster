"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { toast } from "@/hooks/useToast";
import { useTheme } from "next-themes";
import {
  X, Settings2, ChevronDown, ChevronUp, Plus, Trash2, Loader2,
  Zap, User, Activity, CheckCircle2, XCircle, Link2, Eye, EyeOff,
  RefreshCw, Save, RotateCcw, Sun, Moon, Database, AtSign, Search, Pencil, Target,
} from "lucide-react";
import type { UserCategory, UserAccountEntry } from "@/types/userConfig";
import { FIXED_CATEGORIES, MAX_CUSTOM_CATEGORIES } from "@/types/userConfig";
import {
  createCustomInternalFilterId,
  getCustomInternalFilterLabel,
  getInternalFiltersForCategorySlug,
  getInternalFilterLabel,
  isCustomInternalFilterId,
  parseCustomInternalFilterId,
  type CategoryInternalFilterOption,
} from "@/config/categoryInternalFilters";
import {
  upsertUserCategory, deleteUserCategory,
  upsertUserAccountEntry, deleteUserAccountEntry,
} from "@/utils/supabaseCategories";
import {
  fetchMetaCampaigns,
  fetchMetaAdAccounts,
  loadMetaCredentials,
  saveMetaCredentials,
  type MetaAdAccount,
} from "@/utils/metaApi";
import {
} from "@/utils/instagramApi";
import type { MetaSyncResult } from "@/utils/supabaseCampaigns";
import { useAdvertiserStore } from "@/hooks/useAdvertiserStore";
import { useCompany, readAdAccountSuggestions } from "@/hooks/useCompany";
import {
  useCampaignCenter, detectIntent, INTENT_META, INTENT_OPTIONS,
  type CampaignIntent,
} from "@/hooks/useCampaignCenter";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CPTab = "accounts" | "integrations" | "sync" | "profile";

function isValidMetaAccountId(value: string): boolean {
  return /^act_\d{4,}$/.test(value.trim());
}

interface ControlPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Ao abrir o drawer (transição fechado → aberto), foca esta aba (ex.: integrações para configurar origem). */
  openingTab?: CPTab;
  userName: string;
  userEmail: string;
  categories: UserCategory[];
  accountEntries: UserAccountEntry[];
  onCategoriesChange: (cats: UserCategory[]) => void;
  onEntriesChange:    (entries: UserAccountEntry[]) => void;
  onUpdateProfile:    (name: string) => Promise<void>;
  onSignOut:          () => Promise<void>;
  // Sync tab
  syncStatus?:   { syncing: boolean; result?: MetaSyncResult; error?: string };
  campaignCount?: number;
  dataSource?:   { type: string; label: string } | null;
  onRefresh?:    () => Promise<void>;
  onClearData?:  () => Promise<void>;
  /** Após salvar vínculo de conta no Painel: fecha o drawer e o Dashboard aplica categoria/grupo/campanhas. */
  onPainelSaveNavigate?: (detail: { entry: UserAccountEntry; categorySlug: string; isCustom: boolean }) => void;
  /** Quando true, renderiza inline (sem backdrop/drawer) — para usar na página Minha Conta. */
  inline?: boolean;
}

// ─── AddEntryForm ─────────────────────────────────────────────────────────────

interface AddEntryFormProps {
  categoryId: string;
  categorySlug: string;
  categoryLabel?: string;
  isCustomCategory: boolean;
  customFilterOptions?: CategoryInternalFilterOption[];
  onSaved: (entry: UserAccountEntry) => void;
  onCancel: () => void;
}

function AddEntryForm({
  categoryId,
  categorySlug,
  categoryLabel,
  isCustomCategory,
  customFilterOptions = [],
  onSaved,
  onCancel,
}: AddEntryFormProps) {
  const [label, setLabel] = useState("");
  const [accountId, setAccountId] = useState("");
  const [internalFilter, setInternalFilter] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [verifyState, setVerifyState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");
  const [saveErrMsg, setSaveErrMsg] = useState("");
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string; status: string; objective?: string }>>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [intents, setIntents] = useState<Record<string, CampaignIntent>>({});
  const [budgets, setBudgets] = useState<Record<string, number | null>>({});
  const [goalsMap, setGoalsMap] = useState<Record<string, Record<string, number>>>({});
  const [campSearch, setCampSearch] = useState("");
  const { upsertEntries: upsertCenterEntries } = useCampaignCenter();
  const { company } = useCompany();
  const [saving, setSaving] = useState(false);
  const [metaAccounts, setMetaAccounts] = useState<MetaAdAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountsLoadErr, setAccountsLoadErr] = useState("");
  const [hasMetaToken, setHasMetaToken] = useState(false);
  const [campaignListOpen, setCampaignListOpen] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<{ account?: string; filter?: string }>({});
  const [accountSuggestionsOpen, setAccountSuggestionsOpen] = useState(false);
  const [filterSuggestionsOpen, setFilterSuggestionsOpen] = useState(false);

  const filterOptions = useMemo<CategoryInternalFilterOption[]>(
    () => {
      if (isCustomCategory) return [];
      const seen = new Set<string>();
      return [...getInternalFiltersForCategorySlug(categorySlug), ...customFilterOptions]
        .filter((opt) => {
          if (seen.has(opt.id)) return false;
          seen.add(opt.id);
          return true;
        });
    },
    [categorySlug, customFilterOptions, isCustomCategory],
  );
  const needsInternalFilter = !isCustomCategory && filterOptions.length > 0;
  const accountReady = Boolean(accountId.trim());
  const filterReady = !needsInternalFilter || Boolean(internalFilter.trim() || filterQuery.trim());
  const canContinueAfterFilters = accountReady && filterReady;

  // Contas registradas na empresa (companies.settings) — sugestão com ★ e nome
  // certo, mesclada às contas do token. Aparecem mesmo se o token não as lista.
  const registeredAccts = useMemo(() => readAdAccountSuggestions(company?.settings), [company?.settings]);

  const accountSuggestions = useMemo(() => {
    const q = accountId.trim().toLowerCase();
    const norm = (id: string) => id.replace(/^act_/, "");
    const reg = registeredAccts
      .map((r) => ({ id: `act_${norm(r.id)}`, name: r.label || `act_${norm(r.id)}`, suggested: true }))
      .filter((acc) => !q || acc.id.toLowerCase().includes(q) || acc.name.toLowerCase().includes(q));
    const regIds = new Set(reg.map((r) => norm(r.id)));
    const fromToken = (q
      ? metaAccounts.filter((acc) =>
          acc.id.toLowerCase().includes(q) ||
          acc.name.toLowerCase().includes(q) ||
          acc.currency.toLowerCase().includes(q),
        )
      : metaAccounts)
      .filter((acc) => !regIds.has(norm(acc.id)))
      .map((acc) => ({ id: acc.id, name: acc.name, suggested: false }));
    return [...reg, ...fromToken].slice(0, 8);
  }, [accountId, metaAccounts, registeredAccts]);

  const filterSuggestions = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    const base = q
      ? filterOptions.filter((opt) =>
          opt.label.toLowerCase().includes(q) ||
          opt.id.toLowerCase().includes(q),
        )
      : filterOptions;
    return base.slice(0, 8);
  }, [filterOptions, filterQuery]);

  const exactFilterMatch = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return null;
    return filterOptions.find((opt) =>
      opt.id.toLowerCase() === q ||
      opt.label.toLowerCase() === q,
    ) ?? null;
  }, [filterOptions, filterQuery]);

  const canCreateFilter =
    !isCustomCategory &&
    Boolean(filterQuery.trim()) &&
    !exactFilterMatch &&
    !isCustomInternalFilterId(filterQuery.trim());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { accessToken } = loadMetaCredentials();
      const tokenOk = Boolean(accessToken?.trim());
      setHasMetaToken(tokenOk);
      if (!accessToken?.trim()) {
        setMetaAccounts([]);
        setAccountsLoadErr("");
        setLoadingAccounts(false);
        return;
      }
      setLoadingAccounts(true);
      setAccountsLoadErr("");
      try {
        const list = await fetchMetaAdAccounts(accessToken);
        if (!cancelled) setMetaAccounts(list);
      } catch (e) {
        if (!cancelled) {
          setMetaAccounts([]);
          setAccountsLoadErr(e instanceof Error ? e.message : "Falha ao carregar contas.");
        }
      } finally {
        if (!cancelled) setLoadingAccounts(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handlePickAccount = (id: string) => {
    setAccountId(id);
    setLabel("");
    setVerifyState("idle");
    setCampaigns([]);
    setSelected([]);
    setErrMsg("");
    setCampaignListOpen(true);
    setAccountSuggestionsOpen(false);
    setFieldErrors((e) => ({ ...e, account: undefined }));
  };

  const handleAccountInputChange = (value: string) => {
    setAccountId(value);
    setVerifyState("idle");
    setCampaigns([]);
    setSelected([]);
    setErrMsg("");
    setCampaignListOpen(true);
    setAccountSuggestionsOpen(true);
    setFieldErrors((e) => ({ ...e, account: undefined }));
  };

  const handlePickInternalFilter = (opt: CategoryInternalFilterOption) => {
    setInternalFilter(opt.id);
    setFilterQuery(opt.label);
    setFilterSuggestionsOpen(false);
    setVerifyState("idle");
    setCampaigns([]);
    setSelected([]);
    setErrMsg("");
    setCampaignListOpen(true);
    setFieldErrors((e) => ({ ...e, filter: undefined }));
  };

  const handleInternalFilterInputChange = (value: string) => {
    setFilterQuery(value);
    const exact = filterOptions.find((opt) =>
      opt.id.toLowerCase() === value.trim().toLowerCase() ||
      opt.label.toLowerCase() === value.trim().toLowerCase(),
    );
    setInternalFilter(exact?.id ?? "");
    setFilterSuggestionsOpen(true);
    setVerifyState("idle");
    setCampaigns([]);
    setSelected([]);
    setErrMsg("");
    setCampaignListOpen(true);
    setFieldErrors((e) => ({ ...e, filter: undefined }));
  };

  const createFilterFromQuery = (): string => {
    const name = filterQuery.trim();
    if (!name) return "";
    const existing = exactFilterMatch;
    if (existing) {
      handlePickInternalFilter(existing);
      return existing.id;
    }
    const id = createCustomInternalFilterId(categorySlug, name);
    setInternalFilter(id);
    setFilterQuery(name);
    setFilterSuggestionsOpen(false);
    setFieldErrors((e) => ({ ...e, filter: undefined }));
    return id;
  };

  const resolveInternalFilterForSubmit = (): string => {
    if (isCustomCategory) return "";
    if (internalFilter.trim()) return internalFilter.trim();
    if (!filterQuery.trim()) return "";
    return createFilterFromQuery();
  };

  const handleVerify = async () => {
    if (!canContinueAfterFilters) return;
    const id = accountId.trim();
    const resolvedFilter = resolveInternalFilterForSubmit();
    const err: { account?: string; filter?: string } = {};
    if (!isValidMetaAccountId(id)) {
      err.account = "Use o formato act_1234567890.";
    }
    if (needsInternalFilter && !resolvedFilter) {
      err.filter = "Selecione ou crie um filtro para esta categoria.";
    }
    if (Object.keys(err).length > 0) {
      setFieldErrors(err);
      return;
    }
    const { accessToken } = loadMetaCredentials();
    if (!accessToken) {
      setErrMsg("Token de acesso não configurado. Configure em Integrações.");
      setVerifyState("error");
      return;
    }
    setVerifyState("loading");
    setErrMsg("");
    try {
      const camps = await fetchMetaCampaigns(id, accessToken);
      setCampaigns(camps);
      // Nada pré-marcado: o usuário escolhe as campanhas que quer — evita a
      // lista esticar de uma vez e confundir quem está configurando.
      setSelected([]);
      // Auto-detecta a intenção de cada campanha (objective da Meta + nome)
      setIntents(Object.fromEntries(
        camps.map((c) => [c.id, detectIntent({ objective: c.objective, name: c.name })]),
      ));
      setVerifyState("ok");
      setCampaignListOpen(true);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Falha ao verificar conta.");
      setVerifyState("error");
    }
  };

  const handleSave = async () => {
    const err: { account?: string; filter?: string } = {};
    const id = accountId.trim();
    const resolvedFilter = resolveInternalFilterForSubmit();
    if (!id) err.account = "Informe uma conta de anúncios.";
    else if (!isValidMetaAccountId(id)) err.account = "Use o formato act_1234567890.";
    if (needsInternalFilter && !resolvedFilter) {
      err.filter = "Selecione ou crie um filtro para esta categoria.";
    }
    if (Object.keys(err).length > 0) {
      setFieldErrors(err);
      return;
    }
    const resolvedLabel =
      label.trim() ||
      metaAccounts.find((a) => a.id === id)?.name?.trim() ||
      id;
    setFieldErrors({});
    setSaveErrMsg("");
    setSaving(true);
    try {
      const entry = await upsertUserAccountEntry({
        categoryId,
        label: resolvedLabel,
        adAccountId: id,
        internalFilter: isCustomCategory ? null : resolvedFilter || null,
        campaigns,
        selectedCampaignIds: selected.length < campaigns.length ? selected : [],
      });
      // Propaga intenções para a Central de Campanhas
      const now = new Date().toISOString();
      upsertCenterEntries(
        campaigns.filter((c) => selected.includes(c.id)).map((c) => {
          const intent = intents[c.id] ?? detectIntent({ objective: c.objective, name: c.name });
          return {
            campaignId: c.id,
            campaignName: c.name,
            adAccountId: id,
            adAccountLabel: resolvedLabel,
            intent,
            // resultType da intenção (objective configurado na Meta) — alimenta
            // os resultados do dashboard principal e do Perfil de Anunciantes
            resultType: INTENT_META[intent].defaultResultTypes[0],
            groupId: resolvedFilter || categorySlug,
            monthlyBudget: budgets[c.id] ?? null,
            goals: goalsMap[c.id] ?? {},
            enabled: c.status === "ACTIVE",
            autoConfigured: true,
            updatedAt: now,
          };
        }),
      );
      toast.success("Conta salva! Sincronizando dados…");
      onSaved(entry);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSaveErrMsg(msg);
      toast.error(`Erro ao salvar: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleAll = () => setSelected((s) => (s.length === campaigns.length ? [] : campaigns.map((c) => c.id)));
  const toggleOne = (cid: string) =>
    setSelected((s) => (s.includes(cid) ? s.filter((x) => x !== cid) : [...s, cid]));

  const filterSelectDisabled = isCustomCategory;
  const errBorderAccount = fieldErrors.account ? "#f87171" : "var(--dm-border-default)";
  const errBorderFilter = fieldErrors.filter ? "#f87171" : "var(--dm-border-default)";
  const selectedCampaigns = campaigns.filter((c) => selected.includes(c.id));

  return createPortal(
    <>
      {/* Backdrop desfocado */}
      <div className="fixed inset-0 z-[120] bg-black/40 backdrop-blur-sm" onClick={onCancel} />

      {/* Modal centralizado — largo, com respiro, itens sempre à vista */}
      <div className="fixed inset-0 z-[121] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto flex w-full max-w-[880px] max-h-[90vh] flex-col overflow-hidden rounded-[24px] border shadow-2xl"
          style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>

          {/* Header do modal */}
          <div className="flex items-center justify-between border-b px-7 py-5"
            style={{ borderColor: "var(--dm-border-subtle)", backgroundColor: "var(--dm-bg-elevated)" }}>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full"
                style={{ backgroundColor: "rgba(99,102,200,0.12)" }}>
                <Plus size={16} style={{ color: "#6366C8" }} />
              </div>
              <div>
                <h3 className="text-sm font-bold" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
                  Adicionar conta{categoryLabel ? ` — ${categoryLabel}` : ""}
                </h3>
                <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
                  Conta → filtro → escolha as campanhas → intenção e metas de cada uma
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {/* + adicionar mais campanhas à configuração */}
              {verifyState === "ok" && campaigns.length > 0 && (
                <button type="button" onClick={() => setCampaignListOpen(true)}
                  title="Adicionar mais campanhas desta categoria"
                  className="flex h-7 w-7 items-center justify-center rounded-full transition hover:opacity-80"
                  style={{ backgroundColor: "rgba(99,102,200,0.12)", color: "#6366C8" }}>
                  <Plus size={14} />
                </button>
              )}
              <button type="button" onClick={onCancel}
                className="flex h-7 w-7 items-center justify-center rounded-full transition hover:opacity-70"
                style={{ color: "var(--dm-text-tertiary)" }}>
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Corpo rolável */}
          <div className="flex-1 overflow-y-auto p-7 space-y-6">
      {/* Campo 1 — ID da Conta (obrigatório) */}
      <div className="rounded-2xl border p-5 space-y-3"
        style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
        <div>
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--dm-text-tertiary)" }}>
            ID da Conta <span className="text-red-500">*</span>
          </label>
          {loadingAccounts ? (
            <div className="flex h-9 items-center gap-2 px-2 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
              <Loader2 size={12} className="animate-spin flex-shrink-0" />
              Carregando contas…
            </div>
          ) : (
            <div className="relative">
              <input
                value={accountId}
                onChange={(e) => handleAccountInputChange(e.target.value)}
                onFocus={() => setAccountSuggestionsOpen(true)}
                onBlur={() => setTimeout(() => setAccountSuggestionsOpen(false), 120)}
                placeholder="act_1234567890"
                className="h-11 w-full rounded-xl border px-3.5 pr-9 text-[13px] font-mono font-medium outline-none transition focus:ring-1"
                style={{ borderColor: errBorderAccount, backgroundColor: "var(--dm-bg-elevated)",
                  color: "var(--dm-text-primary)" }}
              />
              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
                style={{ color: "var(--dm-text-tertiary)" }}
              />
              {accountSuggestionsOpen && accountSuggestions.length > 0 && (
                <div
                  className="absolute left-0 right-0 top-full z-40 mt-1 max-h-48 overflow-y-auto rounded-lg border p-1 shadow-xl"
                  style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}
                >
                  {accountSuggestions.map((acc) => (
                    <button
                      key={acc.id}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); handlePickAccount(acc.id); }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      {acc.suggested
                        ? <span className="flex-shrink-0 text-[12px] leading-none" style={{ color: "#6366C8" }}>★</span>
                        : <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>{acc.name}</span>
                        <span className="block truncate font-mono text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>{acc.id}</span>
                      </span>
                      {acc.suggested && <span className="flex-shrink-0 text-[9px] font-bold" style={{ color: "#6366C8" }}>registrada</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {fieldErrors.account && (
            <p className="mt-1 text-[10px] text-red-500">{fieldErrors.account}</p>
          )}
          {!loadingAccounts && !hasMetaToken && (
            <p className="mt-1 text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
              Configure o token em <strong>Integrações</strong> para listar suas contas.
            </p>
          )}
          {accountsLoadErr && (
            <p className="mt-1 text-[10px] text-red-500">{accountsLoadErr}</p>
          )}
          {!loadingAccounts && hasMetaToken && metaAccounts.length === 0 && !accountsLoadErr && (
            <p className="mt-1 text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
              Nenhuma conta encontrada para este token.
            </p>
          )}
        </div>
      </div>

      {/* Campo 2, campanhas, Campo 3 — mesmo cartão; campanhas entre 2 e 3 */}
      <div className="rounded-2xl border p-5 space-y-4"
        style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
        {isCustomCategory ? (
          <p className="text-[11px] leading-snug" style={{ color: "var(--dm-text-tertiary)" }}>
            Categorias personalizadas não usam subfiltros catalogados — o vínculo é direto à categoria.
          </p>
        ) : (
          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--dm-text-tertiary)" }}>
              Filtro da Categoria <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                value={filterQuery}
                onChange={(e) => handleInternalFilterInputChange(e.target.value)}
                onFocus={() => setFilterSuggestionsOpen(true)}
                onBlur={() => setTimeout(() => setFilterSuggestionsOpen(false), 120)}
                disabled={filterSelectDisabled}
                placeholder="Digite ou selecione um filtro"
                className="h-11 w-full rounded-xl border px-3.5 pr-9 text-[13px] font-medium outline-none transition focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ borderColor: errBorderFilter, backgroundColor: "var(--dm-bg-elevated)",
                  color: "var(--dm-text-primary)" }}
              />
              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
                style={{ color: "var(--dm-text-tertiary)" }}
              />
              {filterSuggestionsOpen && !filterSelectDisabled && (filterSuggestions.length > 0 || canCreateFilter) && (
                <div
                  className="absolute left-0 right-0 top-full z-40 mt-1 max-h-48 overflow-y-auto rounded-lg border p-1 shadow-xl"
                  style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}
                >
                  {filterSuggestions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); handlePickInternalFilter(opt); }}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition hover:bg-black/5 dark:hover:bg-white/5"
                      style={{ color: "var(--dm-text-secondary)" }}
                    >
                      <span className="truncate">{opt.label}</span>
                      {isCustomInternalFilterId(opt.id) && (
                        <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-brand-500)" }}>
                          criado
                        </span>
                      )}
                    </button>
                  ))}
                  {canCreateFilter && (
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); createFilterFromQuery(); }}
                      className="mt-1 flex w-full items-center gap-1.5 rounded-md border border-dashed px-2 py-1.5 text-left text-[11px] font-semibold transition hover:opacity-80"
                      style={{ borderColor: "var(--dm-brand-300)", color: "var(--dm-brand-500)" }}
                    >
                      <Plus size={11} />
                      Criar: {filterQuery.trim()}
                    </button>
                  )}
                </div>
              )}
            </div>
            {fieldErrors.filter && (
              <p className="mt-1 text-[10px] text-red-500">{fieldErrors.filter}</p>
            )}
          </div>
        )}

        <div className="flex items-stretch gap-2">
          <button
            type="button"
            onClick={() => void handleVerify()}
            disabled={!canContinueAfterFilters || verifyState === "loading"}
            className="flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 text-[11px] font-semibold transition disabled:opacity-50"
            style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)",
              color: "var(--dm-text-secondary)" }}
          >
            {verifyState === "loading"
              ? <Loader2 size={12} className="animate-spin" />
              : <Activity size={12} />}
            Carregar campanhas
          </button>
          {verifyState === "ok" && campaigns.length > 0 && (
            <button
              type="button"
              onClick={() => setCampaignListOpen((v) => !v)}
              className="flex h-9 flex-shrink-0 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-bold transition"
              style={{
                borderColor: "var(--dm-brand-200)",
                backgroundColor: "var(--dm-brand-50)",
                color: "var(--dm-brand-600)",
              }}
              title={campaignListOpen ? "Ocultar lista" : "Escolher campanhas"}
            >
              <Link2 size={11} />
              {selected.length}/{campaigns.length}
              <ChevronDown size={14} className={`transition ${campaignListOpen ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
        {verifyState === "error" && (
          <p className="text-[10px] text-red-500">{errMsg}</p>
        )}

        {verifyState === "ok" && campaigns.length > 0 && campaignListOpen && (
          <div className="pt-1">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: "var(--dm-text-secondary)" }}>
                Escolha as campanhas ({selected.length} de {campaigns.length})
              </span>
              <button type="button" onClick={toggleAll}
                className="text-[11px] font-semibold transition hover:opacity-70" style={{ color: "var(--dm-brand-500)" }}>
                {selected.length === campaigns.length ? "Desmarcar todas" : "Marcar todas"}
              </button>
            </div>
            <div className="relative mb-2">
              <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--dm-text-tertiary)" }} />
              <input type="text" value={campSearch} onChange={(e) => setCampSearch(e.target.value)}
                placeholder="Pesquisar campanha pelo nome…"
                className="h-10 w-full rounded-xl border pl-9 pr-3 text-xs outline-none transition focus:ring-1"
                style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }} />
            </div>
            <div className="max-h-72 overflow-y-auto rounded-xl border p-2 space-y-1"
              style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
              {campaigns
                .filter((c) => !campSearch.trim() || c.name.toLowerCase().includes(campSearch.toLowerCase()))
                .map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-slate-100/50 dark:hover:bg-slate-700/50">
                  <input type="checkbox" checked={selected.includes(c.id)}
                    onChange={() => toggleOne(c.id)}
                    className="h-4 w-4 flex-shrink-0 rounded accent-blue-600" />
                  <span className="flex-1 truncate text-xs" style={{ color: "var(--dm-text-primary)" }}
                    title={c.name}>{c.name}</span>
                  <span className={`flex-shrink-0 text-[10px] font-bold ${c.status === "ACTIVE" ? "text-emerald-500" : "text-amber-400"}`}>
                    {c.status === "ACTIVE" ? "● ativa" : "◐ pausada"}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="border-t pt-4" style={{ borderColor: "var(--dm-border-default)" }}>
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--dm-text-tertiary)" }}>
            Nome no Painel <span className="font-normal normal-case opacity-80">(opcional)</span>
          </label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Igual ao nome da Meta se deixado em branco"
            disabled={!canContinueAfterFilters}
            className="h-11 w-full rounded-xl border px-3.5 text-[13px] outline-none transition focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)",
              color: "var(--dm-text-primary)" }}
          />
        </div>
      </div>

      {/* Intenção + metas das campanhas selecionadas — etapa final, com respiro */}
      {verifyState === "ok" && selectedCampaigns.length > 0 && (
        <div className="rounded-2xl border p-5 space-y-4"
          style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--dm-text-tertiary)" }}>
                Intenção e Metas ({selectedCampaigns.length})
              </label>
              <p className="mt-1 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
                Intenção lida do objetivo configurado na Meta — os resultados alimentam o dashboard e o Perfil de Anunciantes.
              </p>
            </div>
            <button type="button" onClick={() => setCampaignListOpen(true)}
              className="flex flex-shrink-0 items-center gap-1 text-[11px] font-semibold transition hover:opacity-70"
              style={{ color: "var(--dm-brand-500)" }}>
              <Plus size={12} /> Mais campanhas
            </button>
          </div>
          <div className="space-y-3">
            {selectedCampaigns.map((c) => {
              const intent = intents[c.id] ?? detectIntent({ objective: c.objective, name: c.name });
              const meta = INTENT_META[intent];
              const goals = goalsMap[c.id] ?? {};
              return (
                <div key={c.id} className="rounded-xl border p-4 space-y-3.5"
                  style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
                  {/* nome + intenção */}
                  <div className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: meta.color }} />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold"
                      style={{ color: "var(--dm-text-primary)" }} title={c.name}>
                      {c.name}
                    </span>
                    <select value={intent}
                      onChange={(e) => setIntents((prev) => ({ ...prev, [c.id]: e.target.value as CampaignIntent }))}
                      className="h-9 flex-shrink-0 rounded-lg border px-2.5 text-xs font-semibold outline-none"
                      style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)", color: meta.color }}>
                      {INTENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  {/* orçamento + metas da intenção */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--dm-text-tertiary)" }}>
                        Orçamento /mês
                      </span>
                      <input type="number" min="0" step="any"
                        value={budgets[c.id] ?? ""}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          setBudgets((prev) => ({ ...prev, [c.id]: isNaN(v) || v <= 0 ? null : v }));
                        }}
                        placeholder="R$"
                        className="h-9 rounded-lg border px-2.5 text-xs outline-none text-right tabular-nums"
                        style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)", color: "var(--dm-text-primary)" }} />
                    </label>
                    {meta.goalFields.map((gf) => (
                      <label key={gf.id} className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--dm-text-tertiary)" }}>
                          Meta · {gf.label}
                        </span>
                        <input type="number" min="0" step="any"
                          value={goals[gf.id] ?? ""}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            setGoalsMap((prev) => {
                              const next = { ...(prev[c.id] ?? {}) };
                              if (isNaN(v) || v <= 0) delete next[gf.id]; else next[gf.id] = v;
                              return { ...prev, [c.id]: next };
                            });
                          }}
                          placeholder={gf.unit === "brl" ? "R$" : gf.unit === "pct" ? "%" : gf.unit === "x" ? "x" : "qtd"}
                          className="h-9 rounded-lg border px-2.5 text-xs outline-none text-right tabular-nums"
                          style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)", color: "var(--dm-text-primary)" }} />
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

          {saveErrMsg && (
            <p className="text-[10px] text-red-500">{saveErrMsg}</p>
          )}
          </div>

          {/* Footer fixo */}
          <div className="flex items-center gap-3 border-t px-7 py-4"
            style={{ borderColor: "var(--dm-border-subtle)", backgroundColor: "var(--dm-bg-elevated)" }}>
            {verifyState === "ok" && campaigns.length > 0 && selected.length === 0 && (
              <p className="flex-1 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
                Selecione ao menos uma campanha para salvar.
              </p>
            )}
            <button type="button" onClick={onCancel}
              className="flex h-11 min-w-[120px] items-center justify-center rounded-xl border text-xs font-semibold transition hover:opacity-80"
              style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
              Cancelar
            </button>
            <button type="button" onClick={() => void handleSave()}
              disabled={saving || (verifyState === "ok" && campaigns.length > 0 && selected.length === 0)}
              className="flex h-11 min-w-[180px] items-center justify-center gap-1.5 rounded-xl text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "var(--dm-brand-500)" }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {selected.length > 0 ? `Salvar ${selected.length} campanha${selected.length !== 1 ? "s" : ""}` : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── EditIntentGoalsModal ─────────────────────────────────────────────────────
// Edita intenção, orçamento e metas das campanhas de uma conta já salva,
// sem precisar reimportar nada. Grava direto na Central (camada de dados
// que alimenta o dashboard principal e o Perfil de Anunciantes).

interface CampaignDraft {
  intent: CampaignIntent;
  budget: number | null;
  goals: Record<string, number>;
}

function EditIntentGoalsModal({ entry, onClose }: { entry: UserAccountEntry; onClose: () => void }) {
  const { getEntry, upsertEntries } = useCampaignCenter();
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const editable = useMemo(() => (
    entry.selectedCampaignIds.length > 0
      ? entry.campaigns.filter((c) => entry.selectedCampaignIds.includes(c.id))
      : entry.campaigns
  ), [entry]);

  const [drafts, setDrafts] = useState<Record<string, CampaignDraft>>(() =>
    Object.fromEntries(editable.map((c) => {
      const ce = getEntry(c.id);
      return [c.id, {
        intent: ce?.intent ?? detectIntent({ name: c.name }),
        budget: ce?.monthlyBudget ?? null,
        goals:  ce?.goals ?? {},
      }];
    })),
  );

  const visible = editable.filter((c) =>
    !search.trim() || c.name.toLowerCase().includes(search.toLowerCase()));

  const handleSave = () => {
    setSaving(true);
    const now = new Date().toISOString();
    upsertEntries(editable.map((c) => {
      const d = drafts[c.id];
      const existing = getEntry(c.id);
      return {
        campaignId: c.id,
        campaignName: c.name,
        adAccountId: entry.adAccountId,
        adAccountLabel: entry.label,
        intent: d.intent,
        // intenção mudou → resultType acompanha o novo objective
        resultType: existing && existing.intent === d.intent
          ? existing.resultType
          : INTENT_META[d.intent].defaultResultTypes[0],
        groupId: existing?.groupId ?? entry.internalFilter ?? "",
        monthlyBudget: d.budget,
        goals: d.goals,
        enabled: existing?.enabled ?? (c.status === "ACTIVE"),
        autoConfigured: false,
        updatedAt: now,
      };
    }));
    toast.success("Intenção e metas atualizadas!");
    setSaving(false);
    onClose();
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[120] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[121] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto flex w-full max-w-[760px] max-h-[88vh] flex-col overflow-hidden rounded-[24px] border shadow-2xl"
          style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>

          {/* Header */}
          <div className="flex items-center justify-between border-b px-7 py-5"
            style={{ borderColor: "var(--dm-border-subtle)", backgroundColor: "var(--dm-bg-elevated)" }}>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full"
                style={{ backgroundColor: "rgba(99,102,200,0.12)" }}>
                <Target size={16} style={{ color: "#6366C8" }} />
              </div>
              <div>
                <h3 className="text-sm font-bold" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
                  Intenção e metas — {entry.label}
                </h3>
                <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
                  Ajuste a intenção, o orçamento e as metas de cada campanha desta conta.
                </p>
              </div>
            </div>
            <button type="button" onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-full transition hover:opacity-70"
              style={{ color: "var(--dm-text-tertiary)" }}>
              <X size={15} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-7 space-y-4">
            {editable.length > 6 && (
              <div className="relative">
                <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--dm-text-tertiary)" }} />
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Pesquisar campanha pelo nome…"
                  className="h-10 w-full rounded-xl border pl-9 pr-3 text-xs outline-none transition focus:ring-1"
                  style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }} />
              </div>
            )}
            {visible.map((c) => {
              const d = drafts[c.id];
              if (!d) return null;
              const meta = INTENT_META[d.intent];
              return (
                <div key={c.id} className="rounded-xl border p-4 space-y-3.5"
                  style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
                  <div className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: meta.color }} />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold"
                      style={{ color: "var(--dm-text-primary)" }} title={c.name}>
                      {c.name}
                    </span>
                    <select value={d.intent}
                      onChange={(e) => setDrafts((prev) => ({
                        ...prev,
                        [c.id]: { ...prev[c.id], intent: e.target.value as CampaignIntent, goals: {} },
                      }))}
                      className="h-9 flex-shrink-0 rounded-lg border px-2.5 text-xs font-semibold outline-none"
                      style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)", color: meta.color }}>
                      {INTENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--dm-text-tertiary)" }}>
                        Orçamento /mês
                      </span>
                      <input type="number" min="0" step="any" value={d.budget ?? ""}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          setDrafts((prev) => ({
                            ...prev,
                            [c.id]: { ...prev[c.id], budget: isNaN(v) || v <= 0 ? null : v },
                          }));
                        }}
                        placeholder="R$"
                        className="h-9 rounded-lg border px-2.5 text-xs outline-none text-right tabular-nums"
                        style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)", color: "var(--dm-text-primary)" }} />
                    </label>
                    {meta.goalFields.map((gf) => (
                      <label key={gf.id} className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--dm-text-tertiary)" }}>
                          Meta · {gf.label}
                        </span>
                        <input type="number" min="0" step="any" value={d.goals[gf.id] ?? ""}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            setDrafts((prev) => {
                              const goals = { ...prev[c.id].goals };
                              if (isNaN(v) || v <= 0) delete goals[gf.id]; else goals[gf.id] = v;
                              return { ...prev, [c.id]: { ...prev[c.id], goals } };
                            });
                          }}
                          placeholder={gf.unit === "brl" ? "R$" : gf.unit === "pct" ? "%" : gf.unit === "x" ? "x" : "qtd"}
                          className="h-9 rounded-lg border px-2.5 text-xs outline-none text-right tabular-nums"
                          style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)", color: "var(--dm-text-primary)" }} />
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-3 border-t px-7 py-4"
            style={{ borderColor: "var(--dm-border-subtle)", backgroundColor: "var(--dm-bg-elevated)" }}>
            <div className="flex-1" />
            <button type="button" onClick={onClose}
              className="flex h-11 min-w-[120px] items-center justify-center rounded-xl border text-xs font-semibold transition hover:opacity-80"
              style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
              Cancelar
            </button>
            <button type="button" onClick={handleSave} disabled={saving}
              className="flex h-11 min-w-[180px] items-center justify-center gap-1.5 rounded-xl text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "var(--dm-brand-500)" }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Salvar alterações
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── EntryRow ─────────────────────────────────────────────────────────────────

interface EntryRowProps {
  entry: UserAccountEntry;
  categorySlug: string;
  onDeleted: (id: string) => void;
  onToggled: (entry: UserAccountEntry) => void;
  /** Chamado quando selectedCampaignIds é alterado — mesmo shape que onToggled. */
  onUpdated: (entry: UserAccountEntry) => void;
}

function EntryRow({ entry, categorySlug, onDeleted, onToggled, onUpdated }: EntryRowProps) {
  const { removeEntry: removeCenterEntry } = useCampaignCenter();
  const [editGoalsOpen, setEditGoalsOpen] = useState(false);
  const [deleting,  setDeleting]  = useState(false);
  const [expanded,  setExpanded]  = useState(false);
  const [toggling,  setToggling]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [campFilter, setCampFilter] = useState("");
  const campCount = entry.campaigns.length;
  const selCount  = entry.selectedCampaignIds.length || campCount;
  const filterLabel = getInternalFilterLabel(categorySlug, entry.internalFilter);

  // ── Edição inline de selectedCampaignIds — draft state ─────────────────────
  const allCampIds = useMemo(() => entry.campaigns.map(c => c.id), [entry.campaigns]);
  const filteredCampaigns = useMemo(() => {
    const q = campFilter.trim().toLowerCase();
    return q ? entry.campaigns.filter(c => (c.name ?? "").toLowerCase().includes(q)) : entry.campaigns;
  }, [entry.campaigns, campFilter]);

  // null = todas selecionadas (espelha a convenção [] do banco); string[] = subset explícito
  const [draftIds, setDraftIds] = useState<string[] | null>(null);

  // Inicializa o draft sempre que o painel é aberto
  useEffect(() => {
    if (!expanded) return;
    setDraftIds(entry.selectedCampaignIds.length === 0 ? null : [...entry.selectedCampaignIds]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]); // omite entry intencionalmente — só reseta ao abrir/fechar

  // isDirty: true quando o draft difere do estado salvo
  const isDirty = useMemo(() => {
    if (draftIds === null) return entry.selectedCampaignIds.length !== 0;
    if (entry.selectedCampaignIds.length === 0) return draftIds.length !== 0;
    return (
      draftIds.length !== entry.selectedCampaignIds.length ||
      draftIds.some(id => !entry.selectedCampaignIds.includes(id))
    );
  }, [draftIds, entry.selectedCampaignIds]);

  // Checkbox lê do draft — badge de contagem lê do estado salvo (sem flicker)
  const isChecked      = (campId: string) => draftIds === null || draftIds.includes(campId);
  const selCountDraft  = draftIds === null ? campCount : draftIds.length;

  // Handlers de draft — sem chamada de API
  const handleToggleCampaign = (campId: string) => {
    setDraftIds(prev => {
      const current = prev === null ? allCampIds : prev;
      return current.includes(campId)
        ? current.filter(id => id !== campId)
        : [...current, campId];
    });
  };

  const handleSelectAll   = () => setDraftIds(null); // null = todas
  const handleDeselectAll = () => setDraftIds([]);   // [] = nenhuma — usuário escolhe do zero

  // Salvar: uma única chamada ao Supabase com a seleção final
  const handleSave = async () => {
    setSaving(true);
    try {
      // Convenção: se draft = todas → armazena [] (significa "todas" no banco)
      const toStore = draftIds === null || draftIds.length === allCampIds.length ? [] : draftIds;
      const updated = await upsertUserAccountEntry({ ...entry, selectedCampaignIds: toStore });
      onUpdated(updated);
      setExpanded(false);
    } catch { /* mantém isDirty — usuário pode tentar novamente */ } finally { setSaving(false); }
  };

  // Cancelar: reverte draft e fecha o painel
  const handleCancel = () => {
    setDraftIds(null);
    setExpanded(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteUserAccountEntry(entry.id);
      // remove também da Central — sem isso a intenção/metas ficam órfãs
      entry.campaigns.forEach((c) => removeCenterEntry(c.id));
      onDeleted(entry.id);
    } catch { setDeleting(false); }
  };

  const handleToggle = async () => {
    setToggling(true);
    try {
      const updated = await upsertUserAccountEntry({
        id: entry.id, categoryId: entry.categoryId, label: entry.label,
        adAccountId: entry.adAccountId, internalFilter: entry.internalFilter,
        campaigns: entry.campaigns,
        selectedCampaignIds: entry.selectedCampaignIds, isEnabled: !entry.isEnabled,
      });
      onToggled(updated);
    } catch { /* ignore */ } finally { setToggling(false); }
  };

  return (
    <div className="rounded-lg border" style={{ borderColor: "var(--dm-border-default)",
      backgroundColor: "var(--dm-bg-elevated)", opacity: entry.isEnabled ? 1 : 0.6 }}>
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Toggle */}
        <button type="button" onClick={() => void handleToggle()} disabled={toggling}
          title={entry.isEnabled ? "Desativar" : "Ativar"}
          aria-label={`${entry.isEnabled ? "Desativar" : "Ativar"} ${entry.label}`} aria-pressed={entry.isEnabled}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition-colors hover:bg-black/5 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366C8] disabled:opacity-50 dark:hover:bg-white/10">
          {entry.isEnabled
            ? <Eye size={14} className="text-emerald-500" />
            : <EyeOff size={14} style={{ color: "var(--dm-text-tertiary)" }} />}
        </button>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>
            {entry.label}
          </p>
          {filterLabel && (
            <p className="truncate text-[9px] font-medium" style={{ color: "var(--dm-text-tertiary)" }}>
              {filterLabel}
            </p>
          )}
          <p className="truncate text-[10px] font-mono" style={{ color: "var(--dm-text-tertiary)" }}>
            {entry.adAccountId}
          </p>
        </div>

        {/* Campaign count badge */}
        {campCount > 0 && (
          <button type="button" onClick={() => setExpanded(v => !v)} aria-expanded={expanded}
            aria-label={`${selCount} de ${campCount} campanhas — ${expanded ? "recolher" : "expandir"}`}
            className="flex flex-shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums transition-all hover:opacity-80 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366C8]"
            style={{ backgroundColor: "var(--dm-bg-surface)", color: "var(--dm-brand-500)",
              border: "1px solid var(--dm-brand-200)" }}>
            <Link2 size={8} />
            {selCount}/{campCount}
            {expanded ? <ChevronUp size={8} /> : <ChevronDown size={8} />}
          </button>
        )}

        {/* Editar intenção e metas */}
        {campCount > 0 && (
          <button type="button" onClick={() => setEditGoalsOpen(true)}
            title="Editar intenção, orçamento e metas das campanhas" aria-label={`Editar intenção e metas de ${entry.label}`}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition-colors hover:bg-indigo-100 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366C8] dark:hover:bg-indigo-900/30"
            style={{ color: "var(--dm-brand-500)" }}>
            <Pencil size={12} />
          </button>
        )}

        {/* Delete */}
        <button type="button" onClick={() => void handleDelete()} disabled={deleting}
          title="Remover conta" aria-label={`Remover conta ${entry.label}`}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition-colors hover:bg-red-100 hover:text-red-500 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-40 dark:hover:bg-red-900/30 dark:hover:text-red-400"
          style={{ color: "var(--dm-text-tertiary)" }}>
          {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
        </button>
      </div>

      {editGoalsOpen && (
        <EditIntentGoalsModal entry={entry} onClose={() => setEditGoalsOpen(false)} />
      )}

      {/* Campaign list (expanded) — checkboxes interativos com draft local */}
      {expanded && campCount > 0 && (
        <div className="mx-2 mb-2 rounded border overflow-hidden"
          style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
          {/* Bulk actions header */}
          <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5"
            style={{ borderColor: "var(--dm-border-subtle)", backgroundColor: "var(--dm-bg-elevated)" }}>
            <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
              {selCountDraft === campCount ? "Todas as campanhas" : `${selCountDraft} de ${campCount} selecionadas`}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleSelectAll} disabled={saving}
                className="text-[9px] font-semibold transition hover:opacity-70 disabled:opacity-40"
                style={{ color: "var(--dm-brand-500)" }}>Selecionar todas</button>
              <span style={{ color: "var(--dm-border-default)" }}>·</span>
              <button type="button" onClick={handleDeselectAll} disabled={saving || selCountDraft === 0}
                className="text-[9px] font-semibold transition hover:opacity-70 disabled:opacity-40"
                style={{ color: "var(--dm-text-tertiary)" }}>Limpar</button>
            </div>
          </div>
          {/* Busca de campanha */}
          {campCount > 6 && (
            <div className="flex items-center gap-1.5 border-b px-2 py-1.5"
              style={{ borderColor: "var(--dm-border-subtle)", backgroundColor: "var(--dm-bg-surface)" }}>
              <Search size={11} style={{ color: "var(--dm-text-tertiary)" }} />
              <input
                type="text"
                value={campFilter}
                onChange={(e) => setCampFilter(e.target.value)}
                placeholder={`Buscar entre ${campCount} campanhas…`}
                className="flex-1 bg-transparent text-[10px] outline-none"
                style={{ color: "var(--dm-text-primary)" }}
              />
              {campFilter && (
                <button type="button" onClick={() => setCampFilter("")}
                  className="text-[9px] font-semibold" style={{ color: "var(--dm-text-tertiary)" }}>limpar</button>
              )}
            </div>
          )}
          {/* Campaign rows */}
          <div className="max-h-48 overflow-y-auto">
            {filteredCampaigns.length === 0 && (
              <p className="px-2 py-3 text-center text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                Nenhuma campanha encontrada
              </p>
            )}
            {filteredCampaigns.map(c => {
              const checked = isChecked(c.id);
              return (
                <button key={c.id} type="button" disabled={saving}
                  onClick={() => handleToggleCampaign(c.id)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left transition hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50">
                  {/* Checkbox visual */}
                  <span className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border transition
                    ${checked ? "border-emerald-500 bg-emerald-500" : "border-slate-400"}`}>
                    {checked && (
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                        <path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </span>
                  <span className="flex-1 truncate text-[10px]" style={{ color: "var(--dm-text-secondary)" }}
                    title={c.name}>{c.name}</span>
                  <span className={`flex-shrink-0 text-[9px] font-bold ${c.status === "ACTIVE" ? "text-emerald-500" : "text-amber-400"}`}>
                    {c.status === "ACTIVE" ? "● ativa" : "◐ pausada"}
                  </span>
                </button>
              );
            })}
          </div>
          {/* Footer: Salvar / Cancelar — só aparece quando há alterações pendentes */}
          {isDirty && (
            <div className="flex items-center justify-end gap-2 border-t px-2 py-1.5"
              style={{ borderColor: "var(--dm-border-subtle)", backgroundColor: "var(--dm-bg-elevated)" }}>
              <button type="button" onClick={handleCancel} disabled={saving}
                className="text-[10px] font-semibold transition hover:opacity-70 disabled:opacity-40"
                style={{ color: "var(--dm-text-tertiary)" }}>
                Cancelar
              </button>
              <button type="button" onClick={() => void handleSave()} disabled={saving}
                className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: "var(--dm-brand-500)" }}>
                {saving ? <Loader2 size={9} className="animate-spin" /> : <Save size={9} />}
                Salvar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── CategorySection ──────────────────────────────────────────────────────────

interface CategorySectionProps {
  slug: string;
  name: string;
  emoji: string;
  categoryRecord: UserCategory | undefined;
  entries: UserAccountEntry[];
  onCategoryToggle:  (slug: string, enabled: boolean) => void;
  onCategoryCreated: (cat: UserCategory) => void;
  onCategoryUpdated?: (cat: UserCategory) => void;
  onEntrySaved:    (entry: UserAccountEntry) => void;
  onEntryDeleted:  (id: string) => void;
  onEntryToggled:  (entry: UserAccountEntry) => void;
  onEntryUpdated:  (entry: UserAccountEntry) => void;
  isCustom?: boolean;
  onDeleteCategory?: (slug: string) => void;
  onPainelSaveNavigate?: (detail: { entry: UserAccountEntry; categorySlug: string; isCustom: boolean }) => void;
}

function CategorySection({
  slug, name, emoji, categoryRecord, entries,
  onCategoryToggle, onCategoryCreated, onCategoryUpdated, onEntrySaved, onEntryDeleted, onEntryToggled, onEntryUpdated,
  isCustom, onDeleteCategory, onPainelSaveNavigate,
}: CategorySectionProps) {
  const [showAdd,        setShowAdd]        = useState(false);
  const [toggling,       setToggling]       = useState(false);
  const [localRecord,    setLocalRecord]    = useState(categoryRecord);
  const isEnabled = (localRecord ?? categoryRecord)?.isEnabled ?? true;

  // Nome/emoji efetivos: override por empresa (DB) vence o default do template.
  const rec          = localRecord ?? categoryRecord;
  const displayName  = rec?.name || name;
  const displayEmoji = rec?.emoji || emoji;

  // ── Renomear o filtro (nome + emoji) por empresa — slug fica estável ──
  const [editing,   setEditing]   = useState(false);
  const [editName,  setEditName]  = useState(displayName);
  const [editEmoji, setEditEmoji] = useState(displayEmoji);
  const [savingEdit, setSavingEdit] = useState(false);
  const openEdit = () => { setEditName(displayName); setEditEmoji(displayEmoji); setEditing(true); };
  const handleSaveEdit = async () => {
    if (!editName.trim()) return;
    setSavingEdit(true);
    try {
      const saved = await upsertUserCategory({
        id:        rec?.id,
        slug,
        name:      editName.trim(),
        type:      isCustom ? "custom" : "fixed",
        emoji:     editEmoji || null,
        position:  rec?.position,
        isEnabled: rec?.isEnabled ?? true,
      });
      setLocalRecord(saved);
      (onCategoryUpdated ?? onCategoryCreated)(saved);
      setEditing(false);
    } finally { setSavingEdit(false); }
  };
  const customFilterOptions = useMemo<CategoryInternalFilterOption[]>(() => {
    if (isCustom) return [];
    const seen = new Set<string>();
    return entries
      .map((entry) => entry.internalFilter)
      .filter(isCustomInternalFilterId)
      .map((id) => {
        const parsed = parseCustomInternalFilterId(id);
        if (!parsed || parsed.categorySlug !== slug || seen.has(id)) return null;
        seen.add(id);
        return { id, label: getCustomInternalFilterLabel(id) ?? parsed.label };
      })
      .filter(Boolean) as CategoryInternalFilterOption[];
  }, [entries, isCustom, slug]);

  // Sync localRecord when parent prop changes (e.g. after creation callback)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (categoryRecord) setLocalRecord(categoryRecord);
  }, [categoryRecord]);

  // Creates the Supabase record on demand (first time user interacts with this category)
  const ensureRecord = async (): Promise<UserCategory> => {
    if (localRecord) return localRecord;
    const created = await upsertUserCategory({
      slug, name, type: isCustom ? "custom" : "fixed", emoji: emoji || null,
    });
    setLocalRecord(created);
    onCategoryCreated(created);
    return created;
  };

  const handleToggle = async () => {
    setToggling(true);
    try {
      await ensureRecord();
      await onCategoryToggle(slug, !isEnabled);
    } finally { setToggling(false); }
  };

  return (
    <div className="rounded-xl border overflow-hidden"
      style={{ borderColor: "var(--dm-border-default)" }}>

      {/* Category header */}
      <div className="flex items-center gap-3 px-4 py-3"
        style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
        {editing ? (
          <div className="flex flex-1 items-center gap-2">
            <input value={editEmoji} onChange={(e) => setEditEmoji(e.target.value)}
              maxLength={2} placeholder="📌"
              className="h-8 w-10 rounded-lg border text-center text-base outline-none"
              style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }} />
            <input value={editName} onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleSaveEdit(); if (e.key === "Escape") setEditing(false); }}
              autoFocus placeholder="Nome do filtro"
              className="h-8 flex-1 rounded-lg border px-2.5 text-[13px] outline-none"
              style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)", color: "var(--dm-text-primary)" }} />
            <button type="button" onClick={() => void handleSaveEdit()} disabled={savingEdit || !editName.trim()}
              className="flex h-8 items-center gap-1 rounded-lg px-2.5 text-[11px] font-bold text-white transition hover:opacity-90 disabled:opacity-40"
              style={{ background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)" }}>
              {savingEdit ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Salvar
            </button>
            <button type="button" onClick={() => setEditing(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-black/5"
              style={{ color: "var(--dm-text-tertiary)" }}>
              <XCircle size={13} />
            </button>
          </div>
        ) : (
          <>
            <span className="text-base leading-none">{displayEmoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold truncate" style={{ color: "var(--dm-text-primary)" }}>
                {displayName}
              </p>
              <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                {entries.length === 0 ? "Nenhuma conta vinculada" : `${entries.length} conta${entries.length > 1 ? "s" : ""}`}
              </p>
            </div>

            {/* Renomear filtro (por empresa) */}
            <button type="button" onClick={openEdit} title="Renomear filtro" aria-label={`Renomear filtro ${displayName}`}
              className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-black/5 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366C8] dark:hover:bg-white/10"
              style={{ color: "var(--dm-text-tertiary)" }}>
              <Pencil size={13} />
            </button>
          </>
        )}

        {/* Toggle enable/disable */}
        {!editing && (
          <button type="button" onClick={() => void handleToggle()} disabled={toggling}
            title={isEnabled ? "Desativar categoria" : "Ativar categoria"}
            aria-label={`${isEnabled ? "Desativar" : "Ativar"} filtro ${displayName}`} aria-pressed={isEnabled}
            className={`flex h-6 items-center gap-1 rounded-full px-2 text-[10px] font-bold transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366C8] disabled:opacity-50 ${
              isEnabled
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500"
            }`}>
            {toggling
              ? <Loader2 size={9} className="animate-spin" />
              : isEnabled ? <CheckCircle2 size={9} /> : <XCircle size={9} />}
            {isEnabled ? "ativo" : "inativo"}
          </button>
        )}

        {/* Delete (custom categories only) */}
        {!editing && isCustom && onDeleteCategory && (
          <button type="button" onClick={() => onDeleteCategory(slug)}
            title="Remover filtro" aria-label={`Remover filtro ${displayName}`}
            className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-red-100 hover:text-red-500 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 dark:hover:bg-red-900/30 dark:hover:text-red-400"
            style={{ color: "var(--dm-text-tertiary)" }}>
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* Entries */}
      {(entries.length > 0 || showAdd) && (
        <div className="p-3 space-y-2" style={{ borderTop: "1px solid var(--dm-border-default)" }}>
          {entries.map(entry => (
            <EntryRow key={entry.id} entry={entry} categorySlug={slug}
              onDeleted={onEntryDeleted} onToggled={onEntryToggled} onUpdated={onEntryUpdated} />
          ))}

          {showAdd && localRecord && (
            <AddEntryForm
              categoryId={localRecord.id}
              categorySlug={slug}
              categoryLabel={name}
              isCustomCategory={!!isCustom}
              customFilterOptions={customFilterOptions}
              onSaved={entry => {
                onEntrySaved(entry);
                setShowAdd(false);
                onPainelSaveNavigate?.({ entry, categorySlug: slug, isCustom: !!isCustom });
              }}
              onCancel={() => setShowAdd(false)}
            />
          )}
        </div>
      )}

      {/* Add account button */}
      {!showAdd && (
        <div className="px-3 pb-3" style={{ paddingTop: entries.length > 0 ? 0 : "0.75rem" }}>
          <button type="button"
            onClick={() => void ensureRecord().then(() => setShowAdd(true))}
            aria-label={`Adicionar conta em ${displayName}`}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2.5 text-[11px] font-semibold transition-all hover:border-[#6366C8] hover:text-[#6366C8] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366C8]"
            style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
            <Plus size={13} /> Adicionar conta
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Contas & Campanhas ──────────────────────────────────────────────────

export interface TabAccountsProps {
  categories: UserCategory[];
  accountEntries: UserAccountEntry[];
  onCategoriesChange: (cats: UserCategory[]) => void;
  onEntriesChange:    (entries: UserAccountEntry[]) => void;
  onPainelSaveNavigate?: (detail: { entry: UserAccountEntry; categorySlug: string; isCustom: boolean }) => void;
}

export function TabAccounts({ categories, accountEntries, onCategoriesChange, onEntriesChange, onPainelSaveNavigate }: TabAccountsProps) {
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatEmoji, setNewCatEmoji] = useState("📌");
  const [savingCat, setSavingCat] = useState(false);
  const [catErr, setCatErr] = useState("");

  const customCats = categories.filter(c => c.type === "custom");
  const canAddCustom = customCats.length < MAX_CUSTOM_CATEGORIES;

  const handleToggleCategory = async (slug: string, enabled: boolean) => {
    const existing = categories.find(c => c.slug === slug);
    const fixedDef = FIXED_CATEGORIES.find(f => f.slug === slug);
    const updated = await upsertUserCategory({
      id:        existing?.id,
      slug,
      name:      existing?.name ?? fixedDef?.name ?? slug,
      type:      existing?.type ?? "fixed",
      emoji:     existing?.emoji ?? fixedDef?.emoji ?? null,
      position:  existing?.position ?? fixedDef?.defaultPosition ?? 0,
      isEnabled: enabled,
    });
    onCategoriesChange(
      categories.some(c => c.slug === slug)
        ? categories.map(c => c.slug === slug ? updated : c)
        : [...categories, updated],
    );
  };

  const handleCategoryUpserted = (cat: UserCategory) => {
    onCategoriesChange(
      categories.some(c => c.id === cat.id || c.slug === cat.slug)
        ? categories.map(c => (c.id === cat.id || c.slug === cat.slug) ? cat : c)
        : [...categories, cat],
    );
  };

  const handleEntrySaved = (entry: UserAccountEntry) => {
    onEntriesChange(
      accountEntries.some(e => e.id === entry.id)
        ? accountEntries.map(e => e.id === entry.id ? entry : e)
        : [...accountEntries, entry],
    );
  };

  const handleEntryDeleted = (id: string) => {
    onEntriesChange(accountEntries.filter(e => e.id !== id));
  };

  const handleEntryToggled = (entry: UserAccountEntry) => {
    onEntriesChange(accountEntries.map(e => e.id === entry.id ? entry : e));
  };

  const handleDeleteCustom = async (slug: string) => {
    const cat = categories.find(c => c.slug === slug);
    if (!cat) return;
    await deleteUserCategory(cat.id);
    onCategoriesChange(categories.filter(c => c.slug !== slug));
    onEntriesChange(accountEntries.filter(e => e.categoryId !== cat.id));
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    setSavingCat(true);
    setCatErr("");
    try {
      const slug = `custom-${Date.now()}`;
      const cat = await upsertUserCategory({
        slug, name: newCatName.trim(), type: "custom",
        emoji: newCatEmoji || "📌", position: 10 + customCats.length,
      });
      onCategoriesChange([...categories, cat]);
      setNewCatName(""); setNewCatEmoji("📌"); setShowNewCat(false);
    } catch (e) {
      setCatErr(e instanceof Error ? e.message : "Erro ao criar categoria.");
    } finally { setSavingCat(false); }
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider mb-3"
          style={{ color: "var(--dm-text-tertiary)" }}>Categorias fixas</p>
        <div className="space-y-2">
          {FIXED_CATEGORIES.map(fc => {
            const catRecord = categories.find(c => c.slug === fc.slug);
            const entries   = catRecord
              ? accountEntries.filter(e => e.categoryId === catRecord.id)
              : [];
            return (
              <CategorySection key={fc.slug}
                slug={fc.slug} name={fc.name} emoji={fc.emoji}
                categoryRecord={catRecord} entries={entries}
                onCategoryToggle={handleToggleCategory}
                onCategoryCreated={cat => onCategoriesChange([...categories, cat])}
                onCategoryUpdated={handleCategoryUpserted}
                onEntrySaved={handleEntrySaved}
                onEntryDeleted={handleEntryDeleted}
                onEntryToggled={handleEntryToggled}
                onEntryUpdated={handleEntryToggled}
                onPainelSaveNavigate={onPainelSaveNavigate}
              />
            );
          })}
        </div>
      </div>

      {/* Custom categories */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-bold uppercase tracking-wider"
            style={{ color: "var(--dm-text-tertiary)" }}>
            Categorias personalizadas
          </p>
          <span className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
            {customCats.length}/{MAX_CUSTOM_CATEGORIES}
          </span>
        </div>

        {customCats.length > 0 && (
          <div className="space-y-2 mb-2">
            {customCats.map(cat => {
              const entries = accountEntries.filter(e => e.categoryId === cat.id);
              return (
                <CategorySection key={cat.slug}
                  slug={cat.slug} name={cat.name} emoji={cat.emoji ?? "📌"}
                  categoryRecord={cat} entries={entries}
                  onCategoryToggle={handleToggleCategory}
                  onCategoryCreated={created => onCategoriesChange(categories.map(c => c.id === created.id ? created : c))}
                  onCategoryUpdated={handleCategoryUpserted}
                  onEntrySaved={handleEntrySaved}
                  onEntryDeleted={handleEntryDeleted}
                  onEntryToggled={handleEntryToggled}
                  onEntryUpdated={handleEntryToggled}
                  isCustom
                  onDeleteCategory={handleDeleteCustom}
                  onPainelSaveNavigate={onPainelSaveNavigate}
                />
              );
            })}
          </div>
        )}

        {/* New custom category form */}
        {showNewCat ? (
          <div className="rounded-xl border p-3 space-y-3"
            style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
            <div className="flex gap-2">
              <input
                value={newCatEmoji}
                onChange={e => setNewCatEmoji(e.target.value.slice(-2))}
                placeholder="📌"
                maxLength={2}
                className="h-8 w-12 rounded-lg border text-center text-base outline-none focus:ring-1"
                style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}
              />
              <input
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                placeholder="Nome da categoria"
                className="h-8 flex-1 rounded-lg border px-3 text-xs outline-none focus:ring-1"
                style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)",
                  color: "var(--dm-text-primary)" }}
              />
            </div>
            {catErr && <p className="text-[10px] text-red-500">{catErr}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowNewCat(false)}
                className="flex h-8 flex-1 items-center justify-center rounded-lg border text-xs font-semibold"
                style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
                Cancelar
              </button>
              <button type="button" onClick={() => void handleCreateCategory()}
                disabled={!newCatName.trim() || savingCat}
                className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg text-xs font-bold text-white disabled:opacity-50"
                style={{ backgroundColor: "var(--dm-brand-500)" }}>
                {savingCat ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                Criar
              </button>
            </div>
          </div>
        ) : canAddCustom ? (
          <button type="button" onClick={() => setShowNewCat(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed py-2.5 text-xs font-semibold transition hover:opacity-80"
            style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
            <Plus size={13} /> Nova categoria
          </button>
        ) : (
          <p className="text-center text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
            Limite de {MAX_CUSTOM_CATEGORIES} categorias personalizadas atingido.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Integrações ─────────────────────────────────────────────────────────

// ─── Instagram localStorage key ──────────────────────────────────────────────
const IG_TOKEN_LS_KEY = "pta_ig_app_token_v1";

function loadIgToken(): string {
  if (typeof window === "undefined") return "";
  try { return localStorage.getItem(IG_TOKEN_LS_KEY) ?? ""; } catch { return ""; }
}
function saveIgToken(t: string) {
  try { localStorage.setItem(IG_TOKEN_LS_KEY, t); } catch {}
}

// Reads advertiser profiles from localStorage (client-side only)
function loadAdvertiserProfiles(): Array<{ id: string; name: string; instagramUserId?: string; instagramUsername?: string }> {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("pta_advertiser_profiles_v2");
    if (!raw) return [];
    return JSON.parse(raw) as Array<{ id: string; name: string; instagramUserId?: string; instagramUsername?: string }>;
  } catch { return []; }
}

interface IgRegisterStatus {
  ibaId: string;
  state: "idle" | "loading" | "success" | "error";
  message?: string;
  daysBackfilled?: number;
}

interface IgConnectedAccount {
  id: string;
  instagramBusinessAccountId: string;
  username: string;
  name: string;
  followersCount: number;
  connectionStatus: string;
  historyDays: number;
}

function InstagramIntegrationSection() {
  const [accounts,   setAccounts]   = useState<IgConnectedAccount[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [syncing,    setSyncing]    = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [banner,     setBanner]     = useState<{ kind: "ok" | "err" | "empty"; text: string } | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  // Advanced manual fallback
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [igToken,    setIgToken]    = useState(() => loadIgToken());
  const [igVisible,  setIgVisible]  = useState(false);
  const [igSaved,    setIgSaved]    = useState(false);
  const [customIba,  setCustomIba]  = useState("");
  const [manualStatuses, setManualStatuses] = useState<Record<string, IgRegisterStatus>>({});

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/instagram/history", { method: "POST" });
      const json = await res.json() as IgConnectedAccount[] | { error?: string };
      if (Array.isArray(json)) setAccounts(json);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  // Lê o resultado do callback OAuth (?ig_oauth=...) e carrega contas
  useEffect(() => {
    void loadAccounts();
    try {
      const params = new URLSearchParams(window.location.search);
      const status = params.get("ig_oauth");
      if (status) {
        if (status === "connected") {
          const count = params.get("count") ?? "0";
          setBanner({ kind: "ok", text: `${count} conta(s) conectada(s) com sucesso!` });
        } else if (status === "empty") {
          setBanner({ kind: "empty", text: "Nenhuma conta Instagram Business encontrada nessa conta Facebook." });
        } else {
          setBanner({ kind: "err", text: params.get("reason") ?? "Falha ao conectar." });
        }
        // limpa a query da URL
        params.delete("ig_oauth"); params.delete("count"); params.delete("reason");
        const clean = window.location.pathname + (params.toString() ? `?${params}` : "");
        window.history.replaceState({}, "", clean);
      }
    } catch { /* silent */ }
  }, [loadAccounts]);

  const connectOAuth = () => {
    window.location.href = "/api/instagram/oauth/start";
  };

  const doRefresh = async (accountId: string) => {
    setRefreshingId(accountId);
    try {
      const res = await fetch("/api/instagram/accounts/refresh", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? "Falha");
      await loadAccounts();
    } catch (e) {
      setBanner({ kind: "err", text: e instanceof Error ? e.message : "Falha ao sincronizar conta." });
    } finally { setRefreshingId(null); }
  };

  const doSyncAll = async () => {
    setSyncing(true); setSyncResult(null);
    try {
      const res  = await fetch("/api/instagram/accounts/sync-all", { method: "POST" });
      const json = await res.json() as { synced?: number; failed?: number; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? "Erro desconhecido");
      setSyncResult(`${json.synced ?? 0} sincronizada(s)${(json.failed ?? 0) > 0 ? ` · ${json.failed} falha(s)` : ""}`);
      await loadAccounts();
    } catch (e) {
      setSyncResult(`Erro: ${e instanceof Error ? e.message : "falha"}`);
    } finally { setSyncing(false); }
  };

  // ── Manual fallback (avançado) ──────────────────────────────────────────────
  const handleSaveToken = () => {
    saveIgToken(igToken.trim());
    setIgSaved(true);
    setTimeout(() => setIgSaved(false), 2000);
  };

  const doManualRegister = async (ibaId: string) => {
    const token = igToken.trim();
    if (!token || !ibaId.trim()) return;
    setManualStatuses(prev => ({ ...prev, [ibaId]: { ibaId, state: "loading" } }));
    try {
      const res = await fetch("/api/instagram/accounts/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instagramBusinessAccountId: ibaId.trim(), accessToken: token }),
      });
      const json = await res.json() as { account?: { username: string }; daysBackfilled?: number; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? "Erro desconhecido");
      setManualStatuses(prev => ({
        ...prev,
        [ibaId]: { ibaId, state: "success", daysBackfilled: json.daysBackfilled, message: `@${json.account?.username ?? "?"} registrado` },
      }));
      setCustomIba("");
      await loadAccounts();
    } catch (e) {
      setManualStatuses(prev => ({
        ...prev,
        [ibaId]: { ibaId, state: "error", message: e instanceof Error ? e.message : "Falha ao registrar" },
      }));
    }
  };

  const statusChip = (s: string) => {
    if (s === "expired") return { label: "Reconectar", bg: "rgba(238,87,87,0.12)", color: "#EE5757" };
    if (s === "error")   return { label: "Erro",       bg: "rgba(255,181,71,0.14)", color: "#FFB547" };
    return { label: "Ativo", bg: "rgba(5,205,153,0.12)", color: "#05CD99" };
  };

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
          <AtSign size={15} style={{ color: "#E1306C" }} />
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>Instagram</p>
          <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>Conecte via Facebook — sem colar token</p>
        </div>
      </div>

      {/* Banner do resultado OAuth */}
      {banner && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border p-2.5 text-[11px]"
          style={{
            borderColor: banner.kind === "ok" ? "rgba(5,205,153,0.4)" : banner.kind === "empty" ? "var(--dm-border-default)" : "rgba(238,87,87,0.4)",
            backgroundColor: banner.kind === "ok" ? "rgba(5,205,153,0.08)" : "var(--dm-bg-elevated)",
            color: banner.kind === "ok" ? "#05CD99" : banner.kind === "err" ? "#EE5757" : "var(--dm-text-secondary)",
          }}>
          {banner.kind === "ok" ? <CheckCircle2 size={13} className="mt-px shrink-0" /> : <XCircle size={13} className="mt-px shrink-0" />}
          <span className="flex-1">{banner.text}</span>
          <button type="button" onClick={() => setBanner(null)} style={{ color: "inherit" }}><X size={12} /></button>
        </div>
      )}

      {/* Botão Conectar (OAuth) */}
      <button type="button" onClick={connectOAuth}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-lg text-xs font-bold text-white transition"
        style={{ backgroundColor: "#E1306C" }}>
        <Link2 size={14} />
        Conectar Instagram
      </button>
      <p className="mt-1.5 text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
        Faça login com o Facebook que administra as Páginas/contas. As contas conectam e atualizam sozinhas todo dia.
      </p>

      {/* Contas conectadas */}
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>
            Contas conectadas
          </p>
          {loading && <Loader2 size={11} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} />}
        </div>

        {!loading && accounts.length === 0 && (
          <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
            Nenhuma conta conectada ainda.
          </p>
        )}

        {accounts.map(acc => {
          const chip = statusChip(acc.connectionStatus);
          return (
            <div key={acc.id} className="flex items-center gap-2 rounded-xl border p-2.5"
              style={{ borderColor: "var(--dm-border-subtle)", backgroundColor: "var(--dm-bg-elevated)" }}>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold truncate" style={{ color: "var(--dm-text-primary)" }}>
                  {acc.name}
                  {acc.username && (
                    <span className="ml-1.5 font-normal" style={{ color: "var(--dm-text-tertiary)" }}>@{acc.username}</span>
                  )}
                </p>
                <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                  {acc.followersCount.toLocaleString("pt-BR")} seguidores · {acc.historyDays}d histórico
                </p>
              </div>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ background: chip.bg, color: chip.color }}>
                {chip.label}
              </span>
              {acc.connectionStatus === "expired" ? (
                <button type="button" onClick={connectOAuth}
                  className="flex h-7 items-center gap-1 rounded-lg px-2.5 text-[10px] font-bold text-white transition shrink-0"
                  style={{ backgroundColor: "#E1306C" }}>
                  <Link2 size={10} /> Reconectar
                </button>
              ) : (
                <button type="button" onClick={() => void doRefresh(acc.id)} disabled={refreshingId === acc.id}
                  className="flex h-7 items-center gap-1 rounded-lg border px-2.5 text-[10px] font-semibold transition disabled:opacity-50 shrink-0"
                  style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
                  {refreshingId === acc.id ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                  Atualizar
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Sync All */}
      {accounts.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => void doSyncAll()} disabled={syncing}
            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition disabled:opacity-50"
            style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
            {syncing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            Sincronizar todas agora
          </button>
          {syncResult && (
            <p className="mt-1 text-[10px] text-center" style={{ color: "var(--dm-text-tertiary)" }}>{syncResult}</p>
          )}
        </div>
      )}

      {/* Avançado: token manual (fallback) */}
      <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--dm-border-subtle)" }}>
        <button type="button" onClick={() => setShowAdvanced(v => !v)}
          className="flex w-full items-center justify-between text-[10px] font-bold uppercase tracking-widest"
          style={{ color: "var(--dm-text-tertiary)" }}>
          Avançado · token manual
          {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {showAdvanced && (
          <div className="mt-2 space-y-2">
            <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
              Use só se o OAuth não estiver disponível. Cole um token de longa duração e registre pelo ID da conta.
            </p>
            <div className="relative">
              <input
                type={igVisible ? "text" : "password"}
                value={igToken}
                onChange={e => setIgToken(e.target.value)}
                placeholder="EAAxxxxxxxxx…"
                className="h-9 w-full rounded-lg border pr-9 pl-3 text-xs font-mono outline-none focus:ring-1"
                style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}
              />
              <button type="button" onClick={() => setIgVisible(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: "var(--dm-text-tertiary)" }}>
                {igVisible ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
            <button type="button" onClick={handleSaveToken} disabled={!igToken.trim()}
              className="flex h-8 w-full items-center justify-center gap-1 rounded-lg text-xs font-bold text-white transition disabled:opacity-50"
              style={{ backgroundColor: igSaved ? "#05CD99" : "#8392AB" }}>
              {igSaved ? <CheckCircle2 size={11} /> : <Save size={11} />}
              {igSaved ? "Token salvo!" : "Salvar token"}
            </button>

            <div className="relative">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--dm-text-tertiary)" }} />
              <input
                type="text"
                value={customIba}
                onChange={e => setCustomIba(e.target.value)}
                placeholder="ID da conta Instagram Business…"
                className="h-8 w-full rounded-lg border pl-7 pr-3 text-[11px] outline-none"
                style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}
              />
            </div>
            {customIba.trim() && /^\d{6,}$/.test(customIba.trim()) && (
              <button type="button" onClick={() => void doManualRegister(customIba.trim())}
                disabled={!igToken.trim() || manualStatuses[customIba.trim()]?.state === "loading"}
                className="flex h-8 w-full items-center justify-center gap-1 rounded-lg px-2.5 text-[11px] font-bold text-white transition disabled:opacity-50"
                style={{ backgroundColor: manualStatuses[customIba.trim()]?.state === "success" ? "#05CD99" : "#8392AB" }}>
                {manualStatuses[customIba.trim()]?.state === "loading" ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                Registrar conta
              </button>
            )}
            {manualStatuses[customIba.trim()]?.state === "error" && (
              <p className="text-[10px] text-red-500">{manualStatuses[customIba.trim()].message}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Tab: Integrações ─────────────────────────────────────────────────────────

export function TabIntegrations({ onSyncNow }: { onSyncNow?: () => void }) {
  // ── Meta Ads state ──
  const [token,    setToken]    = useState(() => loadMetaCredentials().accessToken ?? "");
  const [visible,  setVisible]  = useState(false);
  const [testing,  setTesting]  = useState(false);
  const [testOk,   setTestOk]   = useState<boolean | null>(null);
  const [testMsg,  setTestMsg]  = useState("");
  const [saved,    setSaved]    = useState(false);

  const handleSave = () => {
    saveMetaCredentials({ accessToken: token.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    // Trigger sync immediately and switch to Sincronização tab so the user can see progress
    onSyncNow?.();
  };

  const handleTest = async () => {
    const t = token.trim();
    if (!t) return;
    setTesting(true);
    setTestOk(null);
    setTestMsg("");
    try {
      const { fetchMetaAdAccounts } = await import("@/utils/metaApi");
      const accounts = await fetchMetaAdAccounts(t);
      setTestOk(true);
      setTestMsg(`${accounts.length} conta${accounts.length !== 1 ? "s" : ""} encontrada${accounts.length !== 1 ? "s" : ""}.`);
    } catch (e) {
      setTestOk(false);
      setTestMsg(e instanceof Error ? e.message : "Falha ao testar token.");
    } finally { setTesting(false); }
  };

  return (
    <div className="space-y-6">
      {/* Meta Ads */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
            <Zap size={15} style={{ color: "var(--dm-brand-500)" }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>Meta Ads</p>
            <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>Token de acesso à API</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="relative">
            <input
              type={visible ? "text" : "password"}
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="EAAxxxxxxxxx…"
              className="h-9 w-full rounded-lg border pr-9 pl-3 text-xs font-mono outline-none focus:ring-1"
              style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)",
                color: "var(--dm-text-primary)" }}
            />
            <button type="button" onClick={() => setVisible(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2"
              style={{ color: "var(--dm-text-tertiary)" }}>
              {visible ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>

          {testOk !== null && (
            <div className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-medium ${
              testOk ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                     : "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400"
            }`}>
              {testOk ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
              {testMsg}
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={() => void handleTest()}
              disabled={!token.trim() || testing}
              className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border text-xs font-semibold transition disabled:opacity-50"
              style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
              {testing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              Testar
            </button>
            <button type="button" onClick={handleSave}
              className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg text-xs font-bold text-white transition"
              style={{ backgroundColor: saved ? "var(--dm-success-text)" : "var(--dm-brand-500)" }}>
              {saved ? <CheckCircle2 size={11} /> : <Save size={11} />}
              {saved ? "Salvo!" : "Salvar token"}
            </button>
          </div>
        </div>

        <p className="mt-2 text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
          💡 Use um <strong>System User Token</strong> para não expirar.
          Tokens do Graph API Explorer expiram em ~1h.
        </p>
      </section>

      {/* Instagram App */}
      <InstagramIntegrationSection />

    </div>
  );
}

// ─── Tab: Sincronização ───────────────────────────────────────────────────────

const META_SYNC_LOOKBACK_DAYS = 730;
const SYNC_LOOKBACK_LS_KEY = "pta_sync_lookback_days";
const LOOKBACK_OPTIONS = [
  { label: "Últimos 7 dias",   value: 7   },
  { label: "Últimos 15 dias",  value: 15  },
  { label: "Últimos 30 dias",  value: 30  },
  { label: "Últimos 60 dias",  value: 60  },
  { label: "Últimos 90 dias",  value: 90  },
  { label: "Máximo (2 anos)",  value: 730 },
];

function readSavedLookback(): number {
  try {
    const v = parseInt(localStorage.getItem(SYNC_LOOKBACK_LS_KEY) ?? "730", 10);
    return LOOKBACK_OPTIONS.some((o) => o.value === v) ? v : 730;
  } catch { return 730; }
}

interface TabSyncProps {
  syncStatus?:    { syncing: boolean; result?: MetaSyncResult; error?: string };
  campaignCount?: number;
  dataSource?:    { type: string; label: string } | null;
  onRefresh?:     () => Promise<void>;
  onClearData?:   () => Promise<void>;
}

export function TabSync({ syncStatus, campaignCount, dataSource, onRefresh, onClearData }: TabSyncProps) {
  const [clearing, setClearing] = useState(false);
  const hasToken = Boolean(loadMetaCredentials().accessToken);
  const [lookback, setLookback] = useState<number>(() =>
    typeof window !== "undefined" ? readSavedLookback() : META_SYNC_LOOKBACK_DAYS,
  );

  const handleLookbackChange = (val: number) => {
    setLookback(val);
    try { localStorage.setItem(SYNC_LOOKBACK_LS_KEY, String(val)); } catch { /* noop */ }
  };

  const handleClear = async () => {
    if (!onClearData) return;
    setClearing(true);
    try { await onClearData(); } finally { setClearing(false); }
  };

  const lastSync = syncStatus?.result;
  const isMetaSource = dataSource?.type === "meta";

  return (
    <div className="space-y-5">
      {/* Status card */}
      <div className="rounded-xl border p-4 space-y-3"
        style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold" style={{ color: "var(--dm-text-secondary)" }}>Fonte de dados</p>
          {dataSource ? (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ backgroundColor: "var(--dm-success-bg)", color: "var(--dm-success-text)" }}>
              {dataSource.type === "meta" ? "Meta Ads" : dataSource.type === "google_sheets" ? "Google Sheets" : "CSV"}
            </span>
          ) : (
            <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
              Nenhuma
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="shrink-0 text-xs font-semibold" style={{ color: "var(--dm-text-secondary)" }}>Período</p>
          <select
            value={lookback}
            onChange={(e) => handleLookbackChange(Number(e.target.value))}
            className="h-7 rounded-lg border px-2 text-[11px] outline-none"
            style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)", color: "var(--dm-text-primary)" }}
          >
            {LOOKBACK_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold" style={{ color: "var(--dm-text-secondary)" }}>Registros</p>
          <div className="flex items-center gap-1.5">
            <Database size={11} style={{ color: "var(--dm-text-tertiary)" }} />
            <span className="text-[13px] font-bold" style={{ color: "var(--dm-text-primary)" }}>
              {campaignCount ?? 0}
            </span>
          </div>
        </div>

        {lastSync && (
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold" style={{ color: "var(--dm-text-secondary)" }}>Última sync</p>
            <span className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
              {lastSync.synced} reg. · {lastSync.dateFrom} → {lastSync.dateTo}
            </span>
          </div>
        )}

        {syncStatus?.syncing && (
          <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--dm-text-secondary)" }}>
            <Loader2 size={12} className="animate-spin flex-shrink-0" />
            Sincronizando dados…
          </div>
        )}

        {syncStatus?.error && (
          <p className="text-[11px] text-red-500">{syncStatus.error}</p>
        )}
      </div>

      {/* Atualizar button — visible as soon as a token exists, not only after first sync */}
      {(isMetaSource || hasToken) && onRefresh && (
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={syncStatus?.syncing}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white transition disabled:opacity-60"
          style={{ backgroundColor: "var(--dm-brand-500)" }}
        >
          <RotateCcw size={14} className={syncStatus?.syncing ? "animate-spin" : ""} />
          {syncStatus?.syncing ? "Sincronizando…" : "Sincronizar agora"}
        </button>
      )}

      {/* Limpar dados */}
      {dataSource && onClearData && (
        <div className="rounded-xl border p-4"
          style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
          <p className="mb-1 text-xs font-semibold" style={{ color: "var(--dm-text-secondary)" }}>Limpar dados</p>
          <p className="mb-3 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
            Remove todos os dados importados e desconecta a fonte atual.
          </p>
          <button
            type="button"
            onClick={() => void handleClear()}
            disabled={clearing}
            className="flex w-full items-center justify-center gap-2 rounded-lg border py-2 text-xs font-semibold transition hover:bg-red-50 hover:border-red-300 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:border-red-800 dark:hover:text-red-400 disabled:opacity-50"
            style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}
          >
            {clearing ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            Limpar dados
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Perfil ──────────────────────────────────────────────────────────────

export interface TabProfileProps {
  name: string;
  email: string;
  onUpdateProfile: (name: string) => Promise<void>;
  onSignOut: () => Promise<void>;
}

export function TabProfile({ name, email, onUpdateProfile, onSignOut }: TabProfileProps) {
  const [editName, setEditName] = useState(name);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  const handleSave = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await onUpdateProfile(editName.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      {/* Avatar placeholder */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-lg font-bold text-white"
          style={{ backgroundColor: "var(--dm-brand-500)" }}>
          {(name || email).charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>{name || "—"}</p>
          <p className="truncate text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>{email}</p>
        </div>
      </div>

      {/* Edit name */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold" style={{ color: "var(--dm-text-secondary)" }}>
          Nome
        </label>
        <div className="flex gap-2">
          <input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            className="h-9 flex-1 rounded-lg border px-3 text-xs outline-none focus:ring-1"
            style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)",
              color: "var(--dm-text-primary)" }}
          />
          <button type="button" onClick={() => void handleSave()}
            disabled={!editName.trim() || saving}
            className="flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-bold text-white transition disabled:opacity-50"
            style={{ backgroundColor: saved ? "var(--dm-success-text)" : "var(--dm-brand-500)" }}>
            {saving ? <Loader2 size={11} className="animate-spin" /> : saved ? <CheckCircle2 size={11} /> : <Save size={11} />}
            {saved ? "Salvo!" : "Salvar"}
          </button>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold" style={{ color: "var(--dm-text-secondary)" }}>
          E-mail
        </label>
        <p className="rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)",
            color: "var(--dm-text-tertiary)" }}>
          {email}
        </p>
      </div>

      {/* Theme */}
      <div>
        <label className="mb-2 block text-xs font-semibold" style={{ color: "var(--dm-text-secondary)" }}>
          Tema
        </label>
        <div className="flex gap-2">
          {(["light", "dark"] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTheme(t)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold transition ${
                resolvedTheme === t
                  ? "border-[var(--dm-brand-400)] bg-[var(--dm-brand-50)] text-[var(--dm-brand-600)]"
                  : "border-[var(--dm-border-default)] text-[var(--dm-text-secondary)]"
              }`}
            >
              {t === "light" ? <Sun size={13} /> : <Moon size={13} />}
              {t === "light" ? "Claro" : "Escuro"}
            </button>
          ))}
        </div>
      </div>

      {/* Sign out */}
      <button type="button" onClick={() => void onSignOut()}
        className="flex w-full items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-semibold transition hover:bg-red-50 hover:border-red-300 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:border-red-800 dark:hover:text-red-400"
        style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
        <User size={14} />
        Sair da conta
      </button>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function ControlPanel({
  isOpen, onClose, userName, userEmail,
  categories, accountEntries,
  onCategoriesChange, onEntriesChange,
  onUpdateProfile, onSignOut,
  syncStatus, campaignCount, dataSource, onRefresh, onClearData,
  onPainelSaveNavigate,
  openingTab,
  inline = false,
}: ControlPanelProps) {
  const [tab, setTab] = useState<CPTab>("accounts");
  const prevIsOpen = useRef(false);

  useEffect(() => {
    if ((isOpen || inline) && !prevIsOpen.current && openingTab) {
      setTab(openingTab);
    }
    prevIsOpen.current = isOpen;
  }, [isOpen, inline, openingTab]);

  const tabCls = useCallback((t: CPTab) =>
    `px-3 py-2 text-xs font-semibold rounded-lg transition ${
      tab === t
        ? "text-[var(--dm-text-primary)] bg-[var(--dm-bg-surface)] shadow-sm"
        : "text-[var(--dm-text-tertiary)] hover:text-[var(--dm-text-secondary)]"
    }`, [tab]);

  // ── Shared tab content ──────────────────────────────────────────────────────
  const tabContent = (
    <>
      {tab === "accounts" && (
        <TabAccounts
          categories={categories}
          accountEntries={accountEntries}
          onCategoriesChange={onCategoriesChange}
          onEntriesChange={onEntriesChange}
          onPainelSaveNavigate={onPainelSaveNavigate}
        />
      )}
      {tab === "integrations" && (
        <TabIntegrations
          onSyncNow={() => {
            setTab("sync");
            void onRefresh?.();
          }}
        />
      )}
      {tab === "sync" && (
        <TabSync
          syncStatus={syncStatus}
          campaignCount={campaignCount}
          dataSource={dataSource}
          onRefresh={onRefresh}
          onClearData={onClearData}
        />
      )}
      {tab === "profile" && (
        <TabProfile
          name={userName}
          email={userEmail}
          onUpdateProfile={onUpdateProfile}
          onSignOut={onSignOut}
        />
      )}
    </>
  );

  // ── Inline / bento mode (página Minha Conta) ────────────────────────────────
  if (inline) {
    const BRAND_GRAD = "linear-gradient(135deg,#6366C8 0%,#313491 100%)";

    const BentoCard = ({
      icon: BIcon, title, subtitle, children,
    }: { icon: React.ElementType; title: string; subtitle: string; children: React.ReactNode }) => (
      <div
        className="overflow-hidden rounded-2xl border shadow-sm"
        style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}
      >
        <div className="flex items-center gap-3 border-b px-5 py-4" style={{ borderColor: "var(--dm-border-default)" }}>
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: BRAND_GRAD }}>
            <BIcon size={14} color="#fff" />
          </span>
          <div>
            <p className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>{title}</p>
            <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>{subtitle}</p>
          </div>
        </div>
        <div className="p-5">{children}</div>
      </div>
    );

    return (
      <div className="grid gap-4 lg:grid-cols-12">

        {/* ── Contas & Categorias — large left block ── */}
        <div className="col-span-12 overflow-hidden rounded-2xl border shadow-sm lg:col-span-7"
          style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
          <div className="flex items-center gap-3 border-b px-5 py-4" style={{ borderColor: "var(--dm-border-default)" }}>
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: BRAND_GRAD }}>
              <Database size={14} color="#fff" />
            </span>
            <div>
              <p className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>Contas & Categorias</p>
              <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                {accountEntries.length} conta{accountEntries.length !== 1 ? "s" : ""} vinculada{accountEntries.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="overflow-y-auto p-5" style={{ maxHeight: 560 }}>
            <TabAccounts
              categories={categories}
              accountEntries={accountEntries}
              onCategoriesChange={onCategoriesChange}
              onEntriesChange={onEntriesChange}
              onPainelSaveNavigate={onPainelSaveNavigate}
            />
          </div>
        </div>

        {/* ── Right column — stacked cards ── */}
        <div className="col-span-12 flex flex-col gap-4 lg:col-span-5">

          <BentoCard icon={Link2} title="Integrações" subtitle="Meta Ads · CSV · Google Sheets">
            <TabIntegrations onSyncNow={() => { void onRefresh?.(); }} />
          </BentoCard>

          <BentoCard icon={Activity} title="Sincronização" subtitle="Status e controle de dados">
            <TabSync
              syncStatus={syncStatus}
              campaignCount={campaignCount}
              dataSource={dataSource}
              onRefresh={onRefresh}
              onClearData={onClearData}
            />
          </BentoCard>

          <BentoCard icon={User} title="Perfil" subtitle="Conta e preferências">
            <TabProfile
              name={userName}
              email={userEmail}
              onUpdateProfile={onUpdateProfile}
              onSignOut={onSignOut}
            />
          </BentoCard>

        </div>
      </div>
    );
  }

  // ── Drawer mode (padrão) ────────────────────────────────────────────────────
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[520px] flex-col"
        style={{
          backgroundColor: "var(--dm-bg-surface)",
          borderLeft: "1px solid var(--dm-border-default)",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.15)",
          animation: "slideInRight 0.25s ease",
        }}
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b px-5 py-4"
          style={{ borderColor: "var(--dm-border-default)" }}>
          <div className="flex items-center gap-2">
            <Settings2 size={16} style={{ color: "var(--dm-brand-500)" }} />
            <h2 className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>
              Painel de Controle
            </h2>
          </div>
          <button onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full transition hover:opacity-70"
            style={{ color: "var(--dm-text-tertiary)" }}>
            <X size={15} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex flex-shrink-0 gap-1 border-b px-4 py-2"
          style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
          <button className={tabCls("accounts")}     onClick={() => setTab("accounts")}>Contas</button>
          <button className={tabCls("integrations")} onClick={() => setTab("integrations")}>Integrações</button>
          <button className={tabCls("sync")}         onClick={() => setTab("sync")}>Sincronização</button>
          <button className={tabCls("profile")}      onClick={() => setTab("profile")}>Perfil</button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-5">{tabContent}</div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}
