"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Search, RefreshCw, Calendar, User } from "lucide-react";
import { loadMetaCredentials } from "@/utils/metaApi";
import { useAdvertiserStore } from "@/hooks/useAdvertiserStore";
import { classifyCampaign, classifyCourse } from "@/utils/campaignClassifier";
import { fetchLeads as fetchDbLeads, subscribeLeads, syncLeadsSheet } from "@/utils/supabaseLeads";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { MetaLeadRow } from "@/app/api/meta/leads/route";

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  pos:      "Pós-graduação",
  eventos:  "Evento",
  perpetuo: "Produto",
  ebooks:   "Ebook",
  livros:   "Livro",
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  pos:      { bg: "rgba(124,58,237,0.12)",  text: "var(--dm-primary)" },
  eventos:  { bg: "rgba(245,158,11,0.12)", text: "#d97706" },
  perpetuo: { bg: "rgba(16,185,129,0.12)", text: "#059669" },
  ebooks:   { bg: "rgba(139,92,246,0.12)", text: "#7c3aed" },
  livros:   { bg: "rgba(236,72,153,0.12)", text: "#db2777" },
};

const PRODUCT_LABELS: Record<string, string> = {
  biomecanica:  "Biomecânica",
  musculacao:   "Musculação",
  fisiologia:   "Fisiologia",
  bodybuilding: "Bodybuilding",
  feminino:     "Treino Feminino",
  funcional:    "Treino Funcional",
};

// ─── Types ────────────────────────────────────────────────────────────────────

/** Lead unificado p/ a tabela: Meta lead forms + leads da planilha (banco). */
interface EnrichedLead {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  createdTime: string;
  campaignName: string;
  /** Canal de negócio ("Meta Ads", "Orgânico", "Google"…). */
  origem: string;
  categoryTag: string;
  productTag:  string;
}

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day:    "2-digit",
    month:  "2-digit",
    year:   "2-digit",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

// ─── Filter chip ──────────────────────────────────────────────────────────────

