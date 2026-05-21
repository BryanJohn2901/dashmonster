"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle, Award, CheckCircle2, CheckSquare, DollarSign,
  Globe, ImageIcon, PauseCircle, Square, Star, TrendingUp,
  XCircle, Zap, ChevronLeft, ChevronRight, BarChart2,
  CalendarDays, Repeat, GraduationCap, BookOpen, Users, Megaphone,
  ShoppingCart, RefreshCcw, Target, Mail, Ticket, UserCheck,
} from "lucide-react";
import { AggregatedCampaign, ProductCategory } from "@/types/campaign";
import { formatCurrency, formatNumber, formatPercent } from "@/utils/metrics";

interface CampaignAnalysisProps {
  campaigns: AggregatedCampaign[];
  selectedCategory?: ProductCategory | null;
  isMetricVisible?: (id: string) => boolean;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority = "alta" | "média" | "baixa";
type Category = "criativo" | "orçamento" | "landing" | "targeting" | "escalar" | "pausar";
type SubTab   = "overview" | "critical" | "positive" | "tasks";

interface Issue        { label: string; severity: "critical" | "warning" }
interface TaskSuggestion {
  id: string; priority: Priority; category: Category; title: string; detail: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<Category, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  pausar:    { label: "Pausar",    icon: PauseCircle,   color: "#EF4444", bg: "rgba(239,68,68,0.12)" },
  criativo:  { label: "Criativo",  icon: ImageIcon,     color: "#A78BFA", bg: "rgba(167,139,250,0.12)" },
  landing:   { label: "Landing",   icon: Globe,         color: "#F97316", bg: "rgba(249,115,22,0.12)" },
  orçamento: { label: "Orçamento", icon: DollarSign,    color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
  targeting: { label: "Targeting", icon: Target,        color: "#60A5FA", bg: "rgba(96,165,250,0.12)" },
  escalar:   { label: "Escalar",   icon: TrendingUp,    color: "#10B981", bg: "rgba(16,185,129,0.12)" },
};

const PRIORITY_COLOR: Record<Priority, { border: string; bg: string; text: string; dot: string }> = {
  alta:  { border: "#EF4444", bg: "rgba(239,68,68,0.10)",   text: "#EF4444", dot: "#EF4444" },
  média: { border: "#F59E0B", bg: "rgba(245,158,11,0.10)",  text: "#F59E0B", dot: "#F59E0B" },
  baixa: { border: "#10B981", bg: "rgba(16,185,129,0.10)",  text: "#10B981", dot: "#10B981" },
};

const PER_PAGE_CRITICAL = 6;
const PER_PAGE_TASKS    = 12;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getIssues(c: AggregatedCampaign): Issue[] {
  const out: Issue[] = [];
  if (c.roas < 1)                                out.push({ label: `ROAS negativo: ${c.roas.toFixed(2)}x — prejuízo por real investido`,         severity: "critical" });
  else if (c.roas < 2)                           out.push({ label: `ROAS baixo: ${c.roas.toFixed(2)}x (ideal ≥ 2x)`,                             severity: "warning" });
  if (c.conversions === 0 && c.investment > 100) out.push({ label: `Sem conversões com ${formatCurrency(c.investment)} investidos`,               severity: "critical" });
  else if (c.conversionRate < 1 && c.clicks > 200 && c.conversions > 0)
                                                 out.push({ label: `Tx. conversão baixa: ${formatPercent(c.conversionRate)} (ideal ≥ 1%)`,       severity: "warning" });
  if (c.ctr < 0.3 && c.impressions > 1000)      out.push({ label: `CTR crítico: ${formatPercent(c.ctr)} (ideal ≥ 0.5%)`,                         severity: "critical" });
  else if (c.ctr < 0.5 && c.impressions > 1000) out.push({ label: `CTR baixo: ${formatPercent(c.ctr)} (ideal ≥ 0.5%)`,                           severity: "warning" });
  return out;
}

function generateTasks(campaigns: AggregatedCampaign[]): TaskSuggestion[] {
  const tasks: TaskSuggestion[] = [];
  for (const c of campaigns) {
    const n = `"${c.campaignName}"`;
    if (c.roas < 1 && c.investment > 100)
      tasks.push({ id: `roas-neg-${c.campaignName}`, priority: "alta", category: "pausar",
        title: `Pausar ou revisar ${n}`,
        detail: `ROAS ${c.roas.toFixed(2)}x — cada R$1 investido retorna apenas R$${c.roas.toFixed(2)}. Pause enquanto revisa público, oferta e criativo.` });
    else if (c.roas >= 1 && c.roas < 2 && c.investment > 100)
      tasks.push({ id: `roas-low-${c.campaignName}`, priority: "média", category: "orçamento",
        title: `Reduzir budget de ${n} até estabilizar`,
        detail: `ROAS ${c.roas.toFixed(2)}x — margem estreita. Reduza o investimento diário em ~30% e ajuste a segmentação antes de escalar.` });
    if (c.conversions === 0 && c.investment > 100)
      tasks.push({ id: `no-conv-${c.campaignName}`, priority: "alta", category: "landing",
        title: `Revisar funil de compra de ${n}`,
        detail: `${formatCurrency(c.investment)} investidos, zero conversões. Teste o fluxo completo, cheque o pixel e a clareza da oferta na landing page.` });
    else if (c.conversionRate < 1 && c.clicks > 200 && c.conversions > 0)
      tasks.push({ id: `conv-low-${c.campaignName}`, priority: "média", category: "landing",
        title: `Otimizar landing page de ${n}`,
        detail: `${formatNumber(c.clicks)} cliques → ${formatNumber(c.conversions)} conversões (${formatPercent(c.conversionRate)}). Revise headline, prova social e CTA.` });
    if (c.ctr < 0.3 && c.impressions > 1000)
      tasks.push({ id: `ctr-crit-${c.campaignName}`, priority: "alta", category: "criativo",
        title: `Trocar criativo urgente em ${n}`,
        detail: `CTR ${formatPercent(c.ctr)} (crítico). O anúncio não gera atenção — troque imagem/vídeo e teste copy com gatilho de dor ou curiosidade.` });
    else if (c.ctr >= 0.3 && c.ctr < 0.5 && c.impressions > 1000)
      tasks.push({ id: `ctr-low-${c.campaignName}`, priority: "média", category: "criativo",
        title: `Testar variação de criativo em ${n}`,
        detail: `CTR ${formatPercent(c.ctr)} (abaixo dos 0.5% ideais). Crie 2–3 variações com hooks diferentes e faça A/B.` });
    if (c.roas >= 3 && c.investment > 50)
      tasks.push({ id: `scale-${c.campaignName}`, priority: "baixa", category: "escalar",
        title: `Escalar budget de ${n}`,
        detail: `ROAS ${c.roas.toFixed(2)}x — ótimo retorno. Aumente o budget diário em 20–30% e monitore por 3–5 dias.` });
    if (c.ctr >= 2 && c.impressions > 500)
      tasks.push({ id: `ref-ctr-${c.campaignName}`, priority: "baixa", category: "criativo",
        title: `Replicar criativo de ${n}`,
        detail: `CTR ${formatPercent(c.ctr)} — acima da média. Identifique o que funciona (formato, copy, hook) e teste em campanhas com CTR baixo.` });
    if (c.cpa > 0 && c.revenue > 0 && c.conversions > 0 && c.cpa > (c.revenue / c.conversions) * 0.5)
      tasks.push({ id: `cpa-high-${c.campaignName}`, priority: "média", category: "targeting",
        title: `Refinar segmentação de ${n} para reduzir CPA`,
        detail: `CPA ${formatCurrency(c.cpa)} — alto em relação ao ticket. Exclua segmentos de baixa intenção (lookalike muito amplo, etc).` });
  }
  const seen = new Set<string>();
  const order: Record<Priority, number> = { alta: 0, média: 1, baixa: 2 };
  return tasks
    .filter((t) => { if (seen.has(t.id)) return false; seen.add(t.id); return true; })
    .sort((a, b) => order[a.priority] - order[b.priority]);
}

// ─── Health score (0–100) ─────────────────────────────────────────────────────

function calcHealthScore(critical: number, warnings: number, total: number): number {
  if (total === 0) return 100;
  const penalty = critical * 10 + warnings * 5;
  return Math.max(0, Math.round(100 - (penalty / total) * total / Math.max(1, total) * 10));
}

function HealthRing({ score }: { score: number }) {
  const r      = 34;
  const circ   = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const color  = score >= 70 ? "#10B981" : score >= 40 ? "#F59E0B" : "#EF4444";
  return (
    <svg width={84} height={84} viewBox="0 0 84 84" className="-rotate-90">
      <circle cx={42} cy={42} r={r} fill="none" stroke="rgba(99,102,241,0.15)" strokeWidth={8} />
      <circle
        cx={42} cy={42} r={r} fill="none"
        stroke={color} strokeWidth={8}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
    </svg>
  );
}

// ─── Sub-tab bar ─────────────────────────────────────────────────────────────

function SubTabBar({
  active, onChange, tabs,
}: {
  active: SubTab;
  onChange: (t: SubTab) => void;
  tabs: { id: SubTab; label: string; count?: number; icon: React.ElementType }[];
}) {
  return (
    <div className="flex gap-1 border-b" style={{ borderColor: "var(--dm-border-default)" }}>
      {tabs.map(({ id, label, count, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-semibold transition ${
            active === id
              ? "border-blue-500"
              : "border-transparent"
          }`}
          style={{
            color: active === id ? "var(--dm-brand-500)" : "var(--dm-text-secondary)",
          }}
        >
          <Icon size={13} />
          {label}
          {count !== undefined && count > 0 && (
            <span
              className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
              style={{
                backgroundColor: active === id ? "var(--dm-brand-50)" : "var(--dm-bg-elevated)",
                color: active === id ? "var(--dm-brand-500)" : "var(--dm-text-tertiary)",
              }}
            >
              {count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Paginator ────────────────────────────────────────────────────────────────

function Paginator({
  page, total, perPage, onChange,
}: { page: number; total: number; perPage: number; onChange: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--dm-border-default)" }}>
      <p className="text-xs" style={{ color: "var(--dm-text-tertiary)" }}>
        {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} de {total}
      </p>
      <div className="flex gap-1">
        <button
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="flex h-7 w-7 items-center justify-center rounded-lg border disabled:opacity-30"
          style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}
        >
          <ChevronLeft size={13} />
        </button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
          return (
            <button
              key={p}
              onClick={() => onChange(p)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold transition"
              style={
                p === page
                  ? { backgroundColor: "var(--dm-brand-500)", color: "#fff" }
                  : { border: "1px solid var(--dm-border-default)", color: "var(--dm-text-secondary)" }
              }
            >
              {p}
            </button>
          );
        })}
        <button
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="flex h-7 w-7 items-center justify-center rounded-lg border disabled:opacity-30"
          style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}
        >
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Roadmap data ─────────────────────────────────────────────────────────────

interface RoadmapStep {
  icon: React.ElementType;
  label: string;
  description: string;
  tips?: string[];
}

const ROADMAPS: Record<ProductCategory, { title: string; subtitle: string; color: string; steps: RoadmapStep[] }> = {
  eventos: {
    title: "Roadmap de Evento",
    subtitle: "Sequência recomendada para maximizar vendas de ingressos",
    color: "#ec4899",
    steps: [
      { icon: CalendarDays, label: "Defina o evento",     description: "Data, local, capacidade e lotes de preço.",     tips: ["Crie urgência com lote 1 limitado", "Data âncora para retargeting"] },
      { icon: Globe,        label: "Monte a landing page", description: "LP com contador, provas sociais e FAQ completo.", tips: ["Acima da dobra: título + data + CTA", "Vídeo de venda aumenta conversão em 30%"] },
      { icon: Megaphone,    label: "Topo de funil",        description: "Vídeo de awareness e lookalike de compradores anteriores.", tips: ["CTR alvo: ≥ 1%", "Frequência max. 3,5 antes de trocar criativo"] },
      { icon: Ticket,       label: "Abertura de vendas",   description: "E-mail + anúncio de remarketing para leads quentes.",   tips: ["Envie e-mail D0 da abertura + D+2", "Use contador regressivo no criativo"] },
      { icon: UserCheck,    label: "Retargeting agressivo", description: "Alcance quem visitou a LP mas não comprou.",           tips: ["Janela de 3 e 7 dias", "Ofereça facilidade de pagamento"] },
      { icon: CheckCircle2, label: "Reta final",           description: "Último lote + gatilho de escassez real.",               tips: ["Aumente budget 20% nos últimos 5 dias", "Mostre vagas restantes no criativo"] },
    ],
  },
  perpetuo: {
    title: "Roadmap Perpétuo",
    subtitle: "Funil de aquisição contínua e redução de churn",
    color: "#f59e0b",
    steps: [
      { icon: Target,      label: "Construa o ativo",     description: "Lead magnet relevante (e-book, quiz, mini-curso).",  tips: ["Resolva 1 dor específica do ICP", "Taxa de captura alvo: ≥ 30%"] },
      { icon: Mail,        label: "Sequência de nutrição", description: "7–10 e-mails automáticos antes de pitchar.",         tips: ["E-mail 1: entrega + boas-vindas", "E-mail 5: case de sucesso + CTA"] },
      { icon: Megaphone,   label: "Tráfego de entrada",    description: "Meta Ads para landing de captura de leads.",         tips: ["CPL alvo: < 20% do ticket", "Lookalike de compradores anteriores"] },
      { icon: ShoppingCart, label: "Conversão",           description: "VSL ou webinário gravado + página de vendas.",        tips: ["Taxa de conv. alvo: ≥ 1% de leads", "Order bump aumenta ticket médio"] },
      { icon: Repeat,      label: "Recorrência e upsell", description: "Oferte upgrades e planos anuais pós-compra.",         tips: ["Oferta de aniversário no mês 3", "LTV / CAC > 3 é saudável"] },
      { icon: RefreshCcw,  label: "Redução de churn",     description: "Onboarding ativo + comunidade + suporte rápido.",     tips: ["Contacte inativos no dia 14", "NPS mensal detecta risco cedo"] },
    ],
  },
  pos: {
    title: "Roadmap Pós-Graduação",
    subtitle: "Ciclo de captação para cursos de longa duração",
    color: "#6366f1",
    steps: [
      { icon: GraduationCap, label: "Posicionamento",     description: "Defina o diferencial do curso vs. concorrência.",    tips: ["Foque em resultado profissional claro", "Ex.: 'Aprovado em concurso em 6 meses'"] },
      { icon: Users,         label: "Público-alvo",        description: "Segmente por cargo, área e nível de experiência.",   tips: ["LinkedIn Ads para decisão B2B", "Meta Ads para profissionais 25–45"] },
      { icon: Globe,         label: "Funil longo",          description: "Blog, webinário gratuito ou masterclass de entrada.", tips: ["Webinário converte 3× mais que LP fria", "Grave uma vez, veicula sempre"] },
      { icon: Mail,          label: "Nutrição extended",   description: "Sequência de 15–21 dias para leads frios.",           tips: ["Depoimentos de ex-alunos funcionam bem", "Case + ROI do certificado"] },
      { icon: Megaphone,     label: "Janela de matrícula", description: "Campanha de urgência com desconto + bônus.",          tips: ["Abra 2× por ano (semestral)", "Remarketing 7 dias antes do fechamento"] },
      { icon: CheckCircle2,  label: "Retenção e NPS",      description: "Suporte, comunidade e indicações de alunos.",         tips: ["Aluno satisfeito indica 2,3 pessoas", "Oferte desconto de renovação no mês 10"] },
    ],
  },
  livros: {
    title: "Roadmap de Livros",
    subtitle: "Estratégia de vendas e posicionamento de autor",
    color: "#0891b2",
    steps: [
      { icon: BookOpen,    label: "Posicionamento de autor", description: "Bio forte + foto profissional + redes unificadas.", tips: ["Instagram + LinkedIn são os principais", "Depoimentos de leitores como prova social"] },
      { icon: Globe,       label: "Landing page do livro",   description: "LP com sinopse, índice e trecho gratuito.",          tips: ["Ofereça cap. 1 grátis em troca de e-mail", "Nota média visível (Amazon/Goodreads)"] },
      { icon: Megaphone,   label: "Campanha de lançamento",  description: "Vídeo do autor explicando o problema que o livro resolve.", tips: ["Meta Ads: interesse em livros do nicho", "CTR alvo ≥ 0.8%"] },
      { icon: ShoppingCart, label: "Funil de conversão",    description: "Remarketing de leitores do trecho + e-mail.",         tips: ["Oferta de kit ou assinatura é upsell natural", "Preço âncora: e-book vs. físico"] },
      { icon: Users,       label: "Prova social",            description: "Colete reviews e depoimentos nos primeiros 30 dias.", tips: ["Envie exemplar para influencers do nicho", "Amazon reviews aumentam conversão orgânica"] },
      { icon: RefreshCcw,  label: "Perpetuação",             description: "Manter anúncios evergreen após lançamento.",          tips: ["ROI tende a melhorar após mês 2", "Lance edição digital para novo público"] },
    ],
  },
  ebooks: {
    title: "Roadmap de E-book",
    subtitle: "Venda direta e captura de leads com e-book",
    color: "#10b981",
    steps: [
      { icon: BookOpen,    label: "Produto irresistível",    description: "E-book que resolve uma dor específica e urgente.",   tips: ["Título com número + resultado: '7 passos para...'", "Design profissional aumenta percepção de valor"] },
      { icon: Globe,       label: "Landing page simples",    description: "LP focada em 1 CTA, sem distrações.",                tips: ["Headline: dor → solução → prova", "Abaixo da dobra: depoimentos + FAQ"] },
      { icon: Megaphone,   label: "Tráfego de entrada",      description: "Meta Ads com criativo do problema resolvido.",        tips: ["Imagem do produto física aumenta CTR", "Teste 3 hooks diferentes na primeira semana"] },
      { icon: Mail,        label: "Sequência pós-compra",    description: "E-mail de entrega + upsell de produto maior.",        tips: ["Upsell oferecido em 24h pós-compra converte mais", "Ofereça suporte ou comunidade como bônus"] },
      { icon: ShoppingCart, label: "Escala",                "description": "Aumente budget nas versões de criativo que convertem.", tips: ["Regra: escale 20% a cada 3 dias", "Duplique conjunto de anúncio, não edite"] },
      { icon: RefreshCcw,  label: "Otimização contínua",    description: "A/B de headline e CTA a cada 30 dias.",               tips: ["Troque criativo ao ver CPL subir > 20%", "Revise LP a cada trimestre"] },
    ],
  },
};

function CategoryRoadmap({ category }: { category: ProductCategory }) {
  const [open, setOpen] = useState(true);
  const rm = ROADMAPS[category];
  if (!rm) return null;

  return (
    <article className="rounded-xl border shadow-sm" style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: rm.color }} />
          <p className="text-xs font-bold" style={{ color: "var(--dm-text-primary)" }}>{rm.title}</p>
          <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>— {rm.subtitle}</p>
        </div>
        <ChevronRight
          size={14}
          style={{ color: "var(--dm-text-tertiary)", transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
        />
      </button>

      {open && (
        <div className="px-4 pb-4">
          <div className="relative ml-4 border-l-2 pl-6 space-y-5" style={{ borderColor: "var(--dm-border-subtle)" }}>
            {rm.steps.map((step, i) => (
              <div key={i} className="relative">
                {/* Circle on the timeline */}
                <div
                  className="absolute -left-[29px] flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-white text-[10px] font-black"
                  style={{ backgroundColor: rm.color, boxShadow: "0 0 0 3px var(--dm-bg-surface)" }}
                >
                  {i + 1}
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <step.icon size={13} style={{ color: rm.color, flexShrink: 0 }} />
                    <p className="text-xs font-semibold" style={{ color: "var(--dm-text-primary)" }}>{step.label}</p>
                  </div>
                  <p className="text-[11px] leading-relaxed" style={{ color: "var(--dm-text-secondary)" }}>{step.description}</p>
                  {step.tips && step.tips.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {step.tips.map((tip, ti) => (
                        <li key={ti} className="flex items-start gap-1.5 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
                          <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full" style={{ backgroundColor: rm.color }} />
                          {tip}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

// ─── TAB: Overview ────────────────────────────────────────────────────────────

function TabOverview({ campaigns, selectedCategory }: { campaigns: AggregatedCampaign[]; selectedCategory?: ProductCategory | null }) {
  const top10 = useMemo(
    () => [...campaigns].sort((a, b) => b.investment - a.investment).slice(0, 10),
    [campaigns],
  );
  const maxInv = Math.max(...top10.map((c) => c.investment), 1);

  const totalInvest  = campaigns.reduce((s, c) => s + c.investment, 0);
  const totalRevenue = campaigns.reduce((s, c) => s + c.revenue, 0);
  const healthyCount = campaigns.filter((c) => c.roas >= 2).length;
  const overallRoas  = totalInvest > 0 ? totalRevenue / totalInvest : 0;

  return (
    <div className="space-y-5 pt-4">
      {/* ── Bento summary tiles ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Investimento Total", value: formatCurrency(totalInvest), color: "#60A5FA", bg: "rgba(96,165,250,0.10)" },
          { label: "Receita Total",      value: formatCurrency(totalRevenue), color: "#10B981", bg: "rgba(16,185,129,0.10)" },
          { label: "ROAS Geral",         value: `${overallRoas.toFixed(2)}x`, color: overallRoas >= 2 ? "#10B981" : overallRoas >= 1 ? "#F59E0B" : "#EF4444", bg: overallRoas >= 2 ? "rgba(16,185,129,0.10)" : overallRoas >= 1 ? "rgba(245,158,11,0.10)" : "rgba(239,68,68,0.10)" },
          { label: "Campanhas Saudáveis", value: `${healthyCount}/${campaigns.length}`, color: "#A78BFA", bg: "rgba(167,139,250,0.10)" },
        ].map(({ label, value, color, bg }) => (
          <div
            key={label}
            className="rounded-[16px] border p-4"
            style={{ background: bg, borderColor: `${color}30` }}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color }}>{label}</p>
            <p className="text-lg font-black leading-tight" style={{ color: "var(--dm-text-primary)" }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Category roadmap */}
      {selectedCategory && <CategoryRoadmap category={selectedCategory} />}

      {/* Top 10 */}
      <div>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>Top 10 por Investimento</p>
        <div className="space-y-2">
          {top10.map((c, idx) => {
            const roasColor = c.roas >= 3 ? "#10B981" : c.roas >= 1.5 ? "#60A5FA" : c.roas >= 1 ? "#F59E0B" : "#EF4444";
            const barColor  = c.roas >= 3 ? "#10B981" : c.roas >= 1.5 ? "#313491" : c.roas >= 1 ? "#F59E0B" : "#EF4444";
            const pct       = (c.investment / maxInv) * 100;
            return (
              <div
                key={c.campaignName}
                className="rounded-[14px] border p-3 transition hover:border-opacity-60"
                style={{
                  backgroundColor: "var(--dm-bg-surface)",
                  borderColor: "var(--dm-border-default)",
                  borderLeft: `3px solid ${barColor}`,
                }}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-md text-[10px] font-black"
                      style={{ background: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)" }}
                    >
                      {idx + 1}
                    </span>
                    <p className="min-w-0 truncate text-xs font-semibold" style={{ color: "var(--dm-text-primary)" }} title={c.campaignName}>
                      {c.campaignName}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <span className="text-xs" style={{ color: "var(--dm-text-secondary)" }}>{formatCurrency(c.investment)}</span>
                    <span
                      className="rounded-lg px-2 py-0.5 text-xs font-black"
                      style={{ background: `${roasColor}18`, color: roasColor }}
                    >
                      {c.roas.toFixed(2)}x
                    </span>
                  </div>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── TAB: Critical ────────────────────────────────────────────────────────────

function TabCritical({ campaigns }: { campaigns: AggregatedCampaign[] }) {
  const [page, setPage] = useState(1);
  const withIssues = useMemo(() =>
    campaigns
      .map((c) => ({ ...c, issues: getIssues(c) }))
      .filter((c) => c.issues.length > 0)
      .sort((a, b) => {
        const ac = a.issues.filter((i) => i.severity === "critical").length;
        const bc = b.issues.filter((i) => i.severity === "critical").length;
        return bc - ac || b.investment - a.investment;
      }),
    [campaigns],
  );

  const visible = withIssues.slice((page - 1) * PER_PAGE_CRITICAL, page * PER_PAGE_CRITICAL);

  if (withIssues.length === 0) {
    return (
      <div
        className="flex items-center gap-3 rounded-2xl border p-6 mt-4"
        style={{ background: "rgba(16,185,129,0.08)", borderColor: "rgba(16,185,129,0.3)" }}
      >
        <CheckCircle2 size={20} style={{ color: "#10B981", flexShrink: 0 }} />
        <p className="text-sm font-medium" style={{ color: "#10B981" }}>
          Nenhum ponto crítico identificado. Todas as campanhas estão dentro dos parâmetros saudáveis.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-4">
      {visible.map((c) => {
        const hasCritical = c.issues.some((i) => i.severity === "critical");
        const accent = hasCritical ? "#EF4444" : "#F59E0B";
        return (
          <article
            key={c.campaignName}
            className="rounded-2xl border p-4"
            style={{
              backgroundColor: "var(--dm-bg-surface)",
              borderColor: `${accent}35`,
              borderLeft: `4px solid ${accent}`,
            }}
          >
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {hasCritical
                  ? <XCircle size={15} style={{ color: "#EF4444", flexShrink: 0 }} />
                  : <AlertTriangle size={15} style={{ color: "#F59E0B", flexShrink: 0 }} />}
                <p className="text-xs font-bold truncate" style={{ color: "var(--dm-text-primary)" }}>
                  {c.campaignName}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "Invest.", value: formatCurrency(c.investment) },
                  { label: "Receita", value: formatCurrency(c.revenue) },
                  { label: "ROAS",    value: `${c.roas.toFixed(2)}x` },
                  { label: "CTR",     value: formatPercent(c.ctr) },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="rounded-lg px-2.5 py-1.5 text-center"
                    style={{ background: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-subtle)" }}
                  >
                    <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>{label}</p>
                    <p className="text-xs font-bold" style={{ color: "var(--dm-text-primary)" }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
            {/* Issues */}
            <ul className="mt-3 space-y-1.5">
              {c.issues.map((issue, i) => (
                <li key={i} className="flex items-start gap-2">
                  {issue.severity === "critical"
                    ? <XCircle size={12} className="mt-0.5 flex-shrink-0" style={{ color: "#EF4444" }} />
                    : <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" style={{ color: "#F59E0B" }} />}
                  <span className="text-xs" style={{ color: issue.severity === "critical" ? "#EF4444" : "#F59E0B" }}>
                    {issue.label}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        );
      })}
      <Paginator page={page} total={withIssues.length} perPage={PER_PAGE_CRITICAL} onChange={setPage} />
    </div>
  );
}

// ─── TAB: Positive ────────────────────────────────────────────────────────────

function TopList({ title, subtitle, icon: Icon, items, metricLabel, metricValue, color, bg }: {
  title: string; subtitle: string; icon: React.ElementType;
  items: AggregatedCampaign[];
  metricLabel: string; metricValue: (c: AggregatedCampaign) => string;
  color: string; bg: string;
}) {
  if (items.length === 0) return null;
  return (
    <article
      className="rounded-xl border p-4 shadow-sm"
      style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}
    >
      <div className="mb-4 flex items-center gap-2">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-xl"
          style={{ backgroundColor: "rgba(49,52,145,0.12)", color: "var(--dm-brand-500)" }}
        >
          <Icon size={15} />
        </span>
        <div>
          <p className="text-xs font-bold" style={{ color: "var(--dm-text-primary)" }}>{title}</p>
          <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>{subtitle}</p>
        </div>
      </div>
      <ol className="space-y-2">
        {items.map((c, i) => (
          <li
            key={c.campaignName}
            className="flex items-center gap-2.5 rounded-xl p-2.5"
            style={{ background: i === 0 ? "rgba(49,52,145,0.07)" : "var(--dm-bg-elevated)" }}
          >
            <span
              className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-black"
              style={
                i === 0
                  ? { backgroundColor: "var(--dm-brand-500)", color: "#fff" }
                  : { backgroundColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)" }
              }
            >{i + 1}</span>
            <p className="min-w-0 flex-1 truncate text-xs font-medium" style={{ color: "var(--dm-text-secondary)" }} title={c.campaignName}>
              {c.campaignName}
            </p>
            <span
              className="flex-shrink-0 rounded-lg px-2 py-0.5 text-xs font-black"
              style={{ backgroundColor: "rgba(49,52,145,0.12)", color: "var(--dm-brand-500)" }}
            >
              {metricLabel}: {metricValue(c)}
            </span>
          </li>
        ))}
      </ol>
    </article>
  );
}

function TabPositive({ campaigns, isMetricVisible = () => true }: { campaigns: AggregatedCampaign[]; isMetricVisible?: (id: string) => boolean }) {
  const topRoas = useMemo(() => [...campaigns].filter((c) => c.roas >= 2 && c.investment > 50).sort((a, b) => b.roas - a.roas).slice(0, 5), [campaigns]);
  const topRev  = useMemo(() => [...campaigns].filter((c) => c.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 5), [campaigns]);
  const topCtr  = useMemo(() => [...campaigns].filter((c) => c.ctr >= 1 && c.impressions > 500).sort((a, b) => b.ctr - a.ctr).slice(0, 5), [campaigns]);
  const topConv = useMemo(() => [...campaigns].filter((c) => c.conversionRate >= 2 && c.clicks > 50).sort((a, b) => b.conversionRate - a.conversionRate).slice(0, 5), [campaigns]);

  const lists = [
    isMetricVisible("roas")        && topRoas.length > 0 && <TopList key="roas" title="Melhor ROAS" subtitle="Maior retorno sobre investimento (≥ 2x)" icon={TrendingUp} items={topRoas} metricLabel="ROAS" metricValue={(c) => `${c.roas.toFixed(2)}x`} color="text-emerald-700" bg="bg-emerald-50" />,
    isMetricVisible("revenue")     && topRev.length  > 0 && <TopList key="rev"  title="Maior Receita" subtitle="Campanhas com maior faturamento" icon={Award} items={topRev} metricLabel="Receita" metricValue={(c) => formatCurrency(c.revenue)} color="text-emerald-700" bg="bg-emerald-50" />,
    isMetricVisible("ctr")         && topCtr.length  > 0 && <TopList key="ctr"  title="Melhor CTR" subtitle="Alta taxa de cliques — criativo engaja (≥ 1%)" icon={Zap} items={topCtr} metricLabel="CTR" metricValue={(c) => formatPercent(c.ctr)} color="text-blue-700" bg="bg-blue-50" />,
    isMetricVisible("conversions") && topConv.length > 0 && <TopList key="conv" title="Melhor Conversão" subtitle="Cliques que viram compras (≥ 2%)" icon={Star} items={topConv} metricLabel="Conv." metricValue={(c) => formatPercent(c.conversionRate)} color="text-violet-700" bg="bg-violet-50" />,
  ].filter(Boolean);

  if (lists.length === 0) return (
    <div
      className="mt-4 rounded-2xl border p-8 text-center"
      style={{ background: "var(--dm-bg-elevated)", borderColor: "var(--dm-border-default)" }}
    >
      <p className="text-sm" style={{ color: "var(--dm-text-tertiary)" }}>Nenhum destaque positivo nos filtros atuais. Tente ampliar o período ou ajustar as métricas visíveis.</p>
    </div>
  );

  return <div className="grid gap-3 pt-4 sm:grid-cols-2">{lists}</div>;
}

// ─── TAB: Tasks ──────────────────────────────────────────────────────────────

function TabTasks({ tasks }: { tasks: TaskSuggestion[] }) {
  const [checked, setChecked]     = useState<Set<string>>(new Set());
  const [filterCat, setFilterCat] = useState<Category | "all">("all");
  const [filterPri, setFilterPri] = useState<Priority | "all">("all");
  const [page, setPage]           = useState(1);

  const toggle = (id: string) =>
    setChecked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const filtered = useMemo(() =>
    tasks.filter((t) =>
      !checked.has(t.id) &&
      (filterCat === "all" || t.category === filterCat) &&
      (filterPri === "all" || t.priority === filterPri),
    ), [tasks, checked, filterCat, filterPri]);

  const done    = tasks.filter((t) => checked.has(t.id));
  const visible = filtered.slice((page - 1) * PER_PAGE_TASKS, page * PER_PAGE_TASKS);

  const usedCategories = Array.from(new Set(tasks.map((t) => t.category))) as Category[];

  const handleFilterCat = (c: Category | "all") => { setFilterCat(c); setPage(1); };
  const handleFilterPri = (p: Priority | "all") => { setFilterPri(p); setPage(1); };

  return (
    <div className="space-y-4 pt-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {/* Priority filter */}
        <div className="flex gap-1 rounded-lg p-0.5" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
          {(["all", "alta", "média", "baixa"] as const).map((p) => (
            <button
              key={p}
              onClick={() => handleFilterPri(p)}
              className="flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition"
              style={
                filterPri === p
                  ? { backgroundColor: "var(--dm-bg-surface)", color: "var(--dm-text-primary)", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }
                  : { color: "var(--dm-text-secondary)" }
              }
            >
              {p !== "all" && <span className="h-1.5 w-1.5 rounded-full" style={{ background: PRIORITY_COLOR[p].dot }} />}
              {p === "all" ? "Todas" : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => handleFilterCat("all")}
            className="rounded-lg px-2.5 py-1 text-[11px] font-semibold transition"
            style={
              filterCat === "all"
                ? { backgroundColor: "var(--dm-brand-500)", color: "#fff" }
                : { backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)" }
            }
          >
            Todas
          </button>
          {usedCategories.map((cat) => {
            const m = CATEGORY_META[cat];
            return (
              <button
                key={cat}
                onClick={() => handleFilterCat(cat)}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition"
                style={
                  filterCat === cat
                    ? { backgroundColor: "var(--dm-brand-50)", color: "var(--dm-brand-500)" }
                    : { backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)" }
                }
              >
                <m.icon size={10} />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary bar */}
      <div className="flex items-center justify-between rounded-lg px-3 py-2" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
        <p className="text-xs" style={{ color: "var(--dm-text-secondary)" }}>
          <span className="font-bold" style={{ color: "var(--dm-text-primary)" }}>{filtered.length}</span> tarefas pendentes
          {done.length > 0 && <> · <span className="font-bold" style={{ color: "#10b981" }}>{done.length}</span> concluídas</>}
        </p>
        {done.length > 0 && (
          <button onClick={() => setChecked(new Set())} className="text-[11px] font-semibold" style={{ color: "var(--dm-text-tertiary)" }}>
            Limpar concluídas
          </button>
        )}
      </div>

      {/* Task cards */}
      {visible.length === 0 ? (
        <div
          className="flex items-center gap-3 rounded-2xl border p-5"
          style={{ background: "rgba(16,185,129,0.08)", borderColor: "rgba(16,185,129,0.3)" }}
        >
          <CheckCircle2 size={18} style={{ color: "#10B981", flexShrink: 0 }} />
          <p className="text-sm font-medium" style={{ color: "#10B981" }}>
            {tasks.length === 0
              ? "Nenhuma ação necessária — campanhas saudáveis!"
              : "Nenhuma tarefa para o filtro selecionado."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((task) => {
            const cat = CATEGORY_META[task.category];
            const pc  = PRIORITY_COLOR[task.priority];
            return (
              <div
                key={task.id}
                className="flex items-start gap-3 rounded-2xl border p-4 transition"
                style={{
                  backgroundColor: "var(--dm-bg-surface)",
                  borderColor: "var(--dm-border-default)",
                  borderLeft: `3px solid ${pc.border}`,
                }}
              >
                <button
                  onClick={() => toggle(task.id)}
                  className="mt-0.5 flex-shrink-0 transition hover:opacity-70"
                  style={{ color: pc.border }}
                  title="Marcar como concluída"
                >
                  <Square size={16} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ background: pc.bg, color: pc.text }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: pc.dot }} />
                      {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                    </span>
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{ background: cat.bg, color: cat.color }}
                    >
                      <cat.icon size={9} />
                      {cat.label}
                    </span>
                  </div>
                  <p className="text-xs font-semibold" style={{ color: "var(--dm-text-primary)" }}>{task.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--dm-text-secondary)" }}>{task.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Paginator page={page} total={filtered.length} perPage={PER_PAGE_TASKS} onChange={setPage} />

      {/* Done section */}
      {done.length > 0 && (
        <div className="space-y-1.5 border-t pt-3" style={{ borderColor: "var(--dm-border-default)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>Concluídas</p>
          {done.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-xl border p-3 opacity-60" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
              <button onClick={() => toggle(t.id)} className="flex-shrink-0" style={{ color: "#10b981" }}>
                <CheckSquare size={15} />
              </button>
              <p className="text-xs line-through" style={{ color: "var(--dm-text-secondary)" }}>{t.title}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CampaignAnalysis({ campaigns, selectedCategory, isMetricVisible }: CampaignAnalysisProps) {
  const [subTab, setSubTab] = useState<SubTab>("overview");

  const tasks    = useMemo(() => generateTasks(campaigns), [campaigns]);
  const critical = useMemo(() => campaigns.filter((c) => c.roas < 1 || (c.conversions === 0 && c.investment > 100)), [campaigns]);
  const warnings = useMemo(() => campaigns.filter((c) => c.roas >= 1 && c.roas < 2 && !critical.includes(c)), [campaigns, critical]);
  const positive = useMemo(() => campaigns.filter((c) => c.roas >= 2), [campaigns]);

  const issueCount = useMemo(() =>
    campaigns.map((c) => getIssues(c)).filter((i) => i.length > 0).length,
    [campaigns],
  );
  const tasksPending = tasks.length;
  const score        = calcHealthScore(critical.length, warnings.length, campaigns.length);
  const scoreColor   = score >= 70 ? "text-emerald-600" : score >= 40 ? "text-amber-600" : "text-red-600";
  const scoreLabel   = score >= 70 ? "Saudável" : score >= 40 ? "Atenção" : "Crítico";

  const TABS = [
    { id: "overview" as SubTab, label: "Visão Geral",   icon: BarChart2,     count: undefined },
    { id: "critical" as SubTab, label: "Problemas",     icon: XCircle,       count: issueCount },
    { id: "positive" as SubTab, label: "Destaques",     icon: CheckCircle2,  count: positive.length },
    { id: "tasks"    as SubTab, label: "Plano de Ação", icon: CheckSquare,   count: tasksPending },
  ];

  return (
    <div className="space-y-4">

      {/* ── Health score header ── */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border p-5 shadow-sm" style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
        {/* Ring */}
        <div className="relative flex-shrink-0">
          <HealthRing score={score} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className={`text-lg font-black leading-none ${scoreColor}`}>{score}</p>
            <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>score</p>
          </div>
        </div>

        {/* Label + divider */}
        <div className="flex-shrink-0 border-r pr-4" style={{ borderColor: "var(--dm-border-default)" }}>
          <p className={`text-base font-black ${scoreColor}`}>{scoreLabel}</p>
          <p className="text-xs" style={{ color: "var(--dm-text-tertiary)" }}>{campaigns.length} campanha{campaigns.length !== 1 ? "s" : ""} analisadas</p>
        </div>

        {/* Counters */}
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: critical.length > 0 ? "rgba(239,68,68,0.08)" : "var(--dm-bg-elevated)" }}>
            <XCircle size={15} style={{ color: critical.length > 0 ? "#ef4444" : "var(--dm-text-tertiary)" }} />
            <div>
              <p className="text-sm font-black" style={{ color: "var(--dm-text-primary)" }}>{critical.length}</p>
              <p className="text-[10px]" style={{ color: "var(--dm-text-secondary)" }}>Crítica{critical.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: warnings.length > 0 ? "rgba(245,158,11,0.08)" : "var(--dm-bg-elevated)" }}>
            <AlertTriangle size={15} style={{ color: warnings.length > 0 ? "#f59e0b" : "var(--dm-text-tertiary)" }} />
            <div>
              <p className="text-sm font-black" style={{ color: "var(--dm-text-primary)" }}>{warnings.length}</p>
              <p className="text-[10px]" style={{ color: "var(--dm-text-secondary)" }}>Alerta{warnings.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: positive.length > 0 ? "rgba(16,185,129,0.08)" : "var(--dm-bg-elevated)" }}>
            <CheckCircle2 size={15} style={{ color: positive.length > 0 ? "#10b981" : "var(--dm-text-tertiary)" }} />
            <div>
              <p className="text-sm font-black" style={{ color: "var(--dm-text-primary)" }}>{positive.length}</p>
              <p className="text-[10px]" style={{ color: "var(--dm-text-secondary)" }}>Saudável{positive.length !== 1 ? "is" : ""}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
            <CheckSquare size={15} style={{ color: tasksPending > 0 ? "var(--dm-brand-500)" : "var(--dm-text-tertiary)" }} />
            <div>
              <p className="text-sm font-black" style={{ color: "var(--dm-text-primary)" }}>{tasksPending}</p>
              <p className="text-[10px]" style={{ color: "var(--dm-text-secondary)" }}>Ação{tasksPending !== 1 ? "ões" : ""}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Sub-tab card ── */}
      <div className="rounded-xl border shadow-sm" style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
        <div className="px-5 pt-4">
          <SubTabBar active={subTab} onChange={setSubTab} tabs={TABS} />
        </div>
        <div className="px-5 pb-5">
          {subTab === "overview"  && <TabOverview  campaigns={campaigns} selectedCategory={selectedCategory} />}
          {subTab === "critical"  && <TabCritical  campaigns={campaigns} />}
          {subTab === "positive"  && <TabPositive  campaigns={campaigns} isMetricVisible={isMetricVisible} />}
          {subTab === "tasks"     && <TabTasks     tasks={tasks} />}
        </div>
      </div>

    </div>
  );
}
