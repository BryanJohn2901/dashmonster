"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "@/hooks/useToast";
import { useTheme } from "next-themes";
import {
  X, Settings2, ChevronDown, ChevronUp, Plus, Trash2, Loader2,
  Zap, User, Activity, CheckCircle2, XCircle, Link2, Eye, EyeOff,
  RefreshCw, Save, RotateCcw, Sun, Moon, Database, AtSign,
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
  isCustomCategory: boolean;
  customFilterOptions?: CategoryInternalFilterOption[];
  onSaved: (entry: UserAccountEntry) => void;
  onCancel: () => void;
}

function AddEntryForm({
  categoryId,
  categorySlug,
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
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [selected, setSelected] = useState<string[]>([]);
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

  const accountSuggestions = useMemo(() => {
    const q = accountId.trim().toLowerCase();
    const base = q
      ? metaAccounts.filter((acc) =>
          acc.id.toLowerCase().includes(q) ||
          acc.name.toLowerCase().includes(q) ||
          acc.currency.toLowerCase().includes(q),
        )
      : metaAccounts;
    return base.slice(0, 8);
  }, [accountId, metaAccounts]);

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
      setSelected(camps.map((c) => c.id));
      setVerifyState("ok");
      setCampaignListOpen(false);
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

  return (
    <div className="mt-2 rounded-xl border p-3 space-y-3"
      style={{ borderColor: "var(--dm-brand-300)", backgroundColor: "var(--dm-bg-elevated)" }}
    >
      {/* Campo 1 — ID da Conta (obrigatório) */}
      <div className="rounded-lg border p-2.5 space-y-2"
        style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--dm-text-tertiary)" }}>
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
                className="h-9 w-full rounded-lg border px-2.5 pr-8 text-[11px] font-mono font-medium outline-none transition focus:ring-1"
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
                      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${acc.account_status === 1 ? "bg-emerald-500" : "bg-amber-400"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>{acc.name}</span>
                        <span className="block truncate font-mono text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>{acc.id}</span>
                      </span>
                      <span className="text-[9px] font-semibold" style={{ color: "var(--dm-text-tertiary)" }}>{acc.currency}</span>
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
      <div className="rounded-lg border p-2.5 space-y-2"
        style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
        {isCustomCategory ? (
          <p className="text-[10px] leading-snug" style={{ color: "var(--dm-text-tertiary)" }}>
            Categorias personalizadas não usam subfiltros catalogados — o vínculo é direto à categoria.
          </p>
        ) : (
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--dm-text-tertiary)" }}>
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
                className="h-9 w-full rounded-lg border px-2.5 pr-8 text-[12px] font-medium outline-none transition focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
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
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold" style={{ color: "var(--dm-text-secondary)" }}>
                Campanhas nesta categoria
              </span>
              <button type="button" onClick={toggleAll}
                className="text-[10px] font-semibold" style={{ color: "var(--dm-brand-500)" }}>
                {selected.length === campaigns.length ? "Desmarcar todas" : "Marcar todas"}
              </button>
            </div>
            <div className="max-h-40 overflow-y-auto rounded-lg border p-1.5 space-y-0.5"
              style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
              {campaigns.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 transition hover:bg-slate-100/50 dark:hover:bg-slate-700/50">
                  <input type="checkbox" checked={selected.includes(c.id)}
                    onChange={() => toggleOne(c.id)}
                    className="h-3 w-3 flex-shrink-0 rounded accent-blue-600" />
                  <span className="flex-1 truncate text-[11px]" style={{ color: "var(--dm-text-primary)" }}
                    title={c.name}>{c.name}</span>
                  <span className={`flex-shrink-0 text-[9px] font-bold ${c.status === "ACTIVE" ? "text-emerald-500" : "text-amber-400"}`}>
                    {c.status === "ACTIVE" ? "●" : "◐"}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="border-t pt-2" style={{ borderColor: "var(--dm-border-default)" }}>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--dm-text-tertiary)" }}>
            Nome no Painel <span className="font-normal normal-case opacity-80">(opcional)</span>
          </label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Igual ao nome da Meta se deixado em branco"
            disabled={!canContinueAfterFilters}
            className="h-9 w-full rounded-lg border px-2.5 text-[12px] outline-none transition focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)",
              color: "var(--dm-text-primary)" }}
          />
        </div>
      </div>

      {saveErrMsg && (
        <p className="text-[10px] text-red-500">{saveErrMsg}</p>
      )}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="flex h-8 flex-1 items-center justify-center rounded-lg border text-xs font-semibold transition"
          style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
          Cancelar
        </button>
        <button type="button" onClick={() => void handleSave()}
          disabled={saving}
          className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg text-xs font-bold text-white transition disabled:opacity-50"
          style={{ backgroundColor: "var(--dm-brand-500)" }}>
          {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
          Salvar
        </button>
      </div>
    </div>
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
  const [deleting,  setDeleting]  = useState(false);
  const [expanded,  setExpanded]  = useState(false);
  const [toggling,  setToggling]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  const campCount = entry.campaigns.length;
  const selCount  = entry.selectedCampaignIds.length || campCount;
  const filterLabel = getInternalFilterLabel(categorySlug, entry.internalFilter);

  // ── Edição inline de selectedCampaignIds — draft state ─────────────────────
  const allCampIds = useMemo(() => entry.campaigns.map(c => c.id), [entry.campaigns]);

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
          className="flex-shrink-0 transition disabled:opacity-50">
          {entry.isEnabled
            ? <Eye size={13} className="text-emerald-500" />
            : <EyeOff size={13} style={{ color: "var(--dm-text-tertiary)" }} />}
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
          <button type="button" onClick={() => setExpanded(v => !v)}
            className="flex flex-shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold transition"
            style={{ backgroundColor: "var(--dm-bg-surface)", color: "var(--dm-brand-500)",
              border: "1px solid var(--dm-brand-200)" }}>
            <Link2 size={8} />
            {selCount}/{campCount}
            {expanded ? <ChevronUp size={8} /> : <ChevronDown size={8} />}
          </button>
        )}

        {/* Delete */}
        <button type="button" onClick={() => void handleDelete()} disabled={deleting}
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded transition hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400 disabled:opacity-40"
          style={{ color: "var(--dm-text-tertiary)" }}>
          {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
        </button>
      </div>

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
          {/* Campaign rows */}
          <div className="max-h-48 overflow-y-auto">
            {entry.campaigns.map(c => {
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
  onCategoryToggle, onCategoryCreated, onEntrySaved, onEntryDeleted, onEntryToggled, onEntryUpdated,
  isCustom, onDeleteCategory, onPainelSaveNavigate,
}: CategorySectionProps) {
  const [showAdd,        setShowAdd]        = useState(false);
  const [toggling,       setToggling]       = useState(false);
  const [localRecord,    setLocalRecord]    = useState(categoryRecord);
  const isEnabled = (localRecord ?? categoryRecord)?.isEnabled ?? true;
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
        <span className="text-base leading-none">{emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold truncate" style={{ color: "var(--dm-text-primary)" }}>
            {name}
          </p>
          <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
            {entries.length === 0 ? "Nenhuma conta vinculada" : `${entries.length} conta${entries.length > 1 ? "s" : ""}`}
          </p>
        </div>

        {/* Toggle enable/disable */}
        <button type="button" onClick={() => void handleToggle()} disabled={toggling}
          title={isEnabled ? "Desativar categoria" : "Ativar categoria"}
          className={`flex h-6 items-center gap-1 rounded-full px-2 text-[10px] font-bold transition disabled:opacity-50 ${
            isEnabled
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
              : "bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500"
          }`}>
          {toggling
            ? <Loader2 size={9} className="animate-spin" />
            : isEnabled ? <CheckCircle2 size={9} /> : <XCircle size={9} />}
          {isEnabled ? "ativo" : "inativo"}
        </button>

        {/* Delete (custom categories only) */}
        {isCustom && onDeleteCategory && (
          <button type="button" onClick={() => onDeleteCategory(slug)}
            className="flex h-6 w-6 items-center justify-center rounded transition hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400"
            style={{ color: "var(--dm-text-tertiary)" }}>
            <Trash2 size={12} />
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
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2 text-[11px] font-semibold transition hover:opacity-80"
            style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
            <Plus size={12} /> Adicionar conta
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

function InstagramIntegrationSection() {
  const [igToken,    setIgToken]   = useState(() => loadIgToken());
  const [igVisible,  setIgVisible] = useState(false);
  const [igSaved,    setIgSaved]   = useState(false);
  const [customIba,  setCustomIba] = useState("");
  const [statuses,   setStatuses]  = useState<Record<string, IgRegisterStatus>>({});
  const [syncing,    setSyncing]   = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // Usa o store real para reagir ao sync do Supabase (novo device, etc.)
  const { profiles: allProfiles } = useAdvertiserStore();
  const profiles = useMemo(
    () => allProfiles.filter(p => p.instagramUserId),
    [allProfiles],
  );

  const handleSaveToken = () => {
    saveIgToken(igToken.trim());
    setIgSaved(true);
    setTimeout(() => setIgSaved(false), 2000);
  };

  const doRegister = async (ibaId: string) => {
    const token = igToken.trim();
    if (!token || !ibaId.trim()) return;
    setStatuses(prev => ({ ...prev, [ibaId]: { ibaId, state: "loading" } }));
    try {
      const res = await fetch("/api/instagram/accounts/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instagramBusinessAccountId: ibaId.trim(), accessToken: token }),
      });
      const json = await res.json() as { account?: { username: string }; daysBackfilled?: number; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? "Erro desconhecido");
      setStatuses(prev => ({
        ...prev,
        [ibaId]: { ibaId, state: "success", daysBackfilled: json.daysBackfilled, message: `@${json.account?.username ?? "?"} registrado` },
      }));
    } catch (e) {
      setStatuses(prev => ({
        ...prev,
        [ibaId]: { ibaId, state: "error", message: e instanceof Error ? e.message : "Falha ao registrar" },
      }));
    }
  };

  const doSyncAll = async () => {
    setSyncing(true); setSyncResult(null);
    try {
      const res  = await fetch("/api/instagram/accounts/sync-all", { method: "POST" });
      const json = await res.json() as { synced?: number; failed?: number; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? "Erro desconhecido");
      setSyncResult(`${json.synced ?? 0} conta${(json.synced ?? 0) !== 1 ? "s" : ""} sincronizada${(json.synced ?? 0) !== 1 ? "s" : ""}${(json.failed ?? 0) > 0 ? ` · ${json.failed} falha${(json.failed ?? 0) !== 1 ? "s" : ""}` : ""}`);
    } catch (e) {
      setSyncResult(`Erro: ${e instanceof Error ? e.message : "falha"}`);
    } finally { setSyncing(false); }
  };

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
          <AtSign size={15} style={{ color: "#E1306C" }} />
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>Instagram App</p>
          <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>Token do App IG Business Login</p>
        </div>
      </div>

      <div className="space-y-2">
        {/* Token input */}
        <div className="relative">
          <input
            type={igVisible ? "text" : "password"}
            value={igToken}
            onChange={e => setIgToken(e.target.value)}
            placeholder="EAAxxxxxxxxx… (token IG Business Login)"
            className="h-9 w-full rounded-lg border pr-9 pl-3 text-xs font-mono outline-none focus:ring-1"
            style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}
          />
          <button type="button" onClick={() => setIgVisible(v => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2"
            style={{ color: "var(--dm-text-tertiary)" }}>
            {igVisible ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>

        <button type="button" onClick={handleSaveToken} disabled={!igToken.trim()}
          className="flex h-8 w-full items-center justify-center gap-1 rounded-lg text-xs font-bold text-white transition disabled:opacity-50"
          style={{ backgroundColor: igSaved ? "#05CD99" : "#E1306C" }}>
          {igSaved ? <CheckCircle2 size={11} /> : <Save size={11} />}
          {igSaved ? "Token salvo!" : "Salvar token do Instagram"}
        </button>

        <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
          💡 Token gerado pelo App <strong>AUTOTRAFFIC | PTA OFICIAL-IG</strong> — diferente do token Meta Ads.
        </p>
      </div>

      {/* Register per IBA ID — sempre visível para permitir entrada manual de IBA ID */}
      <div className="mt-4 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>
            Registrar contas
          </p>

          {/* From profiles */}
          {profiles.map(p => {
            const ibaId  = p.instagramUserId!;
            const status = statuses[ibaId];
            return (
              <div key={p.id} className="flex items-center gap-2 rounded-xl border p-2.5"
                style={{ borderColor: "var(--dm-border-subtle)", backgroundColor: "var(--dm-bg-elevated)" }}>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold truncate" style={{ color: "var(--dm-text-primary)" }}>
                    {p.name}
                    {p.instagramUsername && (
                      <span className="ml-1.5 font-normal" style={{ color: "var(--dm-text-tertiary)" }}>@{p.instagramUsername}</span>
                    )}
                  </p>
                  <p className="text-[10px] font-mono" style={{ color: "var(--dm-text-tertiary)" }}>{ibaId}</p>
                </div>
                {status?.state === "success" && (
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{ background: "rgba(5,205,153,0.12)", color: "#05CD99" }}>
                    ✓ {status.daysBackfilled}d
                  </span>
                )}
                {status?.state === "error" && (
                  <span className="text-[10px] text-red-500 truncate max-w-[100px]" title={status.message}>{status.message}</span>
                )}
                <button type="button"
                  onClick={() => void doRegister(ibaId)}
                  disabled={!igToken.trim() || status?.state === "loading"}
                  className="flex h-7 items-center gap-1 rounded-lg px-2.5 text-[10px] font-bold text-white transition disabled:opacity-50 shrink-0"
                  style={{ backgroundColor: status?.state === "success" ? "#05CD99" : "#E1306C" }}>
                  {status?.state === "loading" ? <Loader2 size={10} className="animate-spin" /> : null}
                  {status?.state === "success" ? "Re-registrar" : "Registrar"}
                </button>
              </div>
            );
          })}

          {/* Manual IBA ID input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={customIba}
              onChange={e => setCustomIba(e.target.value)}
              placeholder="IBA ID manual (ex: 1784145…)"
              className="h-8 flex-1 rounded-lg border px-2.5 text-[11px] font-mono outline-none"
              style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}
            />
            <button type="button"
              onClick={() => { if (customIba.trim()) { void doRegister(customIba.trim()); } }}
              disabled={!igToken.trim() || !customIba.trim() || statuses[customIba.trim()]?.state === "loading"}
              className="flex h-8 items-center gap-1 rounded-lg px-3 text-[10px] font-bold text-white transition disabled:opacity-50 shrink-0"
              style={{ backgroundColor: "#E1306C" }}>
              {statuses[customIba.trim()]?.state === "loading"
                ? <Loader2 size={10} className="animate-spin" />
                : <Plus size={10} />}
              Registrar
            </button>
          </div>
          {statuses[customIba.trim()]?.state === "success" && (
            <p className="text-[10px]" style={{ color: "#05CD99" }}>
              ✓ {statuses[customIba.trim()].message} · {statuses[customIba.trim()].daysBackfilled} dias importados
            </p>
          )}
          {statuses[customIba.trim()]?.state === "error" && (
            <p className="text-[10px] text-red-500">{statuses[customIba.trim()].message}</p>
          )}
        </div>

      {/* Sync All */}
      <div className="mt-3">
        <button type="button" onClick={() => void doSyncAll()} disabled={syncing}
          className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition disabled:opacity-50"
          style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
          {syncing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          Sincronizar todas as contas agora
        </button>
        {syncResult && (
          <p className="mt-1 text-[10px] text-center" style={{ color: "var(--dm-text-tertiary)" }}>{syncResult}</p>
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

const META_SYNC_LOOKBACK_DAYS = 30;
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
    const v = parseInt(localStorage.getItem(SYNC_LOOKBACK_LS_KEY) ?? "30", 10);
    return LOOKBACK_OPTIONS.some((o) => o.value === v) ? v : 30;
  } catch { return 30; }
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