function Chip({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-opacity hover:opacity-80"
      style={{
        borderColor: active ? "var(--dm-primary)"     : "var(--dm-border-default)",
        background:  active ? "rgba(124,58,237,0.12)"  : "transparent",
        color:       active ? "var(--dm-primary)"     : "var(--dm-text-tertiary)",
      }}
    >
      {label}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LeadsView() {
  const { profiles }                          = useAdvertiserStore();
  const [metaLeads, setMetaLeads]             = useState<EnrichedLead[]>([]);
  const [dbLeads, setDbLeads]                 = useState<EnrichedLead[]>([]);
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState<string | null>(null);
  const [search, setSearch]                   = useState("");
  const [categoryFilter, setCategoryFilter]   = useState<string | null>(null);
  const [productFilter, setProductFilter]     = useState<string | null>(null);
  const [origemFilter, setOrigemFilter]       = useState<string | null>(null);

  // Leads de outras fontes (planilha/Eduzz) vêm do banco e são populados pelo
  // sync da planilha; aqui só lemos + ouvimos realtime.
  const loadDbLeads = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      const rows = await fetchDbLeads();
      setDbLeads(rows.map((l) => ({
        id:           l.id,
        fullName:     l.fullName,
        email:        l.email,
        phone:        l.phone,
        createdTime:  l.createdTime,
        campaignName: l.produto ?? "",
        origem:       l.origem,
        categoryTag:  classifyCampaign(l.produto ?? ""),
        productTag:   classifyCourse(l.produto ?? ""),
      })));
    } catch { /* tabela ausente / sem permissão — não bloqueia */ }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    // Puxa a planilha de leads ao vivo (se configurada) e depois carrega do banco.
    void syncLeadsSheet().catch(() => {}).finally(() => { void loadDbLeads(); });
    const channel = subscribeLeads(loadDbLeads);
    return () => { void channel.unsubscribe(); };
  }, [loadDbLeads]);

  const today = new Date().toISOString().split("T")[0];
  const minus30 = new Date(Date.now() - 30 * 86400_000).toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(minus30);
  const [dateTo,   setDateTo]   = useState(today);

  const fetchLeads = useCallback(async () => {
    const { accessToken } = loadMetaCredentials();
    if (!accessToken) {
      setError("Token de acesso Meta não configurado. Configure em Configurações → Meta Ads.");
      return;
    }

    const campaignIds = profiles
      .flatMap((p) => p.campaigns.map((c) => c.id))
      .filter(Boolean);

    if (campaignIds.length === 0) {
      setError("Nenhuma campanha configurada. Adicione perfis em Perfil de Anunciantes.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        accessToken,
        campaignIds: campaignIds.join(","),
        dateFrom,
        dateTo,
      });
      const res  = await fetch(`/api/meta/leads?${params}`);
      const json = (await res.json()) as { leads: MetaLeadRow[]; errors?: string[] };

      const enriched: EnrichedLead[] = (json.leads ?? []).map((lead) => ({
        id:           lead.id,
        fullName:     lead.fullName,
        email:        lead.email,
        phone:        lead.phone,
        createdTime:  lead.createdTime,
        campaignName: lead.campaignName,
        origem:       "Meta Ads",
        categoryTag:  classifyCampaign(lead.campaignName),
        productTag:   classifyCourse(lead.campaignName),
      }));

      setMetaLeads(enriched);

      if (json.errors?.length) {
        setError(`Avisos: ${json.errors.slice(0, 2).join(" | ")}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao buscar leads.");
    } finally {
      setLoading(false);
    }
  }, [profiles, dateFrom, dateTo]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // Botão "Atualizar": re-puxa Meta + re-sincroniza a planilha de leads.
  const handleRefresh = useCallback(async () => {
    await Promise.allSettled([
      fetchLeads(),
      syncLeadsSheet().then(() => loadDbLeads()),
    ]);
  }, [fetchLeads, loadDbLeads]);

  // ── Derived ──────────────────────────────────────────────────────────────────

  // Leads Meta (pré-filtrados por data na API) + leads do banco (planilha/Eduzz,
  // filtrados por data aqui). Dedup por id.
  const leads = useMemo<EnrichedLead[]>(() => {
    const inRange = dbLeads.filter((l) => {
      const d = l.createdTime?.slice(0, 10);
      if (!d) return true;
      return (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
    });
    const merged = [...metaLeads, ...inRange];
    const seen = new Set<string>();
    return merged.filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true)));
  }, [metaLeads, dbLeads, dateFrom, dateTo]);

  const filtered = leads.filter((l) => {
    if (categoryFilter && l.categoryTag !== categoryFilter) return false;
    if (productFilter  && l.productTag  !== productFilter)  return false;
    if (origemFilter   && l.origem      !== origemFilter)   return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        l.fullName?.toLowerCase().includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.phone?.includes(q) ||
        l.campaignName.toLowerCase().includes(q) ||
        l.origem.toLowerCase().includes(q) ||
        false
      );
    }
    return true;
  });

  const categories = [...new Set(leads.map((l) => l.categoryTag).filter(Boolean))];
  const products   = [...new Set(leads.map((l) => l.productTag).filter(Boolean))];
  const origens    = [...new Set(leads.map((l) => l.origem).filter(Boolean))];

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full p-4 sm:p-6 overflow-y-auto">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold" style={{ color: "var(--dm-text-primary)" }}>
            Leads ao Vivo
          </h2>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--dm-text-tertiary)" }}>
            {origens.length > 0 ? origens.join(" · ") : "Meta Lead Ads"} · {filtered.length} lead{filtered.length !== 1 ? "s" : ""}
            {leads.length !== filtered.length && ` (${leads.length} total)`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={loading}
          className="flex-shrink-0 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-70 disabled:opacity-40"
          style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}
        >
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
          Atualizar
        </button>
      </div>

      {/* Date + Search row */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Calendar size={13} className="flex-shrink-0" style={{ color: "var(--dm-text-tertiary)" }} />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-lg border px-2 py-1 text-xs"
          style={{
            borderColor: "var(--dm-border-default)",
            background:  "var(--dm-bg-surface)",
            color:       "var(--dm-text-primary)",
          }}
        />
        <span className="text-xs" style={{ color: "var(--dm-text-tertiary)" }}>até</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded-lg border px-2 py-1 text-xs"
          style={{
            borderColor: "var(--dm-border-default)",
            background:  "var(--dm-bg-surface)",
            color:       "var(--dm-text-primary)",
          }}
        />
        <div className="relative flex-1 min-w-[180px]">
          <Search
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: "var(--dm-text-tertiary)" }}
          />
          <input
            type="text"
            placeholder="Nome, e-mail, telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border pl-7 pr-3 py-1.5 text-xs"
            style={{
              borderColor: "var(--dm-border-default)",
              background:  "var(--dm-bg-surface)",
              color:       "var(--dm-text-primary)",
            }}
          />
        </div>
      </div>

      {/* Origem chips — quebra por canal (Meta · Google · Orgânico…) */}
      {origens.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {origens.map((o) => (
            <Chip
              key={o}
              label={o}
              active={origemFilter === o}
              onClick={() => setOrigemFilter(origemFilter === o ? null : o)}
            />
          ))}
        </div>
      )}

      {/* Filter chips */}
      {(categories.length > 0 || products.length > 0) && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <Chip
              key={cat}
              label={CATEGORY_LABELS[cat] ?? cat}
              active={categoryFilter === cat}
              onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
            />
          ))}
          {products.map((prod) => (
            <Chip
              key={prod}
              label={PRODUCT_LABELS[prod] ?? prod}
              active={productFilter === prod}
              onClick={() => setProductFilter(productFilter === prod ? null : prod)}
            />
          ))}
        </div>
      )}

      {/* Warning (soft errors from partial API failures) */}
      {error && (
        <div
          className="mb-4 rounded-lg border px-3 py-2 text-xs"
          style={{
            borderColor: "rgba(239,68,68,0.3)",
            background:  "rgba(239,68,68,0.08)",
            color:       "#f87171",
          }}
        >
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && leads.length === 0 && (
        <div
          className="flex flex-1 items-center justify-center gap-2"
          style={{ color: "var(--dm-text-tertiary)" }}
        >
          <RefreshCw size={14} className="animate-spin" />
          <span className="text-sm">Buscando leads no Meta Ads…</span>
        </div>
      )}

      {/* Empty */}
      {!loading && leads.length === 0 && !error && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <User size={28} style={{ color: "var(--dm-text-tertiary)" }} />
          <p className="text-sm" style={{ color: "var(--dm-text-tertiary)" }}>
            Nenhum lead encontrado no período.
          </p>
          <p className="text-[11px] mt-0.5 text-center max-w-sm" style={{ color: "var(--dm-text-tertiary)" }}>
            Certifique-se de que suas campanhas usam o objetivo "Geração de Leads" no Meta.
          </p>
        </div>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <div
          className="overflow-x-auto rounded-2xl border"
          style={{ borderColor: "var(--dm-border-default)" }}
        >
          <table className="w-full min-w-[680px] text-xs">
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--dm-border-default)",
                  background:   "var(--dm-bg-elevated)",
                }}
              >
                {["Nome", "Data", "Número", "E-mail", "Origem", "Categoria", "Produto"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left font-semibold"
                    style={{ color: "var(--dm-text-tertiary)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead, i) => {
                const catColor = CATEGORY_COLORS[lead.categoryTag] ?? {
                  bg:   "rgba(100,100,100,0.10)",
                  text: "var(--dm-text-tertiary)",
                };
                return (
                  <tr
                    key={lead.id}
                    style={{
                      borderBottom: i < filtered.length - 1
                        ? "1px solid var(--dm-border-subtle)"
                        : undefined,
                      background: i % 2 === 0
                        ? "var(--dm-bg-surface)"
                        : "var(--dm-bg-card)",
                    }}
                  >
                    <td
                      className="px-4 py-2.5 font-medium"
                      style={{ color: "var(--dm-text-primary)" }}
                    >
                      {lead.fullName ?? "—"}
                    </td>
                    <td
                      className="px-4 py-2.5 tabular-nums whitespace-nowrap"
                      style={{ color: "var(--dm-text-secondary)" }}
                    >
                      {fmt(lead.createdTime)}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: "var(--dm-text-secondary)" }}>
                      {lead.phone ?? "—"}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: "var(--dm-text-secondary)" }}>
                      {lead.email ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className="rounded-full px-2 py-0.5 text-[9px] font-semibold whitespace-nowrap"
                        style={{ background: "var(--dm-primary-soft)", color: "var(--dm-primary)" }}
                      >
                        {lead.origem}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className="rounded-full px-2 py-0.5 text-[9px] font-semibold whitespace-nowrap"
                        style={{ background: catColor.bg, color: catColor.text }}
                      >
                        {CATEGORY_LABELS[lead.categoryTag] ?? lead.categoryTag}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {lead.productTag ? (
                        <span
                          className="rounded-full px-2 py-0.5 text-[9px] font-semibold whitespace-nowrap"
                          style={{
                            background: "rgba(91,96,210,0.10)",
                            color:      "var(--dm-text-secondary)",
                          }}
                        >
                          {PRODUCT_LABELS[lead.productTag] ?? lead.productTag}
                        </span>
                      ) : (
                        <span style={{ color: "var(--dm-text-tertiary)" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
