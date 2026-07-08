"use client";

// ─── Wizard: criar empresa (Painel Admin) ──────────────────────────────────────
// Passos: Nome → Abas do histórico → Filtros/subfiltros → Equipe → Revisar.
// Equipe: até 2 donos + demais papéis (Analista, Gestor de tráfego, Designer,
// Visualizador). Papel "de RH" vai pra settings.memberTitles; no banco vira
// owner/manager/viewer (invite_company_member, migration 025).

import { useState } from "react";
import {
  ArrowLeft, ArrowRight, Building2, CheckCircle2, History, Loader2,
  Mail, PartyPopper, Plus, SlidersHorizontal, Sparkles, Trash2, Users, X,
} from "lucide-react";
import { createCompany, inviteMemberByEmail, updateCompanySettings, useCompany } from "@/hooks/useCompany";
import { BUILTIN_HISTORY_KINDS, HISTORICAL_KIND_LABELS, CUSTOM_HISTORY_TABS_KEY, type CustomHistoryTab } from "@/types/historical";
import { toast } from "@/hooks/useToast";
import { upsertUserCategory } from "@/utils/supabaseCategories";
import {
  INVITE_ROLES, MEMBER_TITLES_KEY, COMPANY_FILTERS_KEY, slugify,
  type CompanyFilter,
} from "./sections";

const STEPS = [
  { icon: Building2,         label: "Nome" },
  { icon: History,           label: "Histórico" },
  { icon: SlidersHorizontal, label: "Filtros" },
  { icon: Users,             label: "Equipe" },
  { icon: CheckCircle2,      label: "Revisar" },
];

// Sugestões prontas pro passo de filtros (um clique adiciona).
const FILTER_SUGGESTIONS = ["Lançamentos", "Eventos", "Perpétuo"];
const SUB_SUGGESTIONS = ["Pós-graduação", "Info produtos"];

interface TeamEntry { email: string; roleId: string }

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const inputStyle: React.CSSProperties = {
  borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)",
};

