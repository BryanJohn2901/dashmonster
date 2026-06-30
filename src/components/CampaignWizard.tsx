"use client";

// ─── CampaignWizard — conectar/configurar campanha manualmente ──────────────────
// Ocupa a janela inteira (sem drawer lateral). Dois passos:
//   1. Conexão — nome + categoria/filtro do dashboard + conta (ACT) + campanhas reais do Meta
//   2. Objetivo & metas — intenção, resultado, orçamento e metas dinâmicas
//
// Em vez de gravar só na Central (que agrupava por CONTA), monta uma
// UserAccountEntry e dispara a MESMA ponte do Painel de Controle
// (PTA_PAINEL_SAVE_NAV_EVENT) — o listener do Dashboard registra a campanha no
// FILTRO certo (Biomecânica, Mentoria…) e puxa as métricas. É o caminho provado.

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2, Plug, Target, X, Plus, Search } from "lucide-react";
import {
  INTENT_META, INTENT_OPTIONS,
  type CampaignCenterEntry, type CampaignIntent,
} from "@/hooks/useCampaignCenter";
import type { ResultType } from "@/hooks/useAdvertiserStore";
import { RESULT_TYPE_OPTIONS } from "@/components/ProfileAnalysis";
import { useCompany, readAdAccountSuggestions } from "@/hooks/useCompany";
import { fetchUserCategories, upsertUserCategory, upsertUserAccountEntry } from "@/utils/supabaseCategories";
import { getInternalFiltersForCategorySlug } from "@/config/categoryInternalFilters";
import { fetchMetaCampaigns, loadMetaCredentials, type MetaCampaign } from "@/utils/metaApi";
import {
  PTA_PAINEL_SAVE_NAV_EVENT,
  mapPainelInternalFilterToDashboardGroupId,
} from "@/utils/painelDashboardNavigation";
import { FIXED_CATEGORIES } from "@/types/userConfig";
import type { UserCategory } from "@/types/userConfig";

const FIXED_SLUGS = new Set(FIXED_CATEGORIES.map((c) => c.slug));

const UNIT_PLACEHOLDER: Record<string, string> = {
  qtd: "0", brl: "R$ 0,00", pct: "0%", x: "0,0x",
};

const fieldCls = "h-10 rounded-[10px] border px-3 text-sm outline-none transition focus:ring-1";
const fieldStyle = {
  borderColor: "var(--dm-border-default)",
  backgroundColor: "var(--dm-bg-elevated)",
  color: "var(--dm-text-primary)",
} as React.CSSProperties;
const labelCls = "text-[10px] font-bold uppercase tracking-wider";

const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const normAct = (id: string) => `act_${id.replace(/^act_/, "")}`;

