"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Save, Loader2, BarChart3 } from "lucide-react";
import { toast } from "@/hooks/useToast";
import { productBaseName } from "@/lib/eduzz";
import {
  fetchTrackingFunnels, upsertTrackingFunnel, deleteTrackingFunnel,
  fetchEduzzCatalog, fetchTrackingPixels,
  type Company, type TrackingFunnel, type EduzzProduct, type TrackingPixel,
} from "@/hooks/useCompany";

// ─── Paleta de cores pré-definidas para o funil ───────────────────────────────
const COLORS = [
  "#16A34A", // verde (padrão)
  "#22C55E", // verde vivo
  "#0D9488", // teal
  "#f59e0b", // âmbar
  "#ef4444", // vermelho
  "#64748B", // cinza
];

const inputCls = "h-9 rounded-xl border px-3 text-[12px] outline-none transition focus:ring-1";
const inputStyle = { borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" } as React.CSSProperties;
const btnPrimary = "flex items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-bold text-white transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-40 focus-visible:outline-none";
const btnPrimaryStyle = { background: "linear-gradient(135deg,#16A34A 0%,#15803D 100%)" } as React.CSSProperties;

// ─── TagInput — chips de texto separados por vírgula/Enter ───────────────────
function TagInput({
  values, onChange, placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && !values.includes(trimmed)) onChange([...values, trimmed]);
    setDraft("");
  }

  return (
    <div className="flex flex-wrap gap-1.5 rounded-xl border p-2" style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)", minHeight: 38 }}>
      {values.map((v) => (
        <span
          key={v}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: "rgba(22,163,74,0.12)", color: "#16A34A" }}
        >
          {v}
          <button
            type="button"
            onClick={() => onChange(values.filter((x) => x !== v))}
            className="ml-0.5 opacity-60 hover:opacity-100"
            aria-label={`Remover ${v}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); }
          if (e.key === "Backspace" && !draft && values.length > 0) onChange(values.slice(0, -1));
        }}
        onBlur={commit}
        placeholder={values.length === 0 ? placeholder : ""}
        className="min-w-[120px] flex-1 bg-transparent text-[11px] outline-none"
        style={{ color: "var(--dm-text-primary)" }}
      />
    </div>
  );
}

// ─── ProductPicker — seleciona produtos pelo parentId, exibe nome limpo ────────
function ProductPicker({
  values, products, onChange, placeholder, color,
}: {
  values: string[];           // parentIds selecionados
  products: EduzzProduct[];
  onChange: (v: string[]) => void;
  placeholder: string;
  color: string;
}) {
  const [search, setSearch] = useState("");
  const labelOf = (parentId: string) => {
    const p = products.find((x) => x.parentId === parentId);
    return p ? productBaseName(p.name) : parentId;
  };
  const filtered = search.trim().length >= 1
    ? products.filter((p) => productBaseName(p.name).toLowerCase().includes(search.toLowerCase()))
    : [];
  return (
    <div>
      {values.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {values.map((v) => (
            <span key={v} className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${color}20`, color }}>
              {labelOf(v)}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="ml-0.5 opacity-60 hover:opacity-100" aria-label={`Remover produto`}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={placeholder}
          className={`${inputCls} w-full`}
          style={inputStyle}
        />
        {filtered.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-xl border shadow-lg" style={{ background: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
            {filtered.map((p) => {
              const active = values.includes(p.parentId);
              return (
                <button
                  key={p.parentId}
                  type="button"
                  onClick={() => { onChange(active ? values.filter((x) => x !== p.parentId) : [...values, p.parentId]); setSearch(""); }}
                  className="flex w-full items-center gap-2 border-b px-3 py-2 text-left text-[11px] transition-opacity hover:opacity-80 last:border-0"
                  style={{ borderColor: "var(--dm-border-subtle)", color: active ? color : "var(--dm-text-primary)" }}
                >
                  <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded" style={{ background: active ? `${color}20` : "var(--dm-bg-elevated)", border: `1px solid ${active ? color : "var(--dm-border-default)"}`, color }}>
                    {active && "✓"}
                  </span>
                  {productBaseName(p.name)}
                </button>
              );
            })}
          </div>
        )}
        {search.trim().length >= 1 && filtered.length === 0 && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-xl border px-3 py-2 text-[11px] shadow-lg" style={{ background: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)" }}>
            Nenhum resultado.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Form de edição de um funil ───────────────────────────────────────────────