export function CreateCompanyWizard({ onDone }: { onDone: () => void }) {
  const { switchCompany } = useCompany();
  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  // Passo 1 — nome + TAG (3 letras, única na plataforma)
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const tagValid = /^[A-Za-z]{3}$/.test(tag.trim());

  // Passo 2 — abas do histórico
  const [kinds, setKinds] = useState<string[]>([...BUILTIN_HISTORY_KINDS]);
  const [customTabs, setCustomTabs] = useState<CustomHistoryTab[]>([]);
  const [newTab, setNewTab] = useState("");

  // Passo 3 — filtros + subfiltros
  const [filters, setFilters] = useState<CompanyFilter[]>([]);
  const [newFilter, setNewFilter] = useState("");
  const [newSub, setNewSub] = useState<Record<string, string>>({});

  // Passo 4 — equipe
  const [owners, setOwners] = useState<string[]>([""]);
  const [team, setTeam] = useState<TeamEntry[]>([]);
  const [teamEmail, setTeamEmail] = useState("");
  const [teamRole, setTeamRole] = useState("analista");

  const ownersClean = owners.map((o) => o.trim()).filter(Boolean);
  const ownersValid = ownersClean.every((o) => EMAIL_RE.test(o));
  const canNext =
    step === 0 ? name.trim().length > 0 && tagValid :
    step === 3 ? ownersValid :
    true;

  const toggleKind = (k: string) =>
    setKinds((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  const addCustomTab = () => {
    const nm = newTab.trim();
    if (!nm) return;
    setCustomTabs((prev) => [...prev, { id: slugify(nm) || `tab-${Date.now()}`, label: nm }]);
    setNewTab("");
  };

  const addFilter = (nm: string) => {
    const clean = nm.trim();
    if (!clean || filters.some((f) => f.name.toLowerCase() === clean.toLowerCase())) return;
    setFilters((prev) => [...prev, { id: slugify(clean) || `f-${Date.now()}`, name: clean, subfilters: [] }]);
    setNewFilter("");
  };

  const addSub = (fid: string, nm: string) => {
    const clean = nm.trim();
    if (!clean) return;
    setFilters((prev) => prev.map((f) => (f.id === fid && !f.subfilters.includes(clean) ? { ...f, subfilters: [...f.subfilters, clean] } : f)));
    setNewSub((p) => ({ ...p, [fid]: "" }));
  };

  const addTeam = () => {
    const email = teamEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email) || team.some((t) => t.email === email)) return;
    setTeam((prev) => [...prev, { email, roleId: teamRole }]);
    setTeamEmail("");
  };

  const submit = async () => {
    setCreating(true);
    try {
      const company = await createCompany(name.trim(), ownersClean[0], tag.trim());

      // 2º dono + equipe (papel do banco vem do mapa INVITE_ROLES).
      const titles: Record<string, string> = {};
      if (ownersClean[0]) titles[ownersClean[0].toLowerCase()] = "Dono";
      if (ownersClean[1]) {
        await inviteMemberByEmail(company.id, ownersClean[1], "owner").catch((e) =>
          toast.error(`Convite do 2º dono falhou: ${e instanceof Error ? e.message : e}`));
        titles[ownersClean[1].toLowerCase()] = "Dono";
      }
      for (const t of team) {
        const role = INVITE_ROLES.find((r) => r.id === t.roleId)!;
        await inviteMemberByEmail(company.id, t.email, role.db).catch((e) =>
          toast.error(`Convite de ${t.email} falhou: ${e instanceof Error ? e.message : e}`));
        titles[t.email] = role.label;
      }

      // Taxonomia escolhida no wizard → companies.settings.
      await updateCompanySettings(company.id, {
        ...company.settings,
        enabledHistoryKinds: kinds,
        [CUSTOM_HISTORY_TABS_KEY]: customTabs,
        [COMPANY_FILTERS_KEY]: filters,
        [MEMBER_TITLES_KEY]: titles,
      });

      // Materializa os filtros como categorias do dashboard da empresa nova
      // (Painel de Controle / Conectar conta enxergam na hora).
      for (const [i, f] of filters.entries()) {
        await upsertUserCategory({ slug: f.id, name: f.name, type: "fixed", emoji: "🏷️", position: i, companyId: company.id }).catch(() => {});
      }

      switchCompany(company.id);
      setCreated(company.name);
      toast.success(`Empresa "${company.name}" criada.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar empresa.");
    } finally { setCreating(false); }
  };

  // ── Sucesso ──
  if (created) {
    return (
      <div className="mx-auto max-w-[560px]">
        <div className="rounded-2xl border p-8 text-center" style={{ borderColor: "rgba(5,205,153,0.4)", background: "rgba(5,205,153,0.06)" }}>
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(5,205,153,0.14)" }}>
            <PartyPopper size={24} style={{ color: "#05CD99" }} />
          </div>
          <p className="text-[18px] font-bold" style={{ color: "var(--dm-text-primary)" }}>Empresa criada!</p>
          <p className="mt-1 text-[13px]" style={{ color: "var(--dm-text-secondary)" }}>
            <strong>{created}</strong> já está no seletor, com filtros, histórico e convites do time enviados.
          </p>
          <button type="button" onClick={onDone}
            className="mx-auto mt-6 flex h-10 items-center gap-1.5 rounded-xl px-5 text-xs font-bold text-white transition hover:opacity-90"
            style={{ background: "var(--dm-btn-primary-bg)" }}>
            Ver empresas <ArrowRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[640px]">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: "var(--dm-primary-soft, rgba(22,163,74,0.12))" }}>
          <Sparkles size={19} style={{ color: "var(--dm-primary)" }} />
        </span>
        <div>
          <h1 className="text-[20px] font-bold" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>Criar empresa</h1>
          <p className="text-[12px]" style={{ color: "var(--dm-text-tertiary)" }}>Provisiona a conta completa: taxonomia + time, tudo de uma vez.</p>
        </div>
      </div>

      {/* Stepper */}
      <div className="mb-8 flex items-center">
        {STEPS.map((s, i) => {
          const done = i < step, active = i === step;
          return (
            <div key={s.label} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <div className="flex h-9 w-9 items-center justify-center rounded-full transition-colors"
                  style={{
                    background: done || active ? "var(--dm-primary)" : "var(--dm-bg-elevated)",
                    color: done || active ? "#fff" : "var(--dm-text-tertiary)",
                    border: done || active ? "none" : "1px solid var(--dm-border-default)",
                  }}>
                  {done ? <CheckCircle2 size={16} /> : <s.icon size={15} />}
                </div>
                <span className="text-[10px] font-semibold" style={{ color: active ? "var(--dm-text-primary)" : "var(--dm-text-tertiary)" }}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <div className="mx-2 mb-4 h-px flex-1" style={{ background: done ? "var(--dm-primary)" : "var(--dm-border-default)" }} />}
            </div>
          );
        })}
      </div>

      {/* ── Passo 0: nome + TAG ── */}
      {step === 0 && (
        <div>
          <label className="mb-1.5 block text-[12px] font-semibold" style={{ color: "var(--dm-text-secondary)" }}>Nome da empresa</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && canNext) setStep(1); }}
            placeholder="Ex: PT Academy"
            className="h-12 w-full rounded-xl border px-4 text-[14px] outline-none" style={inputStyle} />
          <p className="mt-2 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Como aparece no seletor de empresas do hub.</p>

          <label className="mb-1.5 mt-5 block text-[12px] font-semibold" style={{ color: "var(--dm-text-secondary)" }}>
            TAG <span className="font-normal" style={{ color: "var(--dm-text-tertiary)" }}>(3 letras, única — ex.: PTA)</span>
          </label>
          <input value={tag} maxLength={3}
            onChange={(e) => setTag(e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter" && canNext) setStep(1); }}
            placeholder="PTA"
            className="h-12 w-28 rounded-xl border px-4 text-center text-[15px] font-bold tracking-[0.3em] uppercase outline-none"
            style={{ ...inputStyle, borderColor: tag && !tagValid ? "#ef4444" : "var(--dm-border-default)" }} />
          <p className="mt-2 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Identificação curta da empresa nas listas do painel. Obrigatória.</p>
        </div>
      )}

      {/* ── Passo 1: abas do histórico ── */}
      {step === 1 && (
        <div>
          <p className="mb-1 text-[13px] font-bold" style={{ color: "var(--dm-text-primary)" }}>Quais abas do histórico esta empresa usa?</p>
          <p className="mb-4 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Desmarque o que não faz sentido. Adicione abas próprias se precisar.</p>
          <div className="flex flex-col gap-2">
            {BUILTIN_HISTORY_KINDS.map((k) => {
              const on = kinds.includes(k);
              return (
                <button key={k} type="button" onClick={() => toggleKind(k)}
                  className="flex items-center justify-between rounded-xl border px-4 py-3 text-left transition"
                  style={{
                    borderColor: on ? "var(--dm-primary)" : "var(--dm-border-default)",
                    background: on ? "var(--dm-primary-soft, rgba(22,163,74,0.08))" : "var(--dm-bg-surface)",
                  }}>
                  <span className="text-[13px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>{HISTORICAL_KIND_LABELS[k]}</span>
                  <span className="flex h-5 w-5 items-center justify-center rounded-md border"
                    style={{ borderColor: on ? "var(--dm-primary)" : "var(--dm-border-default)", background: on ? "var(--dm-primary)" : "transparent" }}>
                    {on && <CheckCircle2 size={13} className="text-white" />}
                  </span>
                </button>
              );
            })}
            {customTabs.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-xl border px-4 py-3"
                style={{ borderColor: "var(--dm-primary)", background: "var(--dm-primary-soft, rgba(22,163,74,0.08))" }}>
                <span className="text-[13px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>{t.label} <span className="text-[10px] font-bold" style={{ color: "var(--dm-primary)" }}>custom</span></span>
                <button type="button" onClick={() => setCustomTabs((prev) => prev.filter((x) => x.id !== t.id))} title="Remover">
                  <Trash2 size={14} style={{ color: "#EE5D50" }} />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input value={newTab} onChange={(e) => setNewTab(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addCustomTab(); }}
              placeholder="Aba custom (ex.: Mentorias)"
              className="h-10 min-w-0 flex-1 rounded-xl border px-3.5 text-[13px] outline-none" style={inputStyle} />
            <button type="button" onClick={addCustomTab} disabled={!newTab.trim()}
              className="flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
              style={{ background: "var(--dm-btn-primary-bg)" }}>
              <Plus size={13} /> Adicionar
            </button>
          </div>
        </div>
      )}

      {/* ── Passo 2: filtros ── */}
      {step === 2 && (
        <div>
          <p className="mb-1 text-[13px] font-bold" style={{ color: "var(--dm-text-primary)" }}>Filtros do dashboard</p>
          <p className="mb-3 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
            Ex.: Lançamentos, Eventos — e subfiltros dentro de cada um (Pós-graduação, Info produtos…).
          </p>

          <div className="mb-3 flex flex-wrap gap-1.5">
            {FILTER_SUGGESTIONS.filter((s) => !filters.some((f) => f.name === s)).map((s) => (
              <button key={s} type="button" onClick={() => addFilter(s)}
                className="rounded-full border border-dashed px-3 py-1.5 text-[11px] font-semibold transition hover:opacity-80"
                style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
                + {s}
              </button>
            ))}
          </div>

          <div className="mb-3 flex gap-2">
            <input value={newFilter} onChange={(e) => setNewFilter(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addFilter(newFilter); }}
              placeholder="Novo filtro"
              className="h-10 min-w-0 flex-1 rounded-xl border px-3.5 text-[13px] outline-none" style={inputStyle} />
            <button type="button" onClick={() => addFilter(newFilter)} disabled={!newFilter.trim()}
              className="flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
              style={{ background: "var(--dm-btn-primary-bg)" }}>
              <Plus size={13} /> Adicionar
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {filters.map((f) => (
              <div key={f.id} className="rounded-xl border p-3" style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)" }}>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold" style={{ color: "var(--dm-text-primary)" }}>{f.name}</span>
                  <button type="button" onClick={() => setFilters((prev) => prev.filter((x) => x.id !== f.id))} title="Excluir">
                    <Trash2 size={13} style={{ color: "#EE5D50" }} />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {f.subfilters.map((s) => (
                    <span key={s} className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                      style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)", background: "var(--dm-bg-elevated)" }}>
                      {s}
                      <button type="button" onClick={() => setFilters((prev) => prev.map((x) => (x.id === f.id ? { ...x, subfilters: x.subfilters.filter((y) => y !== s) } : x)))}>
                        <X size={11} style={{ color: "var(--dm-text-tertiary)" }} />
                      </button>
                    </span>
                  ))}
                  {SUB_SUGGESTIONS.filter((s) => !f.subfilters.includes(s)).map((s) => (
                    <button key={s} type="button" onClick={() => addSub(f.id, s)}
                      className="rounded-full border border-dashed px-2.5 py-1 text-[11px] transition hover:opacity-80"
                      style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)" }}>
                      + {s}
                    </button>
                  ))}
                  <input value={newSub[f.id] ?? ""} onChange={(e) => setNewSub((p) => ({ ...p, [f.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") addSub(f.id, newSub[f.id] ?? ""); }}
                    placeholder="+ subfiltro"
                    className="h-7 w-28 rounded-full border px-2.5 text-[11px] outline-none" style={inputStyle} />
                </div>
              </div>
            ))}
            {filters.length === 0 && (
              <p className="rounded-xl border border-dashed p-4 text-center text-[12px]" style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)" }}>
                Sem filtros por enquanto — dá pra criar depois em Filtros &amp; histórico.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Passo 3: equipe ── */}
      {step === 3 && (
        <div>
          <p className="mb-1 text-[13px] font-bold" style={{ color: "var(--dm-text-primary)" }}>Donos da conta <span className="font-normal text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>(máx. 2)</span></p>
          <div className="flex flex-col gap-2">
            {owners.map((o, i) => (
              <div key={i} className="flex gap-2">
                <input type="email" value={o}
                  onChange={(e) => setOwners((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={i === 0 ? "dono@email.com" : "segundo.dono@email.com (opcional)"}
                  className="h-11 min-w-0 flex-1 rounded-xl border px-3.5 text-[13px] outline-none"
                  style={{ ...inputStyle, borderColor: o.trim() && !EMAIL_RE.test(o.trim()) ? "#ef4444" : "var(--dm-border-default)" }} />
                {i > 0 && (
                  <button type="button" onClick={() => setOwners((prev) => prev.filter((_, j) => j !== i))} title="Remover">
                    <Trash2 size={14} style={{ color: "#EE5D50" }} />
                  </button>
                )}
              </div>
            ))}
            {owners.length < 2 && (
              <button type="button" onClick={() => setOwners((prev) => [...prev, ""])}
                className="flex h-9 w-fit items-center gap-1.5 rounded-lg border border-dashed px-3 text-[11px] font-bold transition hover:opacity-80"
                style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
                <Plus size={12} /> Segundo dono
              </button>
            )}
          </div>

          <p className="mb-1 mt-6 text-[13px] font-bold" style={{ color: "var(--dm-text-primary)" }}>Resto do time</p>
          <p className="mb-3 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Analista, Gestor de tráfego, Designer ou Visualizador.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input type="email" value={teamEmail} onChange={(e) => setTeamEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addTeam(); }}
              placeholder="pessoa@email.com"
              className="h-11 min-w-0 flex-1 rounded-xl border px-3.5 text-[13px] outline-none" style={inputStyle} />
            <select value={teamRole} onChange={(e) => setTeamRole(e.target.value)}
              className="h-11 rounded-xl border px-3 text-[13px] font-semibold outline-none" style={inputStyle}>
              {INVITE_ROLES.filter((r) => r.id !== "dono").map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <button type="button" onClick={addTeam} disabled={!EMAIL_RE.test(teamEmail.trim())}
              className="flex h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
              style={{ background: "var(--dm-btn-primary-bg)" }}>
              <Plus size={14} /> Incluir
            </button>
          </div>

          {team.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              {team.map((t) => (
                <div key={t.email} className="flex items-center gap-2 rounded-xl border px-3 py-2"
                  style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)" }}>
                  <Mail size={13} style={{ color: "var(--dm-text-tertiary)" }} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>{t.email}</span>
                  <span className="text-[11px] font-bold" style={{ color: "var(--dm-primary)" }}>
                    {INVITE_ROLES.find((r) => r.id === t.roleId)?.label}
                  </span>
                  <button type="button" onClick={() => setTeam((prev) => prev.filter((x) => x.email !== t.email))} title="Remover">
                    <Trash2 size={13} style={{ color: "#EE5D50" }} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Passo 4: revisar ── */}
      {step === 4 && (
        <div className="rounded-2xl border p-5" style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)" }}>
          <p className="mb-3 text-[13px] font-bold" style={{ color: "var(--dm-text-primary)" }}>Revisar</p>
          <ReviewRow label="Empresa" value={name.trim() || "—"} />
          <ReviewRow label="TAG" value={tag.trim().toUpperCase() || "—"} />
          <ReviewRow label="Abas do histórico" value={[
            ...kinds.map((k) => HISTORICAL_KIND_LABELS[k] ?? k),
            ...customTabs.map((t) => t.label),
          ].join(", ") || "Nenhuma"} />
          <ReviewRow label="Filtros" value={filters.length > 0
            ? filters.map((f) => f.subfilters.length > 0 ? `${f.name} (${f.subfilters.join(", ")})` : f.name).join(" · ")
            : "Nenhum"} />
          <ReviewRow label="Donos" value={ownersClean.join(", ") || "Sem convite (você como super admin)"} />
          <ReviewRow label="Time" value={team.length > 0
            ? team.map((t) => `${t.email} (${INVITE_ROLES.find((r) => r.id === t.roleId)?.label})`).join(" · ")
            : "Ninguém por enquanto"} last />
        </div>
      )}

      {/* Navegação */}
      <div className="mt-8 flex items-center justify-between">
        <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}
          className="flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition disabled:opacity-30"
          style={{ color: "var(--dm-text-secondary)" }}>
          <ArrowLeft size={14} /> Voltar
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canNext}
            className="flex h-10 items-center gap-1.5 rounded-xl px-5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
            style={{ background: "var(--dm-btn-primary-bg)" }}>
            Continuar <ArrowRight size={14} />
          </button>
        ) : (
          <button type="button" onClick={() => void submit()} disabled={creating || !name.trim() || !tagValid}
            className="flex h-10 items-center gap-1.5 rounded-xl px-5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
            style={{ background: "var(--dm-btn-primary-bg)" }}>
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Criar empresa
          </button>
        )}
      </div>
    </div>
  );
}

function ReviewRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-4 py-2 ${last ? "" : "border-b"}`} style={{ borderColor: "var(--dm-border-default)" }}>
      <span className="flex-shrink-0 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>{label}</span>
      <span className="text-right text-[12px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>{value}</span>
    </div>
  );
}