export function CampaignWizard({ onClose, onSave, nameSuggestions = [] }: {
  onClose: () => void;
  onSave: (entries: CampaignCenterEntry[]) => void;
  nameSuggestions?: string[];
}) {
  const { company } = useCompany();
  const suggested = useMemo(() => readAdAccountSuggestions(company?.settings), [company?.settings]);

  const [cats, setCats] = useState<UserCategory[]>([]);
  useEffect(() => {
    void fetchUserCategories().then((all) => setCats(all.filter((c) => c.isEnabled))).catch(() => {});
  }, []);

  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [catSlug, setCatSlug] = useState("");   // categoria existente escolhida
  const [newCat, setNewCat] = useState("");     // nome de categoria nova (se preenchido, tem prioridade)
  const [creatingCat, setCreatingCat] = useState(false);
  const [internalFilter, setInternalFilter] = useState(""); // filtro específico do dashboard (bm, mentoria-scala…)
  const [actId, setActId] = useState("");
  const [intent, setIntent] = useState<CampaignIntent>(INTENT_OPTIONS[0].value);
  const [resultType, setResultType] = useState<ResultType>(INTENT_META[INTENT_OPTIONS[0].value].defaultResultTypes[0]);
  const [budget, setBudget] = useState("");
  const [goals, setGoals] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Campanhas reais do Meta (puxadas pela conta) — fonte das métricas
  const [campaigns, setCampaigns] = useState<MetaCampaign[]>([]);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [fetchingCampaigns, setFetchingCampaigns] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const meta = INTENT_META[intent];
  const catLabel = newCat.trim() || cats.find((c) => c.slug === catSlug)?.name || "";

  // Categoria custom = nova OU slug fora das 5 fixas → sem filtro interno (usa panel-entry)
  const isCustomCat = Boolean(newCat.trim()) || (Boolean(catSlug) && !FIXED_SLUGS.has(catSlug));
  const filterOptions = useMemo(
    () => (!isCustomCat && catSlug ? getInternalFiltersForCategorySlug(catSlug) : []),
    [isCustomCat, catSlug],
  );
  const needsFilter = filterOptions.length > 0;
  const filterReady = !needsFilter || Boolean(internalFilter);

  const canNext = name.trim().length > 0 && catLabel.length > 0 && filterReady;

  const chooseIntent = (v: CampaignIntent) => {
    setIntent(v);
    setResultType(INTENT_META[v].defaultResultTypes[0]);
    setGoals({});
  };

  const setGoal = (id: string, raw: string) => {
    const v = parseFloat(raw);
    setGoals((prev) => {
      const next = { ...prev };
      if (isNaN(v) || v <= 0) delete next[id]; else next[id] = v;
      return next;
    });
  };

  const handleFetchCampaigns = async () => {
    if (!actId.trim()) { setFetchError("Escolha ou digite a conta (act_…) antes de buscar."); return; }
    const { accessToken } = loadMetaCredentials();
    if (!accessToken) { setFetchError("Token Meta da empresa não configurado. Configure em Integrações."); return; }
    setFetchingCampaigns(true); setFetchError(null);
    try {
      const list = await fetchMetaCampaigns(normAct(actId), accessToken);
      setCampaigns(list);
      setSelectedCampaignIds([]);
      if (list.length === 0) setFetchError("Nenhuma campanha encontrada nesta conta.");
    } catch (e) {
      setCampaigns([]);
      setFetchError(e instanceof Error ? e.message : "Falha ao buscar campanhas.");
    } finally {
      setFetchingCampaigns(false);
    }
  };

  const toggleCampaign = (id: string) =>
    setSelectedCampaignIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAllCampaigns = () =>
    setSelectedCampaignIds((s) => (s.length === campaigns.length ? [] : campaigns.map((c) => c.id)));

  const handleSave = async () => {
    if (!canNext) { setStep(1); return; }
    setSaving(true); setError(null);
    try {
      const isNew = newCat.trim().length > 0;
      const slug = isNew ? slugify(newCat.trim()) : catSlug;
      const label = isNew ? newCat.trim() : (cats.find((c) => c.slug === catSlug)?.name ?? catSlug);

      // garante a categoria/filtro no banco quando for nova — se o upsert falhar
      // (offline/sem sessão), segue com o slug local: não trava o save.
      let category = cats.find((c) => c.slug === slug);
      try {
        category = category ?? await upsertUserCategory({
          slug, name: label, type: isNew ? "custom" : "fixed", position: cats.length,
        });
      } catch { /* mantém category = local (pode ser undefined) */ }

      const act = actId.trim() ? normAct(actId) : "";
      const actLabel = actId.trim()
        ? (suggested.find((s) => normAct(s.id) === act)?.label ?? act)
        : "Manual";
      const b = parseFloat(budget);
      const monthlyBudget = isNaN(b) || b <= 0 ? null : b;
      const filterId = !isCustomCat && internalFilter ? internalFilter : null;
      const selectedMeta = campaigns.filter((c) => selectedCampaignIds.includes(c.id));
      const now = new Date().toISOString();

      // Caminho provado: temos conta + categoria no banco + campanhas reais →
      // monta UserAccountEntry, persiste e dispara a ponte do Painel.
      if (act && category?.id && selectedMeta.length > 0) {
        const entry = await upsertUserAccountEntry({
          categoryId: category.id,
          label: actLabel,
          adAccountId: act,
          internalFilter: filterId,
          campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, status: c.status })),
          selectedCampaignIds: selectedMeta.length < campaigns.length ? selectedCampaignIds : [],
        });

        const groupId = isCustomCat
          ? `panel-entry-${entry.id}`
          : mapPainelInternalFilterToDashboardGroupId(slug, filterId);

        // Central: uma entry por campanha escolhida — alimenta o Perfil de Anunciantes
        onSave(selectedMeta.map((c) => ({
          campaignId: c.id,
          campaignName: c.name,
          adAccountId: act,
          adAccountLabel: actLabel,
          intent,
          resultType,
          groupId,
          monthlyBudget,
          goals,
          enabled: c.status === "ACTIVE",
          autoConfigured: false,
          updatedAt: now,
        })));

        window.dispatchEvent(new CustomEvent(PTA_PAINEL_SAVE_NAV_EVENT, {
          detail: { entry, categorySlug: slug, isCustom: isCustomCat, syncAfter: true },
        }));
        onClose();
        return;
      }

      // Fallback manual (sem token/conta/campanhas): grava só a Central, como antes.
      onSave([{
        campaignId: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        campaignName: name.trim(),
        adAccountId: act || "manual",
        adAccountLabel: actLabel,
        intent,
        resultType,
        groupId: isCustomCat ? slug : (filterId ? mapPainelInternalFilterToDashboardGroupId(slug, filterId) : slug),
        monthlyBudget,
        goals,
        enabled: true,
        autoConfigured: false,
        updatedAt: now,
      }]);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar a campanha.");
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-[460px] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b pb-4" style={{ borderColor: "var(--dm-border-default)" }}>
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={onClose}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition hover:opacity-70"
            style={{ color: "var(--dm-text-tertiary)" }} aria-label="Voltar">
            <ArrowLeft size={16} />
          </button>
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(22,163,74,0.12)" }}>
            <Plug size={16} style={{ color: "#16A34A" }} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
              Conectar conta
            </h3>
            <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
              Passo {step} de 2 — {step === 1 ? "conexão" : "objetivo & metas"}
            </p>
          </div>
        </div>
        <button type="button" onClick={onClose}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition hover:opacity-70"
          style={{ color: "var(--dm-text-tertiary)" }} aria-label="Fechar">
          <X size={16} />
        </button>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 py-4">
        {[1, 2].map((s) => (
          <div key={s} className="h-1 flex-1 rounded-full transition-colors"
            style={{ background: step >= s ? "var(--dm-primary)" : "var(--dm-border-default)" }} />
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {step === 1 ? (
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)" }}>
            <label className="flex flex-col gap-1.5">
              <span className={labelCls} style={{ color: "var(--dm-text-tertiary)" }}>Nome da campanha</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                list="dm-wiz-names"
                placeholder="ex: Biomecânica, Musculação, Mentoria Scala"
                className={fieldCls} style={{ ...fieldStyle, background: "var(--dm-bg-surface)" }} autoFocus />
              <datalist id="dm-wiz-names">
                {nameSuggestions.map((n) => <option key={n} value={n} />)}
              </datalist>
              {nameSuggestions.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {nameSuggestions.slice(0, 10).map((n) => {
                    const active = name.trim() === n;
                    return (
                      <button key={n} type="button" onClick={() => setName(n)}
                        className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition hover:opacity-80"
                        style={{
                          borderColor: active ? "var(--dm-primary)" : "var(--dm-border-default)",
                          color: active ? "var(--dm-primary)" : "var(--dm-text-secondary)",
                          background: active ? "rgba(22,163,74,0.10)" : "transparent",
                        }}>
                        {n}
                      </button>
                    );
                  })}
                </div>
              )}
            </label>

            <div className="flex flex-col gap-2">
              <span className={labelCls} style={{ color: "var(--dm-text-tertiary)" }}>Em qual categoria deve aparecer</span>
              <div className="flex flex-wrap gap-2">
                {cats.map((c) => {
                  const active = !newCat.trim() && catSlug === c.slug;
                  return (
                    <button key={c.id} type="button"
                      onClick={() => { setCatSlug(c.slug); setNewCat(""); setCreatingCat(false); setInternalFilter(""); }}
                      className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:opacity-80"
                      style={{
                        borderColor: active ? "var(--dm-primary)" : "var(--dm-border-default)",
                        background: active ? "rgba(22,163,74,0.12)" : "var(--dm-bg-surface)",
                        color: active ? "var(--dm-primary)" : "var(--dm-text-secondary)",
                      }}>
                      <span>{c.emoji ?? "🏷️"}</span> {c.name}
                    </button>
                  );
                })}
                <button type="button" onClick={() => { setCreatingCat(true); setCatSlug(""); setInternalFilter(""); }}
                  className="flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1.5 text-xs font-semibold transition hover:opacity-80"
                  style={{
                    borderColor: creatingCat || newCat.trim() ? "var(--dm-primary)" : "var(--dm-border-default)",
                    color: creatingCat || newCat.trim() ? "var(--dm-primary)" : "var(--dm-text-tertiary)",
                  }}>
                  <Plus size={12} /> Nova
                </button>
              </div>
              {(creatingCat || newCat.trim()) && (
                <input type="text" value={newCat} onChange={(e) => setNewCat(e.target.value)}
                  placeholder="ex: Pós, Eventos, Perpétuo, Livros…"
                  className={fieldCls} style={{ ...fieldStyle, background: "var(--dm-bg-surface)", marginTop: 4 }} autoFocus />
              )}
            </div>

            {/* Filtro específico do dashboard — só para categorias fixas */}
            {needsFilter && (
              <div className="flex flex-col gap-2">
                <span className={labelCls} style={{ color: "var(--dm-text-tertiary)" }}>Em qual filtro do dashboard</span>
                <div className="flex flex-wrap gap-2">
                  {filterOptions.map((opt) => {
                    const active = internalFilter === opt.id;
                    return (
                      <button key={opt.id} type="button" onClick={() => setInternalFilter(opt.id)}
                        className="rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:opacity-80"
                        style={{
                          borderColor: active ? "var(--dm-primary)" : "var(--dm-border-default)",
                          background: active ? "rgba(22,163,74,0.12)" : "var(--dm-bg-surface)",
                          color: active ? "var(--dm-primary)" : "var(--dm-text-secondary)",
                        }}>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <label className="flex flex-col gap-1.5">
              <span className={labelCls} style={{ color: "var(--dm-text-tertiary)" }}>Conta de anúncio</span>
              <div className="flex gap-2">
                <input type="text" value={actId} onChange={(e) => setActId(e.target.value)}
                  list="dm-wiz-act"
                  placeholder="Escolha uma conta ★ ou digite o ACT (act_123…)"
                  className={`${fieldCls} flex-1`} style={{ ...fieldStyle, background: "var(--dm-bg-surface)" }} />
                <button type="button" onClick={() => void handleFetchCampaigns()} disabled={fetchingCampaigns || !actId.trim()}
                  className="flex items-center gap-1.5 rounded-[10px] border px-3 text-xs font-bold transition hover:opacity-80 disabled:opacity-40"
                  style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)", background: "var(--dm-bg-surface)" }}>
                  {fetchingCampaigns ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                  Buscar campanhas
                </button>
              </div>
              <datalist id="dm-wiz-act">
                {suggested.map((s) => <option key={s.id} value={s.id}>{s.label ? `★ ${s.label}` : s.id}</option>)}
              </datalist>
              <span className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                Busque as campanhas reais da conta para puxar as métricas do Meta no filtro escolhido.
              </span>
            </label>

            {fetchError && (
              <p className="rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: "rgba(238,93,80,0.4)", background: "rgba(238,93,80,0.08)", color: "#EE5D50" }}>{fetchError}</p>
            )}

            {/* Checklist de campanhas reais */}
            {campaigns.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className={labelCls} style={{ color: "var(--dm-text-tertiary)" }}>
                    Campanhas ({selectedCampaignIds.length}/{campaigns.length})
                  </span>
                  <button type="button" onClick={toggleAllCampaigns}
                    className="text-[11px] font-semibold transition hover:opacity-80" style={{ color: "var(--dm-primary)" }}>
                    {selectedCampaignIds.length === campaigns.length ? "Limpar" : "Selecionar todas"}
                  </button>
                </div>
                <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-xl border p-1.5" style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)" }}>
                  {campaigns.map((c) => {
                    const checked = selectedCampaignIds.includes(c.id);
                    return (
                      <button key={c.id} type="button" onClick={() => toggleCampaign(c.id)}
                        className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:opacity-80"
                        style={{ background: checked ? "rgba(22,163,74,0.10)" : "transparent" }}>
                        <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border"
                          style={{ borderColor: checked ? "var(--dm-primary)" : "var(--dm-border-default)", background: checked ? "var(--dm-primary)" : "transparent" }}>
                          {checked && <Check size={11} className="text-white" />}
                        </span>
                        <span className="flex-1 truncate text-xs font-medium" style={{ color: "var(--dm-text-primary)" }}>{c.name}</span>
                        <span className="text-[10px] font-bold uppercase" style={{ color: c.status === "ACTIVE" ? "#16A34A" : "var(--dm-text-tertiary)" }}>{c.status}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Resumo do passo 1 */}
            <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3" style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)" }}>
              <span className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>{name.trim() || "Campanha"}</span>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "rgba(22,163,74,0.12)", color: "var(--dm-primary)" }}>{catLabel}</span>
              {selectedCampaignIds.length > 0 && (
                <span className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>{selectedCampaignIds.length} campanha(s) do Meta</span>
              )}
              {actId && <span className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>★ {suggested.find((s) => normAct(s.id) === normAct(actId))?.label ?? actId}</span>}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1.5">
                <span className={labelCls} style={{ color: "var(--dm-text-tertiary)" }}>Objetivo</span>
                <select value={intent} onChange={(e) => chooseIntent(e.target.value as CampaignIntent)} className={fieldCls} style={fieldStyle}>
                  {INTENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelCls} style={{ color: "var(--dm-text-tertiary)" }}>Resultado</span>
                <select value={resultType} onChange={(e) => setResultType(e.target.value as ResultType)} className={fieldCls} style={fieldStyle}>
                  {RESULT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelCls} style={{ color: "var(--dm-text-tertiary)" }}>Orçamento /mês</span>
                <input type="number" min="0" step="any" value={budget} onChange={(e) => setBudget(e.target.value)}
                  placeholder="R$ 0,00" className={`${fieldCls} text-right tabular-nums`} style={fieldStyle} />
              </label>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <Target size={12} style={{ color: meta.color }} />
                <span className={labelCls} style={{ color: "var(--dm-text-tertiary)" }}>Metas de {meta.label}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {meta.goalFields.map((gf) => (
                  <label key={gf.id} className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold" style={{ color: "var(--dm-text-secondary)" }}>{gf.label}</span>
                    <input type="number" min="0" step="any" value={goals[gf.id] ?? ""}
                      onChange={(e) => setGoal(gf.id, e.target.value)}
                      placeholder={UNIT_PLACEHOLDER[gf.unit]}
                      className={`${fieldCls} text-right tabular-nums`} style={fieldStyle} />
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: "rgba(238,93,80,0.4)", background: "rgba(238,93,80,0.08)", color: "#EE5D50" }}>{error}</p>
      )}

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--dm-border-default)" }}>
        <button type="button" onClick={step === 1 ? onClose : () => setStep(1)}
          className="rounded-xl border px-4 py-2 text-xs font-semibold transition hover:opacity-80"
          style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
          {step === 1 ? "Cancelar" : "Voltar"}
        </button>
        {step === 1 ? (
          <button type="button" onClick={() => setStep(2)} disabled={!canNext}
            className="flex items-center gap-1.5 rounded-xl px-5 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
            style={{ background: "var(--dm-btn-primary-bg)" }}>
            Próximo <ArrowRight size={13} />
          </button>
        ) : (
          <button type="button" onClick={() => void handleSave()} disabled={saving}
            className="flex items-center gap-1.5 rounded-xl px-5 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--dm-btn-primary-bg)" }}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Salvar campanha
          </button>
        )}
      </div>
    </div>
  );
}
