"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Megaphone, Sparkles, Trash2, FlaskConical, ChevronDown, ChevronUp, Target,
  Plug, Loader2, Search, X, CheckCircle2, AlertCircle,
} from "lucide-react";
import {
  useCampaignCenter, detectIntent, INTENT_META, INTENT_OPTIONS,
  type CampaignCenterEntry, type CampaignIntent,
} from "@/hooks/useCampaignCenter";
import { useCompany, readAdAccountSuggestions, type CompanyRole } from "@/hooks/useCompany";
import type { ResultType } from "@/hooks/useAdvertiserStore";
import { RESULT_TYPE_OPTIONS, RESULT_TYPE_LABELS } from "@/components/ProfileAnalysis";
import {
  fetchMetaCampaigns, fetchMetaAdAccounts, loadMetaCredentials, saveMetaCredentials,
  type MetaCampaign, type MetaAdAccount,
} from "@/utils/metaApi";
import { TabAccounts, type TabAccountsProps } from "@/components/ControlPanel";
import {
  fetchUserAccountEntries, fetchUserCategories,
  upsertUserCategory, upsertUserAccountEntry,
} from "@/utils/supabaseCategories";
import type { UserAccountEntry, UserCategory } from "@/types/userConfig";
import { Wallet, Layers, Goal } from "lucide-react";
import { formatBRL } from "@/lib/format";

// ─── Dados fakes para teste local ─────────────────────────────────────────────

interface MockCampaign {
  id: string; name: string; adAccountId: string; adAccountLabel: string;
  objective?: string; detectedResultType?: ResultType;
}

const MOCK_CENTER_CAMPAIGNS: MockCampaign[] = [
  { id: "mc_001", name: "[LEAD] Captação BM - Formulário Instantâneo", adAccountId: "act_demo_1", adAccountLabel: "PTA Digital (demo)", objective: "OUTCOME_LEADS", detectedResultType: "leadgen_grouped" },
  { id: "mc_002", name: "[VENDA] Remarketing Compra Pós-Graduação",    adAccountId: "act_demo_1", adAccountLabel: "PTA Digital (demo)", objective: "OUTCOME_SALES", detectedResultType: "offsite_conversion.fb_pixel_purchase" },
  { id: "mc_003", name: "Topo - Visitas ao Perfil Instagram",           adAccountId: "act_demo_1", adAccountLabel: "PTA Digital (demo)", objective: "OUTCOME_ENGAGEMENT", detectedResultType: "profile_visit" },
  { id: "mc_004", name: "Tráfego LP - Ebook Biomecânica",               adAccountId: "act_demo_2", adAccountLabel: "Cliente Fitness (demo)", objective: "OUTCOME_TRAFFIC", detectedResultType: "link_click" },
  { id: "mc_005", name: "Leads no Site - Pixel Captação",               adAccountId: "act_demo_2", adAccountLabel: "Cliente Fitness (demo)", detectedResultType: "offsite_conversion.fb_pixel_lead" },
  { id: "mc_006", name: "Alcance - Branding Instituto",                 adAccountId: "act_demo_2", adAccountLabel: "Cliente Fitness (demo)", objective: "OUTCOME_AWARENESS" },
];