function FunnelForm({
  initial, companyId, products, pixels, onSave, onCancel,
}: {
  initial: Partial<TrackingFunnel>;
  companyId: string;
  products: EduzzProduct[];
  pixels: TrackingPixel[];
  onSave: (f: TrackingFunnel) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial.label ?? "");
  const [color, setColor] = useState(initial.color ?? COLORS[0]!);
  const [pixelId, setPixelId] = useState<string | null>(() => initial.pixelId ?? (pixels.length === 1 ? (pixels[0]?.id ?? null) : null));
  const [productParentIds, setProductParentIds] = useState<string[]>(initial.productParentIds ?? []);
  // productNames preservado pra funis antigos (fallback de match por nome).
  const [productNames] = useState<string[]>(initial.productNames ?? []);
  // utm_campaigns preservado no payload (funis antigos), mas sem campo de edição na UI atual.
  const [utmCampaigns, setUtmCampaigns] = useState<string[]>(initial.utmCampaigns ?? []);
  const [urlPatterns, setUrlPatterns] = useState<string[]>(initial.urlPatterns ?? []);
  const [saving, setSaving] = useState(false);

  const isEmpty = !productParentIds.length && !productNames.length && !utmCampaigns.length && !urlPatterns.length;

  async function save() {
    if (!label.trim()) { toast.error("Nome obrigatório."); return; }
    if (isEmpty) { toast.error("Adicione pelo menos 1 matcher (produto, campanha ou URL)."); return; }
    setSaving(true);
    try {
      const saved = await upsertTrackingFunnel(companyId, {
        id: initial.id,
        label, color, pixelId, productParentIds, productNames, utmCampaigns, urlPatterns,
      });
      onSave(saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar funil.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border p-3" style={{ borderColor: "var(--dm-primary)", background: "rgba(22,163,74,0.04)" }}>
      {/* Nome + cor */}
      <div className="flex items-center gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Nome do funil (ex: Perpetuo SM)"
          className={`${inputCls} flex-1`}
          style={inputStyle}
        />
        <div className="flex gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className="h-5 w-5 rounded-full border-2 transition"
              style={{ background: c, borderColor: color === c ? "white" : "transparent", boxShadow: color === c ? `0 0 0 2px ${c}` : undefined }}
              aria-label={`Cor ${c}`}
            />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {/* Pixel */}
        {pixels.length > 0 && (
          <div>
            <label className="mb-1 block text-[10px] font-semibold" style={{ color: "var(--dm-text-tertiary)" }}>
              Pixel
            </label>
            <select
              value={pixelId ?? ""}
              onChange={(e) => setPixelId(e.target.value || null)}
              className={`${inputCls} w-full`}
              style={inputStyle}
            >
              {pixels.length > 1 && <option value="">— Todos os pixels —</option>}
              {pixels.map((px) => (
                <option key={px.id} value={px.id}>{px.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Produto Eduzz */}
        <div>
          <label className="mb-1 block text-[10px] font-semibold" style={{ color: "var(--dm-text-tertiary)" }}>
            Produto (Eduzz) — todas as ofertas do produto são incluídas automaticamente
          </label>
          <ProductPicker
            values={productParentIds}
            products={products}
            onChange={setProductParentIds}
            placeholder="Buscar produto Eduzz..."
            color={color}
          />
        </div>

        {/* UTM campaign */}
        <div>
          <label className="mb-1 block text-[10px] font-semibold" style={{ color: "var(--dm-text-tertiary)" }}>
            UTM Campaign — match exato em utm_campaign
          </label>
          <TagInput values={utmCampaigns} onChange={setUtmCampaigns} placeholder="ex: lancamento_julho" />
        </div>

        {/* URL pattern */}
        <div>
          <label className="mb-1 block text-[10px] font-semibold" style={{ color: "var(--dm-text-tertiary)" }}>
            URL da página — cole a URL completa sem UTMs
          </label>
          <TagInput values={urlPatterns} onChange={setUrlPatterns} placeholder="ex: https://seusite.com/pagina-de-vendas" />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-xl border px-3 py-1.5 text-[11px] font-semibold hover:opacity-70 transition-opacity" style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
          Cancelar
        </button>
        <button type="button" onClick={save} disabled={saving} className={btnPrimary} style={btnPrimaryStyle}>
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Salvar
        </button>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function FunnelConfigSection({
  company, canEdit, onFunnelsChange, onViewAnalytics,
}: {
  company: Company;
  canEdit: boolean;
  onFunnelsChange?: (funnels: TrackingFunnel[]) => void;
  onViewAnalytics?: (funnelId: string) => void;
}) {
  const [funnels, setFunnels] = useState<TrackingFunnel[] | null>(null);
  const [products, setProducts] = useState<EduzzProduct[]>([]);
  const [pixels, setPixels] = useState<TrackingPixel[]>([]);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchTrackingFunnels(company.id),
      fetchEduzzCatalog(company.id),
      fetchTrackingPixels(company.id),
    ]).then(([funnelList, catalog, pixelList]) => {
      if (!active) return;
      setFunnels(funnelList);
      setProducts(catalog);
      setPixels(pixelList);
    });
    return () => { active = false; };
  }, [company.id]);

  function updateFunnels(updater: (prev: TrackingFunnel[]) => TrackingFunnel[]) {
    setFunnels((prev) => {
      const next = updater(prev ?? []);
      onFunnelsChange?.(next);
      return next;
    });
  }

  async function removeFunnel(id: string) {
    setDeleting(id);
    try {
      await deleteTrackingFunnel(id);
      updateFunnels((prev) => prev.filter((f) => f.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover funil.");
    } finally {
      setDeleting(null);
    }
  }

  function onSaved(saved: TrackingFunnel) {
    updateFunnels((prev) => {
      const idx = prev.findIndex((f) => f.id === saved.id);
      if (idx >= 0) return prev.map((f, i) => (i === idx ? saved : f));
      return [...prev, saved];
    });
    setEditingId(null);
    toast.success(`Funil "${saved.label}" salvo.`);
  }

  return (
    <div className="space-y-4">
      {!canEdit && (
        <p className="rounded-lg border px-3 py-2 text-[11px] font-semibold" style={{ borderColor: "#F4A60D", background: "rgba(244,166,13,0.08)", color: "#F4A60D" }}>
          Somente o dono ou o gestor de tráfego da empresa podem editar essas configurações.
        </p>
      )}

      <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
        Agrupe eventos e visitantes por funil de campanha. Cada funil define matchers que identificam a qual produto/campanha
        um visitante pertence. No painel de tracking, chips de funil filtram visitantes e uma coluna indica a qual funil cada
        um pertence. Útil quando você usa o mesmo pixel pra múltiplos produtos ou lançamentos.
      </p>

      {funnels === null && (
        <div className="flex items-center justify-center gap-2 py-4">
          <Loader2 size={14} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} />
        </div>
      )}

      {funnels !== null && funnels.length === 0 && editingId !== "new" && (
        <p className="rounded-lg border px-3 py-2.5 text-[11px]" style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)" }}>
          Nenhum funil configurado. Crie o primeiro pra começar a separar suas campanhas.
        </p>
      )}

      {funnels?.map((f) => (
        <div key={f.id}>
          {editingId === f.id && canEdit ? (
            <FunnelForm
              initial={f}
              companyId={company.id}
              products={products}
              pixels={pixels}
              onSave={onSaved}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div
              className="flex items-center justify-between rounded-xl border px-3 py-2.5"
              style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)" }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ background: f.color }} />
                <span className="truncate text-[12px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>{f.label}</span>
                <span className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                  {[
                    f.productNames.length > 0 && `${f.productNames.length} produto${f.productNames.length > 1 ? "s" : ""}`,
                    f.utmCampaigns.length > 0 && `${f.utmCampaigns.length} UTM${f.utmCampaigns.length > 1 ? "s" : ""}`,
                    f.urlPatterns.length > 0 && `${f.urlPatterns.length} URL${f.urlPatterns.length > 1 ? "s" : ""}`,
                  ].filter(Boolean).join(" · ")}
                </span>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1 ml-2">
                {onViewAnalytics && (
                  <button
                    type="button"
                    onClick={() => onViewAnalytics(f.id)}
                    className="flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-semibold hover:opacity-70 transition-opacity"
                    style={{ borderColor: "var(--dm-primary)", color: "var(--dm-primary)" }}
                  >
                    <BarChart3 size={11} />
                    Ver Analytics
                  </button>
                )}
                {canEdit && (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditingId(f.id)}
                      className="rounded-lg border px-2 py-1 text-[10px] font-semibold hover:opacity-70 transition-opacity"
                      style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFunnel(f.id)}
                      disabled={deleting === f.id}
                      className="rounded-lg border p-1.5 hover:opacity-70 transition-opacity disabled:opacity-40"
                      style={{ borderColor: "rgba(239,68,68,0.3)", color: "#ef4444" }}
                      aria-label="Remover funil"
                    >
                      {deleting === f.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {editingId === "new" && canEdit && (
        <FunnelForm
          initial={{}}
          companyId={company.id}
          products={products}
          pixels={pixels}
          onSave={onSaved}
          onCancel={() => setEditingId(null)}
        />
      )}

      {canEdit && editingId !== "new" && (
        <button
          type="button"
          onClick={() => setEditingId("new")}
          className="flex items-center gap-1.5 rounded-xl border border-dashed px-3 py-2 text-[11px] font-semibold hover:opacity-70 transition-opacity w-full justify-center"
          style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)" }}
        >
          <Plus size={12} />
          Novo funil
        </button>
      )}

    </div>
  );
}
