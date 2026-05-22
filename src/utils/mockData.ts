import { CampaignData } from "@/types/campaign";
import { HistoricalRow, HistoricalMeta } from "@/types/historical";
import { ProductData } from "@/types/product";
import { AdvertiserProfile } from "@/hooks/useAdvertiserStore";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function row(
  id: string, date: string, name: string,
  investment: number, clicks: number, impressions: number,
  conversions: number, revenue: number, leads = 0,
): CampaignData {
  const ctr            = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpc            = clicks > 0      ? investment / clicks          : 0;
  const cpa            = conversions > 0 ? investment / conversions     : 0;
  const roas           = investment > 0  ? revenue / investment         : 0;
  const conversionRate = clicks > 0      ? (conversions / clicks) * 100 : 0;
  return { id, date, campaignName: name, investment, clicks, impressions, conversions, leads, revenue, ctr, cpc, cpa, roas, conversionRate };
}

let _idx = 1;
function uid(prefix: string) { return `${prefix}${String(_idx++).padStart(4, "0")}`; }

function dateStr(daysAgo: number): string {
  const d = new Date("2026-05-21");
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// Slight noise to make values feel organic
function jitter(base: number, pct = 0.15): number {
  return Math.round(base * (1 + (Math.random() * 2 - 1) * pct));
}

// ─── 30-day campaign rows — all groups ────────────────────────────────────────

const DAYS = 30;

export const MOCK_CAMPAIGNS: CampaignData[] = Array.from({ length: DAYS }, (_, i) => {
  const dt = dateStr(i);
  // Base investment pattern: higher mid-week, lower weekends
  const dow = new Date(dt).getDay(); // 0=sun, 6=sat
  const weekendFactor = (dow === 0 || dow === 6) ? 0.65 : 1;
  const baseInvest = jitter(200 * weekendFactor);

  return [
    // ── Pós Grad — Biomecânica ─────────────────────────────────────────────
    row(uid("c"), dt, "[PTA] Pós Grad. Biomecânica BM | ABO T10",
      jitter(baseInvest * 0.32), jitter(420 * weekendFactor), jitter(28000 * weekendFactor),
      jitter(14), jitter(14 * 1800), jitter(8)),

    // ── Pós Grad — Musculação MPA ──────────────────────────────────────────
    row(uid("c"), dt, "[PTA] Musculação MPA | CBO T12",
      jitter(baseInvest * 0.22), jitter(310 * weekendFactor), jitter(21000 * weekendFactor),
      jitter(9),  jitter(9  * 1800), jitter(5)),

    // ── Pós Grad — Fisiologia FE ───────────────────────────────────────────
    row(uid("c"), dt, "[PTA] Fisiologia do Exercício FE | ABO T6",
      jitter(baseInvest * 0.18), jitter(240 * weekendFactor), jitter(17000 * weekendFactor),
      jitter(7),  jitter(7  * 1800), jitter(4)),

    // ── Pós Grad — Bodybuilding BB ─────────────────────────────────────────
    ...(dow !== 0 ? [row(uid("c"), dt, "[PTA] Pós Grad. Bodybuilding BB | ABO T5",
      jitter(baseInvest * 0.20), jitter(280 * weekendFactor), jitter(19000 * weekendFactor),
      jitter(10), jitter(10 * 1800), jitter(6))] : []),

    // ── Pós Grad — Feminino SM ─────────────────────────────────────────────
    row(uid("c"), dt, "[PTA] Pós Grad. Feminino SM | CBO T3",
      jitter(baseInvest * 0.15), jitter(210 * weekendFactor), jitter(15000 * weekendFactor),
      jitter(6),  jitter(6  * 1800), jitter(3)),

    // ── Pós Grad — Funcional TF ────────────────────────────────────────────
    row(uid("c"), dt, "[PTA] Trein. Funcional TF | ABO T4",
      jitter(baseInvest * 0.14), jitter(190 * weekendFactor), jitter(14000 * weekendFactor),
      jitter(5),  jitter(5  * 1800), jitter(3)),

    // ── Livros ─────────────────────────────────────────────────────────────
    row(uid("c"), dt, "[PTA] Livro Biomecânica Clínica | Conversão",
      jitter(baseInvest * 0.08), jitter(180 * weekendFactor), jitter(12000 * weekendFactor),
      jitter(12), jitter(12 * 197),  jitter(18)),

    row(uid("c"), dt, "[PTA] Livro Marketing Fitness | Conversão",
      jitter(baseInvest * 0.06), jitter(130 * weekendFactor), jitter(9500  * weekendFactor),
      jitter(9),  jitter(9  * 197),  jitter(14)),

    // ── Ebooks ─────────────────────────────────────────────────────────────
    row(uid("c"), dt, "[PTA] Ebook Bio Joelho | Tráfego",
      jitter(baseInvest * 0.05), jitter(250 * weekendFactor), jitter(16000 * weekendFactor),
      jitter(22), jitter(22 * 97),   jitter(35)),

    row(uid("c"), dt, "[PTA] Ebook Bio Coluna | Tráfego",
      jitter(baseInvest * 0.04), jitter(200 * weekendFactor), jitter(13000 * weekendFactor),
      jitter(18), jitter(18 * 97),   jitter(28)),

    // ── Perpétuo / Notável Play ────────────────────────────────────────────
    row(uid("c"), dt, "[PTA] Notável Play | Perpétuo EAD",
      jitter(baseInvest * 0.10), jitter(160 * weekendFactor), jitter(11000 * weekendFactor),
      jitter(8),  jitter(8  * 497),  jitter(20)),

    // ── Eventos / BS ───────────────────────────────────────────────────────
    row(uid("c"), dt, "[BS] Leads | ABO T10 Biomecânica",
      jitter(baseInvest * 0.12), jitter(95  * weekendFactor), jitter(8500  * weekendFactor),
      jitter(0),  0, jitter(45)),

    // ── Tráfego / retargeting ──────────────────────────────────────────────
    row(uid("c"), dt, "[Seguidores] Tráfego CBO Awareness",
      jitter(baseInvest * 0.18), jitter(560 * weekendFactor), jitter(42000 * weekendFactor),
      0, 0),

    row(uid("c"), dt, "[PTA] Retargeting HOT | Conversão",
      jitter(baseInvest * 0.16), jitter(95  * weekendFactor), jitter(8000  * weekendFactor),
      jitter(11), jitter(11 * 1800), jitter(4)),
  ];
}).flat();

export const MOCK_SOURCE_LABEL = "Meta Ads · Demo (Dados Fictícios)";

// ─── Historical mock data ──────────────────────────────────────────────────────

function mk(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  const labels: Record<number, string> = { 1:"Jan", 2:"Fev", 3:"Mar", 4:"Abr", 5:"Mai", 6:"Jun", 7:"Jul", 8:"Ago", 9:"Set", 10:"Out", 11:"Nov", 12:"Dez" };
  return { month: String(m).padStart(2, "0"), year: y, monthKey, monthLabel: `${labels[m]}/${y}` };
}

export const MOCK_HISTORICAL_ROWS: HistoricalRow[] = [
  // ── Lançamentos — Biomecânica ─────────────────────────────────────────────
  {
    id: "h001", kind: "lancamento", product: "Pós-Grad. Biomecânica Aplicada", turma: "T8", tag: "Biomecânica",
    ...mk("2026-04"), investment: 18400, revenue: 152000,
    cpm: 28.50, reach: 645000, ctr: 2.8, clicks: 18060, pageViews: 9940, pageViewRate: 55,
    preCheckouts: 1492, preCheckoutRate: 15, sales: 62, salesRate: 4.16, cac: 296.77, roas: 8.26,
    imersao: "Imersão Biomecânica Funcional", ingressosVendidos: 120, faturamentoIngresso: 72000,
    vendasPos: 62, faturamentoPos: 80000,
  },
  {
    id: "h002", kind: "lancamento", product: "Pós-Grad. Biomecânica Aplicada", turma: "T7", tag: "Biomecânica",
    ...mk("2026-01"), investment: 16200, revenue: 136000,
    cpm: 27.10, reach: 597783, ctr: 2.6, clicks: 15542, pageViews: 8548, pageViewRate: 55,
    preCheckouts: 1282, preCheckoutRate: 15, sales: 54, salesRate: 4.21, cac: 300.00, roas: 8.40,
    imersao: "Imersão Biomecânica Clínica", ingressosVendidos: 104, faturamentoIngresso: 62400,
    vendasPos: 54, faturamentoPos: 73600,
  },
  {
    id: "h003", kind: "lancamento", product: "Pós-Grad. Biomecânica Aplicada", turma: "T6", tag: "Biomecânica",
    ...mk("2025-10"), investment: 14800, revenue: 118000,
    cpm: 25.60, reach: 578125, ctr: 2.5, clicks: 14453, pageViews: 7949, pageViewRate: 55,
    preCheckouts: 1192, preCheckoutRate: 15, sales: 47, salesRate: 3.94, cac: 314.89, roas: 7.97,
    imersao: "Imersão Biomecânica Avançada", ingressosVendidos: 92, faturamentoIngresso: 55200,
    vendasPos: 47, faturamentoPos: 62800,
  },
  // ── Lançamentos — Musculação ──────────────────────────────────────────────
  {
    id: "h013", kind: "lancamento", product: "Pós-Grad. Musculação Avançada MPA", turma: "T12", tag: "Musculação",
    ...mk("2026-03"), investment: 14200, revenue: 113600,
    cpm: 25.40, reach: 559055, ctr: 2.5, clicks: 13977, pageViews: 7687, pageViewRate: 55,
    preCheckouts: 1153, preCheckoutRate: 15, sales: 48, salesRate: 4.10, cac: 295.83, roas: 8.00,
    imersao: "Imersão Musculação Pro", ingressosVendidos: 92, faturamentoIngresso: 55200,
    vendasPos: 48, faturamentoPos: 58400,
  },
  // ── Lançamentos — Fisiologia ──────────────────────────────────────────────
  {
    id: "h014", kind: "lancamento", product: "Pós-Grad. Fisiologia do Exercício FE", turma: "T6", tag: "Fisiologia",
    ...mk("2026-02"), investment: 11800, revenue: 94400,
    cpm: 23.10, reach: 510823, ctr: 2.3, clicks: 11749, pageViews: 6462, pageViewRate: 55,
    preCheckouts: 969, preCheckoutRate: 15, sales: 40, salesRate: 4.11, cac: 295.00, roas: 8.00,
    imersao: "Imersão Fisiologia Aplicada", ingressosVendidos: 78, faturamentoIngresso: 46800,
    vendasPos: 40, faturamentoPos: 47600,
  },
  // ── Lançamentos — Bodybuilding ────────────────────────────────────────────
  {
    id: "h004", kind: "lancamento", product: "Pós-Grad. Bodybuilding Elite", turma: "T5", tag: "Bodybuilding",
    ...mk("2026-03"), investment: 15600, revenue: 124800,
    cpm: 26.80, reach: 582090, ctr: 2.7, clicks: 15716, pageViews: 8644, pageViewRate: 55,
    preCheckouts: 1297, preCheckoutRate: 15, sales: 52, salesRate: 4.00, cac: 300.00, roas: 8.00,
    imersao: "Imersão Bodybuilding Pro", ingressosVendidos: 100, faturamentoIngresso: 60000,
    vendasPos: 52, faturamentoPos: 64800,
  },
  {
    id: "h005", kind: "lancamento", product: "Pós-Grad. Bodybuilding Elite", turma: "T4", tag: "Bodybuilding",
    ...mk("2025-11"), investment: 13200, revenue: 105600,
    cpm: 24.20, reach: 545455, ctr: 2.4, clicks: 13091, pageViews: 7200, pageViewRate: 55,
    preCheckouts: 1080, preCheckoutRate: 15, sales: 44, salesRate: 4.07, cac: 300.00, roas: 8.00,
    imersao: "Imersão BB Avançado", ingressosVendidos: 86, faturamentoIngresso: 51600,
    vendasPos: 44, faturamentoPos: 54000,
  },
  // ── Lançamentos — Treinamento Feminino ────────────────────────────────────
  {
    id: "h006", kind: "lancamento", product: "Pós-Grad. Treinamento Feminino Smart", turma: "T3", tag: "Feminino",
    ...mk("2026-02"), investment: 12800, revenue: 102400,
    cpm: 23.50, reach: 544681, ctr: 2.3, clicks: 12527, pageViews: 6890, pageViewRate: 55,
    preCheckouts: 1034, preCheckoutRate: 15, sales: 42, salesRate: 4.06, cac: 304.76, roas: 8.00,
    imersao: "Imersão Mulher Ativa", ingressosVendidos: 82, faturamentoIngresso: 49200,
    vendasPos: 42, faturamentoPos: 53200,
  },
  // ── Lançamentos — Funcional ───────────────────────────────────────────────
  {
    id: "h015", kind: "lancamento", product: "Pós-Grad. Treinamento Funcional TF", turma: "T4", tag: "Funcional",
    ...mk("2025-12"), investment: 10600, revenue: 84800,
    cpm: 22.30, reach: 475336, ctr: 2.2, clicks: 10457, pageViews: 5751, pageViewRate: 55,
    preCheckouts: 863, preCheckoutRate: 15, sales: 36, salesRate: 4.11, cac: 294.44, roas: 8.00,
    imersao: "Imersão Funcional Avançado", ingressosVendidos: 70, faturamentoIngresso: 42000,
    vendasPos: 36, faturamentoPos: 42800,
  },
  // ── Eventos ──────────────────────────────────────────────────────────────
  {
    id: "h007", kind: "evento", product: "Imersão Biomecânica Funcional", tag: "Biomecânica",
    ...mk("2026-04"), investment: 4200, revenue: 72000,
    cpm: 18.00, reach: 233333, ctr: 3.1, clicks: 7233, pageViews: 3979, pageViewRate: 55,
    preCheckouts: 597, preCheckoutRate: 15, sales: 120, salesRate: 20.10, cac: 35.00, roas: 17.14,
    signups: 890, tickets: 120, conversionSignupToTicket: 13.5, ticketAvg: 600,
    lotes: [
      { label: "Lote 1", tickets: 50, price: 497 },
      { label: "Lote 2", tickets: 40, price: 597 },
      { label: "Lote 3", tickets: 30, price: 697 },
    ],
  },
  {
    id: "h008", kind: "evento", product: "Imersão Bodybuilding Pro", tag: "Bodybuilding",
    ...mk("2026-03"), investment: 3800, revenue: 60000,
    cpm: 17.50, reach: 217143, ctr: 2.9, clicks: 6297, pageViews: 3463, pageViewRate: 55,
    preCheckouts: 520, preCheckoutRate: 15, sales: 100, salesRate: 19.23, cac: 38.00, roas: 15.79,
    signups: 760, tickets: 100, conversionSignupToTicket: 13.2, ticketAvg: 600,
    lotes: [
      { label: "Lote 1", tickets: 40, price: 497 },
      { label: "Lote 2", tickets: 35, price: 597 },
      { label: "Lote 3", tickets: 25, price: 697 },
    ],
  },
  {
    id: "h016", kind: "evento", product: "Imersão Musculação Pro", tag: "Musculação",
    ...mk("2026-03"), investment: 3400, revenue: 54000,
    cpm: 17.00, reach: 200000, ctr: 2.8, clicks: 5600, pageViews: 3080, pageViewRate: 55,
    preCheckouts: 462, preCheckoutRate: 15, sales: 90, salesRate: 18.75, cac: 37.78, roas: 15.88,
    signups: 680, tickets: 90, conversionSignupToTicket: 13.2, ticketAvg: 600,
    lotes: [
      { label: "Lote 1", tickets: 38, price: 497 },
      { label: "Lote 2", tickets: 32, price: 597 },
      { label: "Lote 3", tickets: 20, price: 697 },
    ],
  },
  // ── Perpétuo ─────────────────────────────────────────────────────────────
  {
    id: "h009", kind: "perpetuo", product: "Plataforma EAD Biomecânica", tag: "Biomecânica",
    ...mk("2026-05"), investment: 3200, revenue: 28800,
    cpm: 19.20, reach: 166667, ctr: 2.1, clicks: 3500, pageViews: 1925, pageViewRate: 55,
    preCheckouts: 289, preCheckoutRate: 15, sales: 32, salesRate: 11.07, cac: 100.00, roas: 9.00,
    leads: 890, newSubscribers: 32, churn: 3, mrr: 28800, ltv: 2400, paybackMonths: 0.3,
  },
  {
    id: "h010", kind: "perpetuo", product: "Plataforma EAD Biomecânica", tag: "Biomecânica",
    ...mk("2026-04"), investment: 2900, revenue: 26100,
    cpm: 18.80, reach: 154255, ctr: 2.0, clicks: 3085, pageViews: 1697, pageViewRate: 55,
    preCheckouts: 255, preCheckoutRate: 15, sales: 29, salesRate: 11.24, cac: 100.00, roas: 9.00,
    leads: 812, newSubscribers: 29, churn: 2, mrr: 26100, ltv: 2400, paybackMonths: 0.3,
  },
  // ── Instagram ────────────────────────────────────────────────────────────
  {
    id: "h011", kind: "instagram", product: "Perfil PTA Experts", tag: "Geral",
    ...mk("2026-05"), investment: 0, revenue: 0,
    cpm: 0, reach: 0, ctr: 0, clicks: 0, pageViews: 0, pageViewRate: 0,
    preCheckouts: 0, preCheckoutRate: 0, sales: 0, salesRate: 0, cac: 0, roas: 0,
    organicReach: 128400, accountsReached: 128400, accountsEngaged: 19260,
    newFollowers: 1840, totalFollowers: 48200, saves: 3640, shares: 2180, comments: 892,
    likes: 14720, engagementRate: 15.0, topContents: "Reel biomecânica joelho, Carrossel Bodybuilding, Reel Feminino",
  },
  {
    id: "h012", kind: "instagram", product: "Perfil PTA Experts", tag: "Geral",
    ...mk("2026-04"), investment: 0, revenue: 0,
    cpm: 0, reach: 0, ctr: 0, clicks: 0, pageViews: 0, pageViewRate: 0,
    preCheckouts: 0, preCheckoutRate: 0, sales: 0, salesRate: 0, cac: 0, roas: 0,
    organicReach: 112600, accountsReached: 112600, accountsEngaged: 16890,
    newFollowers: 1620, totalFollowers: 46360, saves: 3120, shares: 1940, comments: 740,
    likes: 12480, engagementRate: 14.5, topContents: "Reel joelho, Carrossel postura, Reel glúteo",
  },
];

export const MOCK_HISTORICAL_METAS: HistoricalMeta[] = [
  { id: "m001", product: "Pós-Grad. Biomecânica Aplicada",       kind: "lancamento", investment: 18000, cpm: 27.00, ctr: 2.7, pageViewRate: 55, preCheckoutRate: 15, salesTarget: 60, cac: 300.00 },
  { id: "m002", product: "Pós-Grad. Bodybuilding Elite",          kind: "lancamento", investment: 15000, cpm: 26.00, ctr: 2.6, pageViewRate: 55, preCheckoutRate: 15, salesTarget: 50, cac: 300.00 },
  { id: "m003", product: "Pós-Grad. Treinamento Feminino Smart",  kind: "lancamento", investment: 13000, cpm: 24.00, ctr: 2.4, pageViewRate: 55, preCheckoutRate: 15, salesTarget: 42, cac: 310.00 },
  { id: "m004", product: "Imersão Biomecânica Funcional",          kind: "evento",     investment: 4000,  cpm: 18.00, ctr: 3.0, pageViewRate: 55, preCheckoutRate: 15, salesTarget: 120, cac: 35.00 },
  { id: "m005", product: "Plataforma EAD Biomecânica",             kind: "perpetuo",   investment: 3000,  cpm: 19.00, ctr: 2.0, pageViewRate: 55, preCheckoutRate: 15, salesTarget: 30, cac: 100.00 },
  { id: "m006", product: "Pós-Grad. Musculação Avançada MPA",      kind: "lancamento", investment: 14000, cpm: 25.00, ctr: 2.5, pageViewRate: 55, preCheckoutRate: 15, salesTarget: 48, cac: 295.00 },
  { id: "m007", product: "Pós-Grad. Fisiologia do Exercício FE",   kind: "lancamento", investment: 12000, cpm: 23.00, ctr: 2.3, pageViewRate: 55, preCheckoutRate: 15, salesTarget: 40, cac: 300.00 },
];

// ─── Products mock data ────────────────────────────────────────────────────────

const NOW = "2026-05-21T00:00:00.000Z";

export const MOCK_PRODUCTS: ProductData[] = [
  // ── Pós-Grad. Biomecânica ─────────────────────────────────────────────────
  {
    id: "p001", type: "pos", courseGroup: "biomecanica", turmaVinculada: "T8",
    attachments: [], createdAt: NOW, updatedAt: NOW,
    nome: "Pós-Grad. Biomecânica Aplicada",
    expert: "Dr. Rafael Menezes",
    promessa: "Forme o raciocínio clínico em biomecânica que separa o fisioterapeuta mediano do especialista requisitado.",
    subPromessas: [
      { id: "sp1", text: "Domine análise de movimento funcional em 8 semanas" },
      { id: "sp2", text: "Construa laudos biomecânicos com respaldo científico" },
      { id: "sp3", text: "Aplique imediatamente no seu consultório ou academia" },
    ],
    coProdutores: "Instituto PTA Experts", coordenador: "Ana Carvalho",
    debateProduto: "Fórum semanal com Dr. Rafael + assistentes",
    profSlides: "Marcelo Santos", headMarketing: "Lucas Figueiredo",
    liderLancamentos: "Beatriz Matos", designer: "Camila Torres",
    editorVideo: "Diego Alves", socialMedia: "Fernanda Lima",
    gestorTrafego: "Rodrigo Pinto", webDesigner: "Juliana Costa",
    palavrasChave: ["biomecânica", "análise de movimento", "fisioterapia esportiva", "coluna", "joelho", "postura"],
    descricaoAvatar: "Fisioterapeuta ou profissional de EF com 2-5 anos de experiência, quer se especializar para cobrar mais.",
    oQueVaiAprender: [
      "Análise cinemática e cinética do movimento humano",
      "Avaliação postural e funcional com laudos",
      "Biomecânica da coluna, joelho, quadril e ombro",
      "Prescrição baseada em evidências biomecânicas",
    ],
    temaAulaInaugural: "Os 3 erros biomecânicos que todo profissional comete sem perceber",
    temaImersao: "",
    valorBase: "1.980,00",
    lotes: [
      { id: "l1", label: "Lote 1", valor: "1.497,00", promo: "Early bird — 48h" },
      { id: "l2", label: "Lote 2", valor: "1.797,00", promo: "1ª semana" },
      { id: "l3", label: "Lote 3 (Padrão)", valor: "1.980,00", promo: "" },
    ],
    entregaveis: [
      { id: "e1", titulo: "Módulos do Curso", itens: [
        { id: "i1", text: "8 módulos + 80 aulas em vídeo HD" },
        { id: "i2", text: "Apostilas e PDFs científicos por módulo" },
        { id: "i3", text: "Acesso vitalício + atualizações" },
      ]},
      { id: "e2", titulo: "Comunidade & Mentoria", itens: [
        { id: "i4", text: "Grupo exclusivo no Telegram" },
        { id: "i5", text: "2 mentorias em grupo por mês" },
        { id: "i6", text: "Certificado de especialização (360h)" },
      ]},
    ],
    bonus: [
      "Bônus 1: Biblioteca de casos clínicos (+ 200 casos)",
      "Bônus 2: Planilha de laudo biomecânico editável",
      "Bônus 3: Masterclass 'Precificação para especialistas'",
    ],
    paraQuemE: "Fisioterapeutas e profissionais de Educação Física que querem dominar biomecânica clínica.",
    sofrimentoPersona: [
      { id: "s1", titulo: "Iniciante na especialidade", pontos: "Insegurança ao atender casos complexos; perde pacientes para especialistas" },
      { id: "s2", titulo: "Experiente querendo crescer", pontos: "Teto de ganho limitado; quer construir autoridade digital" },
    ],
    doresESolucoes: [
      { id: "d1", dor: "Insegurança para atender casos complexos", solucao: "Protocolo passo-a-passo com 200+ casos clínicos reais" },
      { id: "d2", dor: "Cobrando pouco por não ter especialização", solucao: "Certificado 360h + comunidade para construir autoridade" },
    ],
    receitaTecnica: "Método PTA Biomecânica: Avaliar → Planejar → Intervir → Documentar.",
    linksVenda: [{ id: "lv1", turma: "T8", valor: "1.980,00", link: "https://pay.hotmart.com/bio-t8-demo" }],
    paginasCaptura: [{ id: "pc1", label: "Pré-Especialização BM", url: "https://ptaexperts.com.br/pre-biomecanica-demo" }],
    paginasVenda:   [{ id: "pv1", label: "Principal T8", url: "https://ptaexperts.com.br/biomecanica-t8-demo" }],
  },

  // ── Pós-Grad. Musculação MPA ──────────────────────────────────────────────
  {
    id: "p004", type: "pos", courseGroup: "musculacao", turmaVinculada: "T12",
    attachments: [], createdAt: NOW, updatedAt: NOW,
    nome: "Pós-Grad. Musculação Avançada MPA",
    expert: "Prof. Renato Borges, CREF 98765",
    promessa: "Torne-se o personal trainer de referência em hipertrofia e musculação na sua região.",
    subPromessas: [
      { id: "sp1", text: "Domine periodização científica para hipertrofia" },
      { id: "sp2", text: "Prescreva treinos individualizados com resultados comprovados" },
      { id: "sp3", text: "Atraia e retenha alunos dispostos a pagar premium" },
    ],
    coProdutores: "Instituto PTA Experts", coordenador: "Carlos Mendes",
    debateProduto: "Lives semanais + Q&A Telegram",
    profSlides: "André Rocha", headMarketing: "Lucas Figueiredo",
    liderLancamentos: "Beatriz Matos", designer: "Camila Torres",
    editorVideo: "Pedro Gomes", socialMedia: "Fernanda Lima",
    gestorTrafego: "Rodrigo Pinto", webDesigner: "Juliana Costa",
    palavrasChave: ["musculação", "hipertrofia", "periodização", "personal trainer", "treino", "força"],
    descricaoAvatar: "Personal trainer que quer dominar hipertrofia científica e cobrar mais pelos resultados.",
    oQueVaiAprender: [
      "Fisiologia do músculo e hipertrofia",
      "Periodização linear, ondulante e por blocos",
      "Avaliação física e composição corporal",
      "Técnicas avançadas: drop set, rest-pause, cluster",
    ],
    temaAulaInaugural: "Os 5 fundamentos da hipertrofia que 90% dos PTs ignoram",
    temaImersao: "",
    valorBase: "1.980,00",
    lotes: [
      { id: "l1", label: "Lote 1", valor: "1.497,00", promo: "Early bird" },
      { id: "l2", label: "Lote 2 (Padrão)", valor: "1.980,00", promo: "" },
    ],
    entregaveis: [
      { id: "e1", titulo: "Curso Completo", itens: [
        { id: "i1", text: "9 módulos + 90 aulas em vídeo" },
        { id: "i2", text: "Planilhas de periodização editáveis" },
        { id: "i3", text: "Certificado 360h" },
      ]},
    ],
    bonus: ["Bônus: Biblioteca de treinos — 20 semanas", "Bônus: Calculadora de volume e carga"],
    paraQuemE: "Personal trainers e profissionais de EF que atendem clientes focados em hipertrofia.",
    sofrimentoPersona: [
      { id: "s1", titulo: "Personal generalista", pontos: "Sem método específico; perde clientes para especialistas; cobra menos" },
    ],
    doresESolucoes: [
      { id: "d1", dor: "Resultado inconsistente com alunos", solucao: "Método PTA MPA: do iniciante ao avançado com ciência" },
    ],
    receitaTecnica: "Método PTA MPA: Avaliação → Periodização → Execução → Progressão.",
    linksVenda: [{ id: "lv1", turma: "T12", valor: "1.980,00", link: "https://pay.hotmart.com/mpa-t12-demo" }],
    paginasCaptura: [{ id: "pc1", label: "Pré-Especialização MPA", url: "https://ptaexperts.com.br/pre-musculacao-demo" }],
    paginasVenda:   [{ id: "pv1", label: "Principal T12", url: "https://ptaexperts.com.br/musculacao-t12-demo" }],
  },

  // ── Pós-Grad. Fisiologia FE ───────────────────────────────────────────────
  {
    id: "p005", type: "pos", courseGroup: "fisiologia", turmaVinculada: "T6",
    attachments: [], createdAt: NOW, updatedAt: NOW,
    nome: "Pós-Grad. Fisiologia do Exercício FE",
    expert: "Dra. Letícia Amaral, PhD Fisiologia",
    promessa: "Domine a fisiologia do exercício e torne-se o profissional mais completo da sua área.",
    subPromessas: [
      { id: "sp1", text: "Entenda os mecanismos fisiológicos por trás de cada adaptação" },
      { id: "sp2", text: "Prescreva exercícios com base em evidências fisiológicas sólidas" },
      { id: "sp3", text: "Atenda populações especiais com segurança e eficácia" },
    ],
    coProdutores: "Instituto PTA Experts", coordenador: "Ana Carvalho",
    debateProduto: "Seminários mensais ao vivo",
    profSlides: "Marcelo Santos", headMarketing: "Lucas Figueiredo",
    liderLancamentos: "Beatriz Matos", designer: "Camila Torres",
    editorVideo: "Diego Alves", socialMedia: "Fernanda Lima",
    gestorTrafego: "Rodrigo Pinto", webDesigner: "Juliana Costa",
    palavrasChave: ["fisiologia", "exercício", "metabolismo", "VO2max", "ergometria", "populações especiais"],
    descricaoAvatar: "Profissional de EF ou fisioterapeuta que quer base fisiológica sólida para prescrição avançada.",
    oQueVaiAprender: [
      "Metabolismo energético e sistemas bioenergéticos",
      "Fisiologia cardiovascular e respiratória no exercício",
      "Adaptações neuromusculares ao treinamento",
      "Prescrição para cardiopatas, diabéticos e gestantes",
    ],
    temaAulaInaugural: "VO2max na prática: como avaliar e prescrever o treino certo para cada paciente",
    temaImersao: "",
    valorBase: "1.980,00",
    lotes: [
      { id: "l1", label: "Lote 1", valor: "1.597,00", promo: "Early bird — 72h" },
      { id: "l2", label: "Lote 2 (Padrão)", valor: "1.980,00", promo: "" },
    ],
    entregaveis: [
      { id: "e1", titulo: "Curso Completo", itens: [
        { id: "i1", text: "8 módulos + 75 aulas" },
        { id: "i2", text: "Protocolos de avaliação ergoespirométrica" },
        { id: "i3", text: "Certificado 360h" },
      ]},
    ],
    bonus: ["Bônus: Banco de protocolos para populações especiais", "Bônus: Calculadora de zonas de treino"],
    paraQuemE: "Fisioterapeutas e profissionais de EF que querem base científica sólida em fisiologia do exercício.",
    sofrimentoPersona: [
      { id: "s1", titulo: "Sem base fisiológica", pontos: "Prescrição empírica; dificuldade com casos clínicos; insegurança com populações especiais" },
    ],
    doresESolucoes: [
      { id: "d1", dor: "Prescrição sem embasamento científico", solucao: "Método FE: do mecanismo à prática clínica em 8 módulos" },
    ],
    receitaTecnica: "Método PTA Fisiologia: Mecanismo → Adaptação → Avaliação → Prescrição.",
    linksVenda: [{ id: "lv1", turma: "T6", valor: "1.980,00", link: "https://pay.hotmart.com/fe-t6-demo" }],
    paginasCaptura: [{ id: "pc1", label: "Pré-Especialização FE", url: "https://ptaexperts.com.br/pre-fisiologia-demo" }],
    paginasVenda:   [{ id: "pv1", label: "Principal T6", url: "https://ptaexperts.com.br/fisiologia-t6-demo" }],
  },

  // ── Pós-Grad. Bodybuilding BB ─────────────────────────────────────────────
  {
    id: "p002", type: "pos", courseGroup: "bodybuilding", turmaVinculada: "T5",
    attachments: [], createdAt: NOW, updatedAt: NOW,
    nome: "Pós-Grad. Bodybuilding Elite",
    expert: "Prof. Thiago Barbosa, CREF 12345",
    promessa: "Torne-se o profissional de referência em preparação física para Bodybuilding na sua cidade.",
    subPromessas: [
      { id: "sp1", text: "Domine periodização para hipertrofia máxima" },
      { id: "sp2", text: "Prepare atletas do iniciante ao competidor" },
      { id: "sp3", text: "Construa protocolos individualizados com ciência" },
    ],
    coProdutores: "Instituto PTA Experts", coordenador: "Carlos Mendes",
    debateProduto: "Lives semanais + Q&A no Telegram",
    profSlides: "André Rocha", headMarketing: "Lucas Figueiredo",
    liderLancamentos: "Beatriz Matos", designer: "Camila Torres",
    editorVideo: "Pedro Gomes", socialMedia: "Fernanda Lima",
    gestorTrafego: "Rodrigo Pinto", webDesigner: "Juliana Costa",
    palavrasChave: ["bodybuilding", "hipertrofia", "musculação", "periodização", "atleta natural"],
    descricaoAvatar: "Personal trainer ou profissional de EF com clientes que querem hipertrofia máxima e atletas naturais.",
    oQueVaiAprender: [
      "Periodização ondulante e linear para hipertrofia",
      "Nutrição esportiva aplicada ao bodybuilding",
      "Avaliação e prescrição para atletas naturais",
      "Preparação para competição e peak week",
    ],
    temaAulaInaugural: "O método dos campeões: como estruturar 12 semanas de cutting sem perder massa",
    temaImersao: "",
    valorBase: "1.980,00",
    lotes: [
      { id: "l1", label: "Lote 1", valor: "1.497,00", promo: "Early bird" },
      { id: "l2", label: "Lote 2 (Padrão)", valor: "1.980,00", promo: "" },
    ],
    entregaveis: [
      { id: "e1", titulo: "Curso Completo", itens: [
        { id: "i1", text: "7 módulos + 70 aulas em vídeo" },
        { id: "i2", text: "Planilhas de periodização editáveis" },
        { id: "i3", text: "Certificado 320h" },
      ]},
    ],
    bonus: ["Bônus: Biblioteca de treinos para 16 semanas", "Bônus: Calculadora de macros para atletas"],
    paraQuemE: "Personal trainers e profissionais de EF que atendem atletas de bodybuilding.",
    sofrimentoPersona: [
      { id: "s1", titulo: "Personal generalista", pontos: "Sem método para bodybuilding; perde clientes para especialistas" },
    ],
    doresESolucoes: [
      { id: "d1", dor: "Sem protocolo específico para atletas", solucao: "Método PTA BB: 7 módulos do iniciante ao competidor" },
    ],
    receitaTecnica: "Método PTA Bodybuilding: Base Fisiológica → Periodização → Nutrição → Suplementação → Prep Competição.",
    linksVenda: [{ id: "lv1", turma: "T5", valor: "1.980,00", link: "https://pay.hotmart.com/bb-t5-demo" }],
    paginasCaptura: [{ id: "pc1", label: "Pré-Especialização BB", url: "https://ptaexperts.com.br/pre-bodybuilding-demo" }],
    paginasVenda:   [{ id: "pv1", label: "Principal T5", url: "https://ptaexperts.com.br/bodybuilding-t5-demo" }],
  },

  // ── Pós-Grad. Treinamento Feminino SM ────────────────────────────────────
  {
    id: "p006", type: "pos", courseGroup: "feminino", turmaVinculada: "T3",
    attachments: [], createdAt: NOW, updatedAt: NOW,
    nome: "Pós-Grad. Treinamento Feminino Smart SM",
    expert: "Profa. Gabriela Rocha, CREF 54321",
    promessa: "Especialize-se no treinamento feminino e construa a carteira de alunas mais lucrativa da sua vida.",
    subPromessas: [
      { id: "sp1", text: "Entenda as particularidades hormonais e fisiológicas da mulher" },
      { id: "sp2", text: "Prescreva treinos para cada fase do ciclo menstrual" },
      { id: "sp3", text: "Especialize-se no público que mais cresce no mercado fitness" },
    ],
    coProdutores: "Instituto PTA Experts", coordenador: "Ana Carvalho",
    debateProduto: "Grupo Telegram + mentorias mensais",
    profSlides: "Marcelo Santos", headMarketing: "Lucas Figueiredo",
    liderLancamentos: "Beatriz Matos", designer: "Camila Torres",
    editorVideo: "Diego Alves", socialMedia: "Fernanda Lima",
    gestorTrafego: "Rodrigo Pinto", webDesigner: "Juliana Costa",
    palavrasChave: ["treinamento feminino", "ciclo menstrual", "hormônios", "emagrecimento", "mulher", "gestante"],
    descricaoAvatar: "Personal trainer ou fisioterapeuta que quer se especializar no público feminino.",
    oQueVaiAprender: [
      "Fisiologia hormonal feminina e ciclo menstrual",
      "Periodização para cada fase do ciclo",
      "Treinamento na gestação e pós-parto",
      "Estratégias de emagrecimento para mulheres",
    ],
    temaAulaInaugural: "Por que o treino masculino não funciona para mulheres — e o que fazer diferente",
    temaImersao: "",
    valorBase: "1.980,00",
    lotes: [
      { id: "l1", label: "Lote 1", valor: "1.497,00", promo: "Early bird — 48h" },
      { id: "l2", label: "Lote 2 (Padrão)", valor: "1.980,00", promo: "" },
    ],
    entregaveis: [
      { id: "e1", titulo: "Curso Completo", itens: [
        { id: "i1", text: "7 módulos + 68 aulas" },
        { id: "i2", text: "Protocolos específicos por fase hormonal" },
        { id: "i3", text: "Certificado 320h" },
      ]},
    ],
    bonus: ["Bônus: Banco de treinos — 20 semanas feminino", "Bônus: Masterclass gestação e pós-parto"],
    paraQuemE: "Profissionais de EF e fisioterapeutas que atendem ou querem atender predominantemente mulheres.",
    sofrimentoPersona: [
      { id: "s1", titulo: "Personal sem especialização feminina", pontos: "Usa protocolos masculinos para mulheres; resultados mediocres; alta rotatividade de alunas" },
    ],
    doresESolucoes: [
      { id: "d1", dor: "Alunas que não obtêm resultados", solucao: "Periodização baseada no ciclo hormonal feminino" },
    ],
    receitaTecnica: "Método PTA SM: Avaliação Hormonal → Periodização Cíclica → Nutrição Feminina → Monitoramento.",
    linksVenda: [{ id: "lv1", turma: "T3", valor: "1.980,00", link: "https://pay.hotmart.com/sm-t3-demo" }],
    paginasCaptura: [{ id: "pc1", label: "Pré-Especialização SM", url: "https://ptaexperts.com.br/pre-feminino-demo" }],
    paginasVenda:   [{ id: "pv1", label: "Principal T3", url: "https://ptaexperts.com.br/feminino-t3-demo" }],
  },

  // ── Pós-Grad. Treinamento Funcional TF ───────────────────────────────────
  {
    id: "p007", type: "pos", courseGroup: "funcional", turmaVinculada: "T4",
    attachments: [], createdAt: NOW, updatedAt: NOW,
    nome: "Pós-Grad. Treinamento Funcional TF",
    expert: "Prof. Marcos Lima, CREF 77890",
    promessa: "Domine o treinamento funcional e abra novas fronteiras de atuação profissional.",
    subPromessas: [
      { id: "sp1", text: "Combine mobilidade, estabilidade e força para resultados reais" },
      { id: "sp2", text: "Crie metodologias exclusivas e saia do oceano vermelho do fitness" },
      { id: "sp3", text: "Atenda de atletas a idosos com o mesmo método científico" },
    ],
    coProdutores: "Instituto PTA Experts", coordenador: "Carlos Mendes",
    debateProduto: "Lives práticas mensais",
    profSlides: "André Rocha", headMarketing: "Lucas Figueiredo",
    liderLancamentos: "Beatriz Matos", designer: "Camila Torres",
    editorVideo: "Pedro Gomes", socialMedia: "Fernanda Lima",
    gestorTrafego: "Rodrigo Pinto", webDesigner: "Juliana Costa",
    palavrasChave: ["funcional", "treinamento funcional", "mobilidade", "estabilidade", "core", "movimento"],
    descricaoAvatar: "Personal trainer que quer se destacar com metodologia funcional e atender nichos variados.",
    oQueVaiAprender: [
      "Avaliação funcional do movimento (FMS, SFMA)",
      "Periodização funcional para performance",
      "Exercícios de mobilidade articular e estabilidade core",
      "Aplicação em atletas, idosos e reabilitação",
    ],
    temaAulaInaugural: "Os 7 padrões fundamentais de movimento que definem a saúde funcional",
    temaImersao: "",
    valorBase: "1.980,00",
    lotes: [
      { id: "l1", label: "Lote 1", valor: "1.497,00", promo: "Early bird" },
      { id: "l2", label: "Lote 2 (Padrão)", valor: "1.980,00", promo: "" },
    ],
    entregaveis: [
      { id: "e1", titulo: "Curso Completo", itens: [
        { id: "i1", text: "8 módulos + 72 aulas em vídeo" },
        { id: "i2", text: "Biblioteca de exercícios funcionais (500+)" },
        { id: "i3", text: "Certificado 360h" },
      ]},
    ],
    bonus: ["Bônus: Banco de programas funcionais — 12 semanas", "Bônus: Guia de implementação em grupo"],
    paraQuemE: "Profissionais de EF e fisioterapeutas que querem dominar o treinamento funcional.",
    sofrimentoPersona: [
      { id: "s1", titulo: "PT sem metodologia funcional", pontos: "Treinos sem lógica de movimento; lesões frequentes; sem diferencial no mercado" },
    ],
    doresESolucoes: [
      { id: "d1", dor: "Sem metodologia estruturada para treino funcional", solucao: "Método PTA TF: dos padrões de movimento à periodização completa" },
    ],
    receitaTecnica: "Método PTA Funcional: Avaliação FMS → Planejamento → Progressão → Avaliação de Resultados.",
    linksVenda: [{ id: "lv1", turma: "T4", valor: "1.980,00", link: "https://pay.hotmart.com/tf-t4-demo" }],
    paginasCaptura: [{ id: "pc1", label: "Pré-Especialização TF", url: "https://ptaexperts.com.br/pre-funcional-demo" }],
    paginasVenda:   [{ id: "pv1", label: "Principal T4", url: "https://ptaexperts.com.br/funcional-t4-demo" }],
  },

  // ── Imersão Biomecânica ───────────────────────────────────────────────────
  {
    id: "p003", type: "imersao", courseGroup: "biomecanica", turmaVinculada: "T8",
    attachments: [], createdAt: NOW, updatedAt: NOW,
    nome: "Imersão Biomecânica Funcional",
    expert: "Dr. Rafael Menezes",
    promessa: "2 dias intensivos para transformar sua visão clínica sobre movimento humano.",
    subPromessas: [
      { id: "sp1", text: "Aprenda na prática com casos reais e dinâmicas" },
      { id: "sp2", text: "Networking com os melhores da área" },
      { id: "sp3", text: "Porta de entrada para a Pós-Grad. Biomecânica T8" },
    ],
    coProdutores: "Instituto PTA Experts", coordenador: "Ana Carvalho",
    debateProduto: "Discussão de casos ao vivo com Dr. Rafael",
    profSlides: "Marcelo Santos", headMarketing: "Lucas Figueiredo",
    liderLancamentos: "Beatriz Matos", designer: "Camila Torres",
    editorVideo: "Diego Alves", socialMedia: "Fernanda Lima",
    gestorTrafego: "Rodrigo Pinto", webDesigner: "Juliana Costa",
    palavrasChave: ["imersão", "biomecânica", "evento presencial", "workshop"],
    descricaoAvatar: "Fisioterapeuta que quer atualização rápida e está avaliando a pós-graduação.",
    oQueVaiAprender: [],
    temaAulaInaugural: "",
    temaImersao: "Análise de Movimento Funcional: da teoria à prática clínica em 2 dias com cases reais.",
    valorBase: "697,00",
    lotes: [
      { id: "l1", label: "Lote 1 (Esgotado)", valor: "497,00", promo: "Esgotado" },
      { id: "l2", label: "Lote 2 (Esgotado)", valor: "597,00", promo: "Esgotado" },
      { id: "l3", label: "Lote 3", valor: "697,00", promo: "Último lote" },
    ],
    entregaveis: [],
    bonus: ["Acesso ao replay das sessões teóricas por 30 dias", "Apostila digital exclusiva"],
    paraQuemE: "Fisioterapeutas e profissionais de EF que querem atualização prática.",
    sofrimentoPersona: [],
    doresESolucoes: [],
    receitaTecnica: "",
    linksVenda: [{ id: "lv1", turma: "Abr/2026", valor: "697,00", link: "https://pay.hotmart.com/imersao-bio-demo" }],
    paginasCaptura: [{ id: "pc1", label: "Página Imersão", url: "https://ptaexperts.com.br/imersao-biomecanica-demo" }],
    paginasVenda:   [{ id: "pv1", label: "Checkout", url: "https://ptaexperts.com.br/imersao-checkout-demo" }],
  },
];

// ─── Advertiser Profiles (Perfil de Anunciantes) ───────────────────────────────

export const MOCK_ADVERTISER_PROFILES: AdvertiserProfile[] = [
  {
    id: "ap001",
    name: "PTA — Biomecânica",
    product: "Pós-Grad. Biomecânica Aplicada",
    adAccountId: "act_demo_biomecanica",
    groupId: "biomecanica",
    campaigns: [
      { id: "c_bio_001", name: "[PTA] Pós Grad. Biomecânica BM | ABO T10" },
      { id: "c_bio_002", name: "[BS] Leads | ABO T10 Biomecânica" },
    ],
    instagramUsername: "ptaexperts",
    createdAt: NOW,
  },
  {
    id: "ap002",
    name: "PTA — Bodybuilding",
    product: "Pós-Grad. Bodybuilding Elite",
    adAccountId: "act_demo_bodybuilding",
    groupId: "bodybuilding",
    campaigns: [
      { id: "c_bb_001", name: "[PTA] Pós Grad. Bodybuilding BB | ABO T5" },
    ],
    instagramUsername: "ptabodybuilding",
    createdAt: NOW,
  },
  {
    id: "ap003",
    name: "PTA — Musculação",
    product: "Pós-Grad. Musculação Avançada MPA",
    adAccountId: "act_demo_musculacao",
    groupId: "musculacao",
    campaigns: [
      { id: "c_mpa_001", name: "[PTA] Musculação MPA | CBO T12" },
    ],
    instagramUsername: "ptamusculacao",
    createdAt: NOW,
  },
  {
    id: "ap004",
    name: "PTA — Feminino",
    product: "Pós-Grad. Treinamento Feminino Smart",
    adAccountId: "act_demo_feminino",
    groupId: "feminino",
    campaigns: [
      { id: "c_sm_001", name: "[PTA] Pós Grad. Feminino SM | CBO T3" },
    ],
    instagramUsername: "ptafeminino",
    createdAt: NOW,
  },
  {
    id: "ap005",
    name: "PTA — Funcional",
    product: "Pós-Grad. Treinamento Funcional TF",
    adAccountId: "act_demo_funcional",
    groupId: "funcional",
    campaigns: [
      { id: "c_tf_001", name: "[PTA] Trein. Funcional TF | ABO T4" },
    ],
    instagramUsername: "ptafuncional",
    createdAt: NOW,
  },
  {
    id: "ap006",
    name: "PTA — Fisiologia",
    product: "Pós-Grad. Fisiologia do Exercício FE",
    adAccountId: "act_demo_fisiologia",
    groupId: "fisiologia",
    campaigns: [
      { id: "c_fe_001", name: "[PTA] Fisiologia do Exercício FE | ABO T6" },
    ],
    instagramUsername: "ptafisiologia",
    createdAt: NOW,
  },
];

// ─── Seed function — grava dados fictícios no localStorage ────────────────────

export function seedDemoData(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("pta_hist_rows_v2",            JSON.stringify(MOCK_HISTORICAL_ROWS));
    localStorage.setItem("pta_hist_metas_v1",           JSON.stringify(MOCK_HISTORICAL_METAS));
    localStorage.setItem("pta_products_v1",             JSON.stringify(MOCK_PRODUCTS));
    localStorage.setItem("pta_advertiser_profiles_v2",  JSON.stringify(MOCK_ADVERTISER_PROFILES));
    localStorage.setItem("pta_onboarding_v1",           "1");
  } catch { /* unavailable */ }
}