function mockToEntry(c: MockCampaign): CampaignCenterEntry {
  const intent = detectIntent({ objective: c.objective, resultType: c.detectedResultType, name: c.name });
  return {
    campaignId: c.id,
    campaignName: c.name,
    adAccountId: c.adAccountId,
    adAccountLabel: c.adAccountLabel,
    intent,
    resultType: c.detectedResultType ?? INTENT_META[intent].defaultResultTypes[0],
    groupId: "",
    monthlyBudget: null,
    goals: {},
    enabled: true,
    autoConfigured: true,
    updatedAt: new Date().toISOString(),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const UNIT_PLACEHOLDER: Record<string, string> = {
  qtd: "ex: 200", brl: "R$", pct: "%", x: "ex: 3.0",
};

// ─── Drawer: Conectar conta e importar campanhas ─────────────────────────────
// Duas vias, sem refazer o setup do Painel de Controle:
//  1. "Já configuradas" — linka as contas/campanhas que o Painel já tem
//  2. "Novo ACT" — token vem da empresa; só pede se ainda não existir

type ConnectTab = "linked" | "new";

function ConnectDrawer({ onClose, onImport }: {
  onClose: () => void;
  onImport: (entries: CampaignCenterEntry[]) => void;
}) {
  const [tab, setTab] = useState<ConnectTab>("linked");

  // ── Aba 1: entries já configuradas no Painel de Controle ──
  const [configured, setConfigured]       = useState<UserAccountEntry[]>([]);
  const [cats, setCats]                   = useState<UserCategory[]>([]);
  const [selectedLinks, setSelectedLinks] = useState<Set<string>>(new Set());
  const [loadingLinked, setLoadingLinked] = useState(true);

  // ── Aba 2: ACT novo (setup completo: nome + filtro + ACT + campanhas) ──
  // token da empresa já entra como valor inicial (sem setState em effect)
  const [token, setToken]           = useState(() => loadMetaCredentials().accessToken);
  const [accounts, setAccounts]     = useState<MetaAdAccount[]>([]);
  const [actId, setActId]           = useState("");
  const [entryName, setEntryName]   = useState("");
  const [filterSlug, setFilterSlug] = useState("");
  const [campaigns, setCampaigns]   = useState<MetaCampaign[]>([]);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [search, setSearch]         = useState("");
  const [loading, setLoading]       = useState<"accounts" | "campaigns" | "saving" | null>(null);
  const [error, setError]           = useState<string | null>(null);

  // ── Contas sugeridas (registro da empresa em companies.settings) ──
  // Pré-preenchimento: ★ no topo do select e auto-seleção. Mescladas mesmo que o
  // token não as retorne. NÃO são entries (não acoplam a filtro) — só sugestão.
  const { company } = useCompany();
  const suggested = useMemo(() => readAdAccountSuggestions(company?.settings), [company?.settings]);
  const normAct = (id: string) => `act_${id.replace(/^act_/, "")}`;
  const suggestedActIds = useMemo(
    () => new Set(suggested.map((a) => normAct(a.id))),
    [suggested],
  );

  // Há contas registradas (sugestões) → abre direto na aba "Novo ACT", onde elas
  // aparecem com ★. Senão o popup abria em "Já configuradas" e a sugestão sumia.
  useEffect(() => {
    if (suggested.length > 0) setTab("new");
  }, [suggested.length]);

  // Opções do select = contas do token ∪ registradas (sugeridas primeiro).
  // Registrada que o token não retornou entra mesmo assim, como opção própria.
  const accountOptions = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; suggested: boolean }>();
    for (const a of accounts) {
      byId.set(normAct(a.id), { id: a.id, name: a.name, suggested: suggestedActIds.has(normAct(a.id)) });
    }
    for (const s of suggested) {
      const key = normAct(s.id);
      const existing = byId.get(key);
      // registrada manda no nome (rótulo certo) e marca como sugerida
      if (existing) byId.set(key, { ...existing, name: s.label || existing.name, suggested: true });
      else byId.set(key, { id: key, name: s.label || key, suggested: true });
    }
    return [...byId.values()].sort((a, b) => Number(b.suggested) - Number(a.suggested));
  }, [accounts, suggested, suggestedActIds]);

  const catSlugs = useMemo(
    () => Object.fromEntries(cats.map((c) => [c.id, c.slug])) as Record<string, string>,
    [cats],
  );

  // Carrega o que o Painel de Controle já tem configurado (setup é o mesmo)
  useEffect(() => {
    void (async () => {
      try {
        const [entries, allCats] = await Promise.all([
          fetchUserAccountEntries(),
          fetchUserCategories(),
        ]);
        const enabled = entries.filter((e) => e.isEnabled);
        setConfigured(enabled);
        setCats(allCats.filter((c) => c.isEnabled));
        setSelectedLinks(new Set(enabled.map((e) => e.id)));
        if (enabled.length === 0) setTab("new");
      } catch { setTab("new"); }
      finally { setLoadingLinked(false); }
    })();
  }, []);

  const toggleLink = (id: string) => {
    setSelectedLinks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Importa as entries do Painel: campanhas selecionadas, grupo = filtro/categoria
  const handleLinkImport = () => {
    const now = new Date().toISOString();
    const result: CampaignCenterEntry[] = [];
    configured
      .filter((e) => selectedLinks.has(e.id))
      .forEach((e) => {
        const camps = e.selectedCampaignIds.length > 0
          ? e.campaigns.filter((c) => e.selectedCampaignIds.includes(c.id))
          : e.campaigns;
        camps.forEach((c) => {
          const intent = detectIntent({ name: c.name });
          result.push({
            campaignId: c.id,
            campaignName: c.name,
            adAccountId: e.adAccountId,
            adAccountLabel: e.label,
            intent,
            resultType: INTENT_META[intent].defaultResultTypes[0],
            groupId: e.internalFilter ?? catSlugs[e.categoryId] ?? "",
            monthlyBudget: null,
            goals: {},
            enabled: c.status === "ACTIVE",
            autoConfigured: true,
            updatedAt: now,
          });
        });
      });
    onImport(result);
    onClose();
  };

  const linkedCampaignCount = configured
    .filter((e) => selectedLinks.has(e.id))
    .reduce((sum, e) => sum + (e.selectedCampaignIds.length > 0
      ? e.selectedCampaignIds.length
      : e.campaigns.length), 0);

  const loadCampaigns = async (act: string, tk?: string) => {
    const useToken = (tk ?? token).trim();
    if (!act) return;
    setLoading("campaigns"); setError(null); setCampaigns([]); setSelected(new Set());
    try {
      const camps = await fetchMetaCampaigns(act, useToken);
      setCampaigns(camps);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao buscar campanhas.");
    } finally { setLoading(null); }
  };

  const loadAccounts = async (tk: string) => {
    if (!tk.trim()) { setError("Cole o Access Token."); return; }
    setLoading("accounts"); setError(null);
    try {
      const accs = await fetchMetaAdAccounts(tk.trim());
      setAccounts(accs);
      saveMetaCredentials({ accessToken: tk.trim() });
      // pré-preenche: conta sugerida (registrada) tem prioridade; senão, a única
      const suggested = accs.find((a) => suggestedActIds.has(normAct(a.id)));
      const pick = suggested ?? (accs.length === 1 ? accs[0] : null);
      if (pick) {
        setActId(pick.id);
        await loadCampaigns(pick.id, tk.trim());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao buscar contas.");
    } finally { setLoading(null); }
  };

  // Token da empresa presente → busca contas automaticamente ao abrir.
  // setTimeout tira o setState do corpo síncrono do effect (regra do lint).
  useEffect(() => {
    if (!token) return;
    const id = setTimeout(() => { void loadAccounts(token); }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filtered = campaigns.filter((c) =>
    !search.trim() || c.name.toLowerCase().includes(search.toLowerCase()),
  );

  const accountLabel = accounts.find((a) => a.id === actId)?.name ?? actId;

  const slugify = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  // Setup completo de uma vez: garante o filtro (categoria), salva a conta
  // no Painel de Controle e manda as campanhas para a Central já configuradas.
  const handleImport = async () => {
    const chosen = campaigns.filter((c) => selected.has(c.id));
    if (chosen.length === 0) return;
    setLoading("saving"); setError(null);

    const label = entryName.trim() || accountLabel;
    const slug  = slugify(filterSlug.trim() || label);

    try {
      // 1. filtro: usa categoria existente ou cria na hora
      let category = cats.find((c) => c.slug === slug);
      if (!category) {
        category = await upsertUserCategory({
          slug, name: filterSlug.trim() || label, type: "custom", position: cats.length,
        });
      }

      // 2. conta no Painel de Controle (mesmo registro do setup antigo)
      await upsertUserAccountEntry({
        categoryId: category.id,
        label,
        adAccountId: actId,
        campaigns: chosen.map((c) => ({ id: c.id, name: c.name, status: c.status })),
        selectedCampaignIds: [],
      });

      // 3. campanhas na Central, já com intenção e grupo
      const now = new Date().toISOString();
      onImport(chosen.map((c) => {
        const intent = detectIntent({ objective: c.objective, name: c.name });
        return {
          campaignId: c.id,
          campaignName: c.name,
          adAccountId: actId,
          adAccountLabel: label,
          intent,
          resultType: INTENT_META[intent].defaultResultTypes[0],
          groupId: slug,
          monthlyBudget: null,
          goals: {},
          enabled: c.status === "ACTIVE",
          autoConfigured: true,
          updatedAt: now,
        };
      }));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar a configuração.");
    } finally { setLoading(null); }
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l shadow-2xl sm:max-w-[460px]"
        style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>

        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--dm-border-subtle)" }}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(99,102,200,0.12)" }}>
              <Plug size={16} style={{ color: "#6366C8" }} />
            </div>
            <div>
              <h3 className="text-sm font-bold" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
                Conectar conta
              </h3>
              <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                Linke o que já existe ou adicione um ACT novo
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full transition hover:opacity-70"
            style={{ color: "var(--dm-text-tertiary)" }}>
            <X size={15} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b px-5 pt-3" style={{ borderColor: "var(--dm-border-subtle)" }}>
          {([
            { id: "linked" as ConnectTab, label: "Já configuradas" },
            { id: "new"    as ConnectTab, label: "Novo ACT" },
          ]).map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className="rounded-t-lg px-3 py-2 text-[11px] font-bold transition"
              style={{
                color: tab === t.id ? "#6366C8" : "var(--dm-text-tertiary)",
                borderBottom: tab === t.id ? "2px solid #6366C8" : "2px solid transparent",
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {/* ── Aba: Já configuradas ── */}
          {tab === "linked" && (
            loadingLinked ? (
              <div className="flex items-center gap-2 py-6 justify-center">
                <Loader2 size={16} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} />
                <span className="text-xs" style={{ color: "var(--dm-text-tertiary)" }}>Buscando contas do Painel…</span>
              </div>
            ) : configured.length === 0 ? (
              <p className="py-6 text-center text-xs" style={{ color: "var(--dm-text-tertiary)" }}>
                Nenhuma conta configurada no Painel de Controle ainda. Use a aba &quot;Novo ACT&quot;.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
                  Setup é o mesmo do Painel de Controle — só escolha o que linkar.
                  Filtro vira o grupo e a intenção é detectada automaticamente.
                </p>
                {configured.map((e) => {
                  const isSel = selectedLinks.has(e.id);
                  const count = e.selectedCampaignIds.length > 0 ? e.selectedCampaignIds.length : e.campaigns.length;
                  return (
                    <button key={e.id} type="button" onClick={() => toggleLink(e.id)}
                      className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition"
                      style={{
                        borderColor: isSel ? "#6366C8" : "var(--dm-border-default)",
                        backgroundColor: isSel ? "rgba(99,102,200,0.08)" : "var(--dm-bg-elevated)",
                      }}>
                      <CheckCircle2 size={15} className="flex-shrink-0"
                        style={{ color: isSel ? "#6366C8" : "var(--dm-border-default)" }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>
                          {e.label}
                        </p>
                        <p className="text-[9px]" style={{ color: "var(--dm-text-tertiary)" }}>
                          {e.adAccountId} · {count} campanha{count !== 1 ? "s" : ""}
                          {e.internalFilter ? ` · filtro: ${e.internalFilter}` : ""}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          )}

          {/* ── Aba: Novo ACT ── */}
          {tab === "new" && !token && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
                Access Token (a empresa ainda não tem um salvo)
              </span>
              <div className="flex gap-2">
                <input type="password" value={token} onChange={(e) => setToken(e.target.value)}
                  placeholder="EAAxxxx…"
                  className="h-9 flex-1 rounded-[10px] border px-2.5 text-xs outline-none"
                  style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }} />
                <button type="button" onClick={() => void loadAccounts(token)}
                  disabled={loading === "accounts"}
                  className="flex items-center gap-1.5 rounded-[10px] px-3 text-[11px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)" }}>
                  {loading === "accounts" ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                  Buscar contas
                </button>
              </div>
            </div>
          )}

          {tab === "new" && token && accounts.length === 0 && loading !== "accounts" && (
            <button type="button" onClick={() => void loadAccounts(token)}
              className="flex items-center justify-center gap-1.5 rounded-[10px] py-2 text-[11px] font-semibold text-white transition hover:opacity-90"
              style={{ background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)" }}>
              <Search size={12} /> Buscar contas com o token da empresa
            </button>
          )}

          {tab === "new" && accountOptions.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
                Conta de Anúncio (ACT)
              </span>
              <select value={actId}
                onChange={(e) => {
                  const id = e.target.value;
                  setActId(id);
                  const acc = accountOptions.find((a) => a.id === id);
                  if (acc) setEntryName((prev) => prev || acc.name);
                  void loadCampaigns(id);
                }}
                className="h-9 rounded-[10px] border px-2.5 text-xs outline-none"
                style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}>
                <option value="">Selecione…</option>
                {accountOptions.map((a) => (
                  <option key={a.id} value={a.id}>{a.suggested ? "★ " : ""}{a.name} ({a.id})</option>
                ))}
              </select>
              {suggestedActIds.size > 0 && (
                <span className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                  ★ contas registradas para esta empresa
                </span>
              )}
            </div>
          )}

          {/* Nome + Filtro — tudo configurado de uma vez */}
          {tab === "new" && actId && (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
                  Nome da conta
                </span>
                <input type="text" value={entryName} onChange={(e) => setEntryName(e.target.value)}
                  placeholder="ex: Pós-graduação"
                  className="h-9 rounded-[10px] border px-2.5 text-xs outline-none"
                  style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
                  Filtro (existente ou novo)
                </span>
                <input type="text" value={filterSlug} onChange={(e) => setFilterSlug(e.target.value)}
                  list="dm-drawer-filter-options" placeholder="escolha ou crie…"
                  className="h-9 rounded-[10px] border px-2.5 text-xs outline-none"
                  style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }} />
                <datalist id="dm-drawer-filter-options">
                  {cats.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
                </datalist>
              </label>
            </div>
          )}

          {/* Campanhas do ACT novo */}
          {tab === "new" && loading === "campaigns" && (
            <div className="flex items-center gap-2 py-6 justify-center">
              <Loader2 size={16} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} />
              <span className="text-xs" style={{ color: "var(--dm-text-tertiary)" }}>Buscando campanhas…</span>
            </div>
          )}

          {tab === "new" && campaigns.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
                  Campanhas ({selected.size}/{campaigns.length})
                </span>
                <button type="button"
                  onClick={() => setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((c) => c.id)))}
                  className="text-[10px] font-semibold transition hover:opacity-70"
                  style={{ color: "#6366C8" }}>
                  {selected.size === filtered.length ? "Desmarcar todas" : "Marcar todas"}
                </button>
              </div>
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrar por nome…"
                className="h-8 rounded-[10px] border px-2.5 text-xs outline-none"
                style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }} />

              <div className="flex flex-col gap-1.5">
                {filtered.map((c) => {
                  const intent = detectIntent({ objective: c.objective, name: c.name });
                  const meta = INTENT_META[intent];
                  const isSel = selected.has(c.id);
                  return (
                    <button key={c.id} type="button" onClick={() => toggleSelect(c.id)}
                      className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition"
                      style={{
                        borderColor: isSel ? "#6366C8" : "var(--dm-border-default)",
                        backgroundColor: isSel ? "rgba(99,102,200,0.08)" : "var(--dm-bg-elevated)",
                      }}>
                      <CheckCircle2 size={15} className="flex-shrink-0"
                        style={{ color: isSel ? "#6366C8" : "var(--dm-border-default)" }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>
                          {c.name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                            style={{ backgroundColor: meta.color + "1a", color: meta.color }}>
                            {meta.label}
                          </span>
                          <span className="text-[9px] uppercase" style={{ color: c.status === "ACTIVE" ? "#05CD99" : "var(--dm-text-tertiary)" }}>
                            {c.status === "ACTIVE" ? "ativa" : c.status.toLowerCase()}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[11px]"
              style={{ borderColor: "rgba(238,93,80,0.4)", backgroundColor: "rgba(238,93,80,0.08)", color: "#EE5D50" }}>
              <AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-4" style={{ borderColor: "var(--dm-border-subtle)" }}>
          {tab === "linked" ? (
            <button type="button" onClick={handleLinkImport} disabled={selectedLinks.size === 0}
              className="w-full rounded-xl py-2.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
              style={{ background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)" }}>
              Linkar {linkedCampaignCount > 0 ? `${linkedCampaignCount} campanha${linkedCampaignCount !== 1 ? "s" : ""}` : "campanhas"} à Central
            </button>
          ) : (
            <button type="button" onClick={() => void handleImport()}
              disabled={selected.size === 0 || loading === "saving"}
              className="w-full rounded-xl py-2.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
              style={{ background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)" }}>
              {loading === "saving"
                ? "Salvando configuração…"
                : `Configurar ${selected.size > 0 ? `${selected.size} campanha${selected.size !== 1 ? "s" : ""}` : "campanhas"} de uma vez`}
            </button>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── Badge de empresa + role ──────────────────────────────────────────────────

const ROLE_LABELS: Record<CompanyRole, string> = {
  owner:   "Dono",
  manager: "Gestor",
  viewer:  "Visualização",
};

function CompanyBadge() {
  const { company, role } = useCompany();
  if (!company || !role) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold"
      style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)", backgroundColor: "var(--dm-bg-elevated)" }}>
      {company.name}
      <span className="rounded-full px-1.5 py-px text-[9px] font-bold text-white"
        style={{ backgroundColor: role === "owner" ? "#8b5cf6" : role === "manager" ? "#10b981" : "#64748b" }}>
        {ROLE_LABELS[role]}
      </span>
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CampaignCenter() {
  const { entries, upsertEntries, updateEntry, removeEntry, clearAll } = useCampaignCenter();
  const { canWrite, company } = useCompany();
  // sem empresa configurada (migration pendente) ninguém é bloqueado
  const readOnly = Boolean(company) && !canWrite;
  // Colapsado por padrão: só o card aberto monta os controles (DOM enxuto)
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showConnect, setShowConnect] = useState(false);

  // Grupos = filtros/categorias do Painel (mesmo setup, sem retrabalho)
  const [categoryGroups, setCategoryGroups] = useState<string[]>([]);
  useEffect(() => {
    void fetchUserCategories()
      .then((cats) => setCategoryGroups(cats.filter((c) => c.isEnabled).map((c) => c.slug)))
      .catch(() => {});
  }, []);
  const groupOptions = useMemo(() => {
    const set = new Set<string>(categoryGroups);
    entries.forEach((e) => { if (e.groupId) set.add(e.groupId); });
    return Array.from(set).sort();
  }, [categoryGroups, entries]);

  const byAccount = useMemo(() => {
    const map = new Map<string, { label: string; items: CampaignCenterEntry[] }>();
    entries.forEach((e) => {
      const cur = map.get(e.adAccountId) ?? { label: e.adAccountLabel ?? e.adAccountId, items: [] };
      cur.items.push(e);
      map.set(e.adAccountId, cur);
    });
    return Array.from(map.entries());
  }, [entries]);

  const seedMock = () => upsertEntries(MOCK_CENTER_CAMPAIGNS.map(mockToEntry));

  const autoConfigureAll = () => {
    upsertEntries(entries.map((e) => {
      const intent = detectIntent({ resultType: e.resultType, name: e.campaignName });
      return { ...e, intent, autoConfigured: true, updatedAt: new Date().toISOString() };
    }));
  };

  const toggleCollapse = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
            Central de Campanhas
          </h2>
          <p className="text-xs" style={{ color: "var(--dm-text-tertiary)" }}>
            Conta, filtro, ACT e campanhas — tudo configurado de uma vez em Conectar conta.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CompanyBadge />
          {!readOnly && (<>
          <button type="button" onClick={() => setShowConnect(true)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold text-white transition hover:opacity-90"
            style={{ background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)" }}>
            <Plug size={12} /> Conectar conta
          </button>
          {entries.length > 0 && (
            <button type="button" onClick={autoConfigureAll}
              className="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-semibold transition hover:opacity-80"
              style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)", backgroundColor: "var(--dm-bg-elevated)" }}>
              <Sparkles size={12} /> Auto-configurar tudo
            </button>
          )}
          <button type="button" onClick={seedMock}
            className="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-semibold transition hover:opacity-80"
            style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)", backgroundColor: "var(--dm-bg-elevated)" }}>
            <FlaskConical size={12} /> Carregar dados de teste
          </button>
          {entries.length > 0 && (
            <button type="button" onClick={clearAll}
              className="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-semibold transition hover:opacity-80"
              style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)", backgroundColor: "transparent" }}>
              <Trash2 size={12} /> Limpar
            </button>
          )}
          </>)}
        </div>
      </div>

      {/* Empty state */}
      {entries.length === 0 && (
        <div className="rounded-[20px] border p-10 text-center"
          style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
          <Megaphone size={28} className="mx-auto mb-3" style={{ color: "var(--dm-text-tertiary)" }} />
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--dm-text-primary)" }}>
            Nenhuma campanha configurada
          </p>
          <p className="text-xs mb-4" style={{ color: "var(--dm-text-tertiary)" }}>
            {readOnly
              ? "Peça ao dono ou gestor da empresa para configurar as campanhas."
              : "Conecte uma conta — nome, filtro, ACT e campanhas configurados de uma vez."}
          </p>
          {!readOnly && (
          <div className="flex items-center justify-center gap-2">
            <button type="button" onClick={() => setShowConnect(true)}
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90"
              style={{ background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)" }}>
              <Plug size={13} /> Conectar conta
            </button>
            <button type="button" onClick={seedMock}
              className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-semibold transition hover:opacity-80"
              style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)", backgroundColor: "var(--dm-bg-elevated)" }}>
              <FlaskConical size={13} /> Dados de teste
            </button>
          </div>
          )}
        </div>
      )}

      {/* Opções de grupo compartilhadas pelos inputs dos cards */}
      <datalist id="dm-group-options">
        {groupOptions.map((g) => <option key={g} value={g} />)}
      </datalist>

      {/* Por conta */}
      {byAccount.map(([accountId, { label, items }]) => (
        <div key={accountId} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
              {label}
            </span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)" }}>
              {items.length} campanha{items.length !== 1 ? "s" : ""}
            </span>
          </div>

          {items.map((entry) => {
            const meta = INTENT_META[entry.intent];
            const isCollapsed = !expanded.has(entry.campaignId);
            return (
              <article key={entry.campaignId}
                className="rounded-[20px] border shadow-horizon overflow-hidden"
                style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)", opacity: entry.enabled ? 1 : 0.55 }}>

                {/* Card header */}
                <div className="flex items-center justify-between gap-3 px-5 py-3.5 cursor-pointer"
                  onClick={() => toggleCollapse(entry.campaignId)}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: meta.color + "1a" }}>
                      <Megaphone size={15} style={{ color: meta.color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>
                        {entry.campaignName}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ backgroundColor: meta.color + "1a", color: meta.color }}>
                          {meta.label}
                        </span>
                        <span className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                          {RESULT_TYPE_LABELS[entry.resultType]}
                        </span>
                        {entry.groupId && (
                          <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                            style={{ backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)" }}>
                            {entry.groupId}
                          </span>
                        )}
                        {entry.monthlyBudget != null && entry.monthlyBudget > 0 && (
                          <span className="text-[9px] tabular-nums" style={{ color: "var(--dm-text-tertiary)" }}>
                            {formatBRL(entry.monthlyBudget)}/mês
                          </span>
                        )}
                        {entry.autoConfigured && (
                          <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase"
                            style={{ backgroundColor: "rgba(99,102,200,0.12)", color: "#6366C8" }}>
                            auto
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    {/* Toggle ativa */}
                    <button type="button" role="switch" aria-checked={entry.enabled} disabled={readOnly}
                      onClick={() => updateEntry(entry.campaignId, { enabled: !entry.enabled })}
                      className="relative h-5 w-9 rounded-full transition-colors"
                      style={{ backgroundColor: entry.enabled ? "#05CD99" : "var(--dm-border-default)" }}>
                      <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all"
                        style={{ left: entry.enabled ? "18px" : "2px" }} />
                    </button>
                    <button type="button" onClick={() => toggleCollapse(entry.campaignId)}
                      className="flex h-6 w-6 items-center justify-center rounded-full transition hover:opacity-70"
                      style={{ color: "var(--dm-text-tertiary)" }}>
                      {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    </button>
                  </div>
                </div>

                {/* Card body — fieldset desabilita todos os controles para viewer */}
                {!isCollapsed && (
                  <fieldset disabled={readOnly} className="contents">
                  <div className="border-t px-5 py-4 flex flex-col gap-4" style={{ borderColor: "var(--dm-border-subtle)" }}>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {/* Intenção */}
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
                          Intenção
                        </span>
                        <select value={entry.intent}
                          onChange={(e) => {
                            const intent = e.target.value as CampaignIntent;
                            // Intenção dirige o resultType default — sem isto a
                            // mudança não chegava ao Perfil de Anunciantes (a ponte
                            // de lá lê resultType). O dropdown Resultado refina depois.
                            updateEntry(entry.campaignId, {
                              intent,
                              resultType: INTENT_META[intent].defaultResultTypes[0],
                              goals: {},
                            });
                          }}
                          className="h-9 rounded-[10px] border px-2.5 text-xs outline-none"
                          style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}>
                          {INTENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </label>

                      {/* Resultado */}
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
                          Resultado
                        </span>
                        <select value={entry.resultType}
                          onChange={(e) => updateEntry(entry.campaignId, { resultType: e.target.value as ResultType })}
                          className="h-9 rounded-[10px] border px-2.5 text-xs outline-none"
                          style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}>
                          {RESULT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </label>

                      {/* Grupo = filtro/categoria do Painel (datalist permite criar novo) */}
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
                          Grupo / Filtro
                        </span>
                        <input type="text" value={entry.groupId} list="dm-group-options"
                          onChange={(e) => updateEntry(entry.campaignId, { groupId: e.target.value })}
                          placeholder="escolha ou crie…"
                          className="h-9 rounded-[10px] border px-2.5 text-xs outline-none"
                          style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }} />
                      </label>

                      {/* Orçamento */}
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
                          Orçamento /mês
                        </span>
                        <input type="number" min="0" step="any"
                          value={entry.monthlyBudget ?? ""}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            updateEntry(entry.campaignId, { monthlyBudget: isNaN(v) || v <= 0 ? null : v });
                          }}
                          placeholder="R$ 0,00"
                          className="h-9 rounded-[10px] border px-2.5 text-xs outline-none text-right tabular-nums"
                          style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }} />
                      </label>
                    </div>

                    {/* Metas dinâmicas pela intenção */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Target size={11} style={{ color: meta.color }} />
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
                          Metas de {meta.label}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        {meta.goalFields.map((gf) => (
                          <label key={gf.id} className="flex flex-col gap-1">
                            <span className="text-[10px] font-semibold" style={{ color: "var(--dm-text-secondary)" }}>
                              {gf.label}
                            </span>
                            <input type="number" min="0" step="any"
                              value={entry.goals[gf.id] ?? ""}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                const goals = { ...entry.goals };
                                if (isNaN(v) || v <= 0) delete goals[gf.id]; else goals[gf.id] = v;
                                updateEntry(entry.campaignId, { goals });
                              }}
                              placeholder={UNIT_PLACEHOLDER[gf.unit]}
                              className="h-9 rounded-[10px] border px-2.5 text-xs outline-none text-right tabular-nums"
                              style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }} />
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Remover */}
                    <div className="flex justify-end">
                      <button type="button" onClick={() => removeEntry(entry.campaignId)}
                        className="flex items-center gap-1 text-[10px] font-semibold transition hover:opacity-70"
                        style={{ color: "var(--dm-text-tertiary)" }}>
                        <Trash2 size={11} /> Remover da Central
                      </button>
                    </div>
                  </div>
                  </fieldset>
                )}
              </article>
            );
          })}
        </div>
      ))}

      {showConnect && (
        <ConnectDrawer onClose={() => setShowConnect(false)} onImport={upsertEntries} />
      )}
    </div>
  );
}

