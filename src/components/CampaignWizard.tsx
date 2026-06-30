"use client";

// ─── CampaignWizard — conectar/configurar campanha manualmente ──────────────────
// Ocupa a janela inteira (sem drawer lateral). Dois passos:
//   1. Identificação — nome da campanha + categoria/filtro + conta (ACT) opcional
//   2. Objetivo & metas — intenção, resultado, orçamento e metas dinâmicas
// Salva como uma entry da Central (mesma estrutura do fluxo antigo), garantindo
// a categoria/filtro no banco quando for nova.

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2, Plug, Target, X, Plus } from "lucide-react";
import {
  INTENT_META, INTENT_OPTIONS,
  type CampaignCenterEntry, type CampaignIntent,
} from "@/hooks/useCampaignCenter";
import type { ResultType } from "@/hooks/useAdvertiserStore";
import { RESULT_TYPE_OPTIONS } from "@/components/ProfileAnalysis";
import { useCompany, readAdAccountSuggestions } from "@/hooks/useCompany";
import { fetchUserCategories, upsertUserCategory } from "@/utils/supabaseCategories";
import type { UserCategory } from "@/types/userConfig";

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

export function CampaignWizard({ onClose, onSave }: {
  onClose: () => void;
  onSave: (entry: CampaignCenterEntry) => void;
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
  const [actId, setActId] = useState("");       // opcional
  const [intent, setIntent] = useState<CampaignIntent>(INTENT_OPTIONS[0].value);
  const [resultType, setResultType] = useState<ResultType>(INTENT_META[INTENT_OPTIONS[0].value].defaultResultTypes[0]);
  const [budget, setBudget] = useState("");
  const [goals, setGoals] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = INTENT_META[intent];
  const catLabel = newCat.trim() || cats.find((c) => c.slug === catSlug)?.name || "";
  const canNext = name.trim().length > 0 && catLabel.length > 0;

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

  const handleSave = async () => {
    if (!canNext) { setStep(1); return; }
    setSaving(true); setError(null);
    try {
      const isNew = newCat.trim().length > 0;
      const slug = isNew ? slugify(newCat.trim()) : catSlug;
      const label = isNew ? newCat.trim() : (cats.find((c) => c.slug === catSlug)?.name ?? catSlug);

      // garante a categoria/filtro no banco quando for nova — mas se o upsert
      // falhar (offline/sem sessão), segue com o slug local: não trava o save.
      let categorySlug = slug;
      try {
        const existing = cats.find((c) => c.slug === slug);
        const category = existing ?? await upsertUserCategory({ slug, name: label, type: "custom", position: cats.length });
        categorySlug = category?.slug ?? slug;
      } catch { /* mantém categorySlug = slug local */ }

      const act = actId ? normAct(actId) : "manual";
      const actLabel = actId
        ? (suggested.find((s) => normAct(s.id) === act)?.label ?? act)
        : "Manual";
      const b = parseFloat(budget);

      onSave({
        campaignId: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        campaignName: name.trim(),
        adAccountId: act,
        adAccountLabel: actLabel,
        intent,
        resultType,
        groupId: categorySlug,
        monthlyBudget: isNaN(b) || b <= 0 ? null : b,
        goals,
        enabled: true,
        autoConfigured: false,
        updatedAt: new Date().toISOString(),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar a campanha.");
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
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
              Passo {step} de 2 — {step === 1 ? "identificação" : "objetivo & metas"}
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
          <div className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className={labelCls} style={{ color: "var(--dm-text-tertiary)" }}>Nome da campanha</span>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="ex: Biomecânica, Musculação, Mentoria Scala"
                  className={fieldCls} style={fieldStyle} autoFocus />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelCls} style={{ color: "var(--dm-text-tertiary)" }}>Conta de anúncio (opcional)</span>
                <select value={actId} onChange={(e) => setActId(e.target.value)} className={fieldCls} style={fieldStyle}>
                  <option value="">Sem conta específica</option>
                  {suggested.map((s) => (
                    <option key={s.id} value={s.id}>★ {s.label || s.id}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-col gap-2">
              <span className={labelCls} style={{ color: "var(--dm-text-tertiary)" }}>Em qual categoria deve aparecer</span>
              <div className="flex flex-wrap gap-2">
                {cats.map((c) => {
                  const active = !newCat.trim() && catSlug === c.slug;
                  return (
                    <button key={c.id} type="button"
                      onClick={() => { setCatSlug(c.slug); setNewCat(""); setCreatingCat(false); }}
                      className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:opacity-80"
                      style={{
                        borderColor: active ? "var(--dm-primary)" : "var(--dm-border-default)",
                        background: active ? "rgba(22,163,74,0.12)" : "var(--dm-bg-elevated)",
                        color: active ? "var(--dm-primary)" : "var(--dm-text-secondary)",
                      }}>
                      <span>{c.emoji ?? "🏷️"}</span> {c.name}
                    </button>
                  );
                })}
                <button type="button" onClick={() => { setCreatingCat(true); setCatSlug(""); }}
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
                  className={fieldCls} style={{ ...fieldStyle, marginTop: 4 }} autoFocus />
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Resumo do passo 1 */}
            <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3" style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)" }}>
              <span className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>{name.trim() || "Campanha"}</span>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "rgba(22,163,74,0.12)", color: "var(--dm-primary)" }}>{catLabel}</span>
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