// ─── AccountsHub — bento leve + fluxo clássico ────────────────────────────────
// Stats no topo dão o panorama; abaixo, o setup de sempre (categoria → ACT →
// campanhas → nome) com intenção inline. Editar intenção/metas depois: botão
// de lápis em cada conta.

function StatCard({ icon: Icon, label, value, accent }: {
  icon: typeof Wallet; label: string; value: string; accent: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[18px] border p-4 shadow-horizon"
      style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: accent + "1a" }}>
        <Icon size={17} style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider truncate" style={{ color: "var(--dm-text-tertiary)" }}>
          {label}
        </p>
        <p className="text-lg font-bold leading-tight tabular-nums" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
          {value}
        </p>
      </div>
    </div>
  );
}

export function AccountsHub(props: TabAccountsProps) {
  const { entries } = useCampaignCenter();

  const stats = useMemo(() => {
    const accounts = new Set(entries.map((e) => e.adAccountId)).size;
    const active = entries.filter((e) => e.enabled).length;
    const budget = entries.reduce((s, e) => s + (e.monthlyBudget ?? 0), 0);
    const withGoals = entries.filter((e) => Object.keys(e.goals).length > 0).length;
    return { accounts, active, budget, withGoals };
  }, [entries]);

  return (
    <div className="flex flex-col gap-4">
      {entries.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={Layers}    label="Contas conectadas"   value={String(stats.accounts)}                            accent="#6366C8" />
          <StatCard icon={Megaphone} label="Campanhas ativas"    value={`${stats.active}/${entries.length}`}               accent="#05CD99" />
          <StatCard icon={Wallet}    label="Orçamento /mês"      value={stats.budget > 0 ? formatBRL(stats.budget) : "—"}  accent="#F4A60D" />
          <StatCard icon={Goal}      label="Com metas definidas" value={String(stats.withGoals)}                           accent="#e11d48" />
        </div>
      )}
      <TabAccounts {...props} />
    </div>
  );
}
