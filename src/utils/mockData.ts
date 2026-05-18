import { CampaignData } from "@/types/campaign";
import { HistoricalRow, HistoricalMeta } from "@/types/historical";
import { ProductData } from "@/types/product";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function row(
  id: string, date: string, name: string,
  investment: number, clicks: number, impressions: number,
  conversions: number, revenue: number,
): CampaignData {
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpc = clicks > 0 ? investment / clicks : 0;
  const cpa = conversions > 0 ? investment / conversions : 0;
  const roas = investment > 0 ? revenue / investment : 0;
  const conversionRate = clicks > 0 ? (conversions / clicks) * 100 : 0;
  return { id, date, campaignName: name, investment, clicks, impressions, conversions, leads: 0, revenue, ctr, cpc, cpa, roas, conversionRate };
}

function uid(prefix: string, i: number) { return `${prefix}${String(i).padStart(3, "0")}`; }

function dateStr(daysAgo: number): string {
  const d = new Date("2026-05-15");
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// ─── Campaign mock data — 30 dias ─────────────────────────────────────────────

const CAMPAIGN_DAYS: Array<{
  daysAgo: number; invest: number; clicks: number; impr: number;
  convBio: number; revBio: number; convBB: number; revBB: number;
  convFem: number; revFem: number; convRet: number; revRet: number;
}> = [
  { daysAgo: 0,  invest: 115, clicks:  241, impr:  19672,  convBio: 10, revBio: 1800, convBB: 6,  revBB: 1080, convFem: 4,  revFem: 720,  convRet: 7,  revRet: 1260 },
  { daysAgo: 1,  invest: 180, clicks:  320, impr:  22000,  convBio: 12, revBio: 2160, convBB: 0,  revBB: 0,    convFem: 0,  revFem: 0,    convRet: 8,  revRet: 1440 },
  { daysAgo: 2,  invest: 210, clicks:  490, impr:  28000,  convBio: 16, revBio: 2880, convBB: 10, revBB: 1800, convFem: 0,  revFem: 0,    convRet: 12, revRet: 2160 },
  { daysAgo: 3,  invest: 220, clicks:  510, impr:  31000,  convBio: 18, revBio: 3240, convBB: 11, revBB: 1980, convFem: 7,  revFem: 1260, convRet: 10, revRet: 1800 },
  { daysAgo: 4,  invest: 195, clicks:  440, impr:  25000,  convBio: 14, revBio: 2520, convBB: 9,  revBB: 1620, convFem: 6,  revFem: 1080, convRet: 9,  revRet: 1620 },
  { daysAgo: 5,  invest: 175, clicks:  320, impr:  17000,  convBio: 11, revBio: 1980, convBB: 8,  revBB: 1440, convFem: 5,  revFem: 900,  convRet: 8,  revRet: 1440 },
  { daysAgo: 6,  invest: 155, clicks:  270, impr:  14000,  convBio: 8,  revBio: 1440, convBB: 5,  revBB: 900,  convFem: 3,  revFem: 540,  convRet: 7,  revRet: 1260 },
  { daysAgo: 7,  invest: 190, clicks:  360, impr:  24000,  convBio: 13, revBio: 2340, convBB: 9,  revBB: 1620, convFem: 5,  revFem: 900,  convRet: 11, revRet: 1980 },
  { daysAgo: 8,  invest: 205, clicks:  420, impr:  27000,  convBio: 15, revBio: 2700, convBB: 10, revBB: 1800, convFem: 6,  revFem: 1080, convRet: 9,  revRet: 1620 },
  { daysAgo: 9,  invest: 230, clicks:  530, impr:  33000,  convBio: 19, revBio: 3420, convBB: 13, revBB: 2340, convFem: 8,  revFem: 1440, convRet: 14, revRet: 2520 },
  { daysAgo: 10, invest: 215, clicks:  480, impr:  30000,  convBio: 17, revBio: 3060, convBB: 11, revBB: 1980, convFem: 7,  revFem: 1260, convRet: 12, revRet: 2160 },
  { daysAgo: 11, invest: 185, clicks:  390, impr:  26000,  convBio: 14, revBio: 2520, convBB: 8,  revBB: 1440, convFem: 5,  revFem: 900,  convRet: 10, revRet: 1800 },
  { daysAgo: 12, invest: 160, clicks:  310, impr:  21000,  convBio: 10, revBio: 1800, convBB: 7,  revBB: 1260, convFem: 4,  revFem: 720,  convRet: 8,  revRet: 1440 },
  { daysAgo: 13, invest: 140, clicks:  280, impr:  19000,  convBio: 9,  revBio: 1620, convBB: 5,  revBB: 900,  convFem: 3,  revFem: 540,  convRet: 6,  revRet: 1080 },
  { daysAgo: 14, invest: 200, clicks:  410, impr:  26500,  convBio: 15, revBio: 2700, convBB: 10, revBB: 1800, convFem: 6,  revFem: 1080, convRet: 11, revRet: 1980 },
  { daysAgo: 15, invest: 240, clicks:  550, impr:  34000,  convBio: 20, revBio: 3600, convBB: 14, revBB: 2520, convFem: 9,  revFem: 1620, convRet: 15, revRet: 2700 },
  { daysAgo: 16, invest: 225, clicks:  500, impr:  31500,  convBio: 18, revBio: 3240, convBB: 12, revBB: 2160, convFem: 8,  revFem: 1440, convRet: 13, revRet: 2340 },
  { daysAgo: 17, invest: 195, clicks:  430, impr:  27500,  convBio: 15, revBio: 2700, convBB: 10, revBB: 1800, convFem: 6,  revFem: 1080, convRet: 10, revRet: 1800 },
  { daysAgo: 18, invest: 170, clicks:  350, impr:  23000,  convBio: 12, revBio: 2160, convBB: 7,  revBB: 1260, convFem: 4,  revFem: 720,  convRet: 8,  revRet: 1440 },
  { daysAgo: 19, invest: 145, clicks:  295, impr:  20000,  convBio: 9,  revBio: 1620, convBB: 5,  revBB: 900,  convFem: 3,  revFem: 540,  convRet: 6,  revRet: 1080 },
  { daysAgo: 20, invest: 210, clicks:  465, impr:  29000,  convBio: 16, revBio: 2880, convBB: 11, revBB: 1980, convFem: 7,  revFem: 1260, convRet: 12, revRet: 2160 },
  { daysAgo: 21, invest: 235, clicks:  520, impr:  32500,  convBio: 19, revBio: 3420, convBB: 13, revBB: 2340, convFem: 8,  revFem: 1440, convRet: 14, revRet: 2520 },
  { daysAgo: 22, invest: 220, clicks:  490, impr:  30500,  convBio: 17, revBio: 3060, convBB: 11, revBB: 1980, convFem: 7,  revFem: 1260, convRet: 12, revRet: 2160 },
  { daysAgo: 23, invest: 185, clicks:  400, impr:  25500,  convBio: 13, revBio: 2340, convBB: 8,  revBB: 1440, convFem: 5,  revFem: 900,  convRet: 9,  revRet: 1620 },
  { daysAgo: 24, invest: 160, clicks:  330, impr:  22000,  convBio: 11, revBio: 1980, convBB: 6,  revBB: 1080, convFem: 4,  revFem: 720,  convRet: 7,  revRet: 1260 },
  { daysAgo: 25, invest: 135, clicks:  270, impr:  18500,  convBio: 8,  revBio: 1440, convBB: 5,  revBB: 900,  convFem: 3,  revFem: 540,  convRet: 5,  revRet: 900  },
  { daysAgo: 26, invest: 200, clicks:  440, impr:  28000,  convBio: 15, revBio: 2700, convBB: 9,  revBB: 1620, convFem: 6,  revFem: 1080, convRet: 11, revRet: 1980 },
  { daysAgo: 27, invest: 225, clicks:  500, impr:  31000,  convBio: 17, revBio: 3060, convBB: 12, revBB: 2160, convFem: 8,  revFem: 1440, convRet: 13, revRet: 2340 },
  { daysAgo: 28, invest: 210, clicks:  470, impr:  29500,  convBio: 16, revBio: 2880, convBB: 10, revBB: 1800, convFem: 6,  revFem: 1080, convRet: 11, revRet: 1980 },
  { daysAgo: 29, invest: 180, clicks:  380, impr:  24500,  convBio: 13, revBio: 2340, convBB: 8,  revBB: 1440, convFem: 5,  revFem: 900,  convRet: 9,  revRet: 1620 },
];

let _idx = 1;
export const MOCK_CAMPAIGNS: CampaignData[] = CAMPAIGN_DAYS.flatMap(({ daysAgo, invest, clicks, impr, convBio, revBio, convBB, revBB, convFem, revFem, convRet, revRet }) => {
  const dt = dateStr(daysAgo);
  const leadInvest = invest * 0.22;
  const trafInvest = invest * 0.18;
  const bioInvest  = invest * 0.32;
  const bbInvest   = convBB  > 0 ? invest * 0.16 : 0;
  const femInvest  = convFem > 0 ? invest * 0.12 : 0;
  const retInvest  = invest * 0.18;

  return [
    row(uid("c", _idx++), dt, "[BS] Leads | ABO T10",            leadInvest, Math.round(clicks * 0.12), Math.round(impr * 0.14), 0,       0),
    row(uid("c", _idx++), dt, "[Seguidores] Tráfego CBO",         trafInvest, Math.round(clicks * 0.55), Math.round(impr * 0.52), 0,       0),
    row(uid("c", _idx++), dt, "[PTA] Pós Grad. Biomecânica",      bioInvest,  Math.round(clicks * 0.19), Math.round(impr * 0.18), convBio, revBio),
    ...(convBB > 0  ? [row(uid("c", _idx++), dt, "[PTA] Pós Grad. Bodybuilding",   bbInvest,  Math.round(clicks * 0.09), Math.round(impr * 0.09), convBB,  revBB)]  : []),
    ...(convFem > 0 ? [row(uid("c", _idx++), dt, "[PTA] Pós Grad. Feminino",       femInvest, Math.round(clicks * 0.05), Math.round(impr * 0.07), convFem, revFem)] : []),
    row(uid("c", _idx++), dt, "[PTA] Retargeting | HOT",          retInvest,  Math.round(clicks * 0.10), Math.round(impr * 0.09), convRet, revRet),
  ];
});

export const MOCK_SOURCE_LABEL = "Meta Ads · Demo";

// ─── Historical mock data ──────────────────────────────────────────────────────

function mk(monthKey: string): { month: string; year: number; monthKey: string; monthLabel: string } {
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
];

// ─── Products mock data ────────────────────────────────────────────────────────

const NOW = "2026-05-15T00:00:00.000Z";

export const MOCK_PRODUCTS: ProductData[] = [
  {
    id: "p001",
    type: "pos",
    courseGroup: "biomecanica",
    turmaVinculada: "T8",
    attachments: [],
    createdAt: NOW,
    updatedAt: NOW,
    nome: "Pós-Grad. Biomecânica Aplicada",
    expert: "Dr. Rafael Menezes",
    promessa: "Forme o raciocínio clínico em biomecânica que separa o fisioterapeuta mediano do especialista requisitado.",
    subPromessas: [
      { id: "sp1", text: "Domine análise de movimento funcional em 8 semanas" },
      { id: "sp2", text: "Construa laudos biomecânicos com respaldo científico" },
      { id: "sp3", text: "Aplique imediatamente no seu consultório ou academia" },
    ],
    coProdutores: "Instituto PTA Experts",
    coordenador: "Ana Carvalho",
    debateProduto: "Fórum semanal com Dr. Rafael + assistentes",
    profSlides: "Marcelo Santos",
    headMarketing: "Lucas Figueiredo",
    liderLancamentos: "Beatriz Matos",
    designer: "Camila Torres",
    editorVideo: "Diego Alves",
    socialMedia: "Fernanda Lima",
    gestorTrafego: "Rodrigo Pinto",
    webDesigner: "Juliana Costa",
    palavrasChave: ["biomecânica", "análise de movimento", "fisioterapia esportiva", "coluna", "joelho", "postura"],
    descricaoAvatar: "Fisioterapeuta ou profissional de EF com 2-5 anos de experiência, atua em clínica ou academia, quer se especializar para cobrar mais e ter casos mais complexos.",
    oQueVaiAprender: [
      "Análise cinemática e cinética do movimento humano",
      "Avaliação postural e funcional com laudos",
      "Biomecânica da coluna, joelho, quadril e ombro",
      "Prescrição baseada em evidências biomecânicas",
      "Uso de tecnologias e softwares de análise",
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
      {
        id: "e1",
        titulo: "Módulos do Curso",
        itens: [
          { id: "i1", text: "8 módulos com + de 80 aulas em vídeo HD" },
          { id: "i2", text: "Apostilas e PDFs científicos por módulo" },
          { id: "i3", text: "Acesso vitalício + atualizações" },
        ],
      },
      {
        id: "e2",
        titulo: "Comunidade & Mentoria",
        itens: [
          { id: "i4", text: "Grupo exclusivo no Telegram" },
          { id: "i5", text: "2 mentorias em grupo por mês" },
          { id: "i6", text: "Certificado de especialização (360h)" },
        ],
      },
    ],
    bonus: [
      "Bônus 1: Biblioteca de casos clínicos (+ 200 casos)",
      "Bônus 2: Planilha de laudo biomecânico editável",
      "Bônus 3: Masterclass 'Precificação para especialistas'",
    ],
    paraQuemE: "Fisioterapeutas e profissionais de Educação Física que querem dominar a biomecânica clínica para atender casos complexos, cobrar consultas premium e construir autoridade na área.",
    sofrimentoPersona: [
      { id: "s1", titulo: "Iniciante na especialidade", pontos: "Sente insegurança ao atender casos complexos; não sabe argumentar com embasamento científico; perde pacientes para especialistas" },
      { id: "s2", titulo: "Experiente querendo crescer", pontos: "Teto de ganho limitado; consultas técnicas sem diferencial; quer construir autoridade digital na área" },
    ],
    doresESolucoes: [
      { id: "d1", dor: "Insegurança para atender casos complexos", solucao: "Protocolo passo-a-passo com 200+ casos clínicos reais" },
      { id: "d2", dor: "Cobrando pouco por não ter especialização reconhecida", solucao: "Certificado de 360h + comunidade para construir autoridade" },
      { id: "d3", dor: "Cursos teóricos demais, pouco aplicáveis", solucao: "Método prático: aprende → aplica → tira dúvidas na mentoria" },
    ],
    receitaTecnica: "Método PTA Biomecânica: Avaliar → Planejar → Intervir → Documentar. Cada módulo segue esse ciclo, do básico ao avançado.",
    linksVenda: [
      { id: "lv1", turma: "T8", valor: "1.980,00", link: "https://pay.hotmart.com/bio-t8-demo" },
      { id: "lv2", turma: "T7", valor: "1.797,00", link: "https://pay.hotmart.com/bio-t7-demo" },
    ],
    paginasCaptura: [
      { id: "pc1", label: "Pré-Especialização BM", url: "https://ptaexperts.com.br/pre-biomecanica-demo" },
    ],
    paginasVenda: [
      { id: "pv1", label: "Principal T8", url: "https://ptaexperts.com.br/biomecanica-t8-demo" },
    ],
  },
  {
    id: "p002",
    type: "pos",
    courseGroup: "bodybuilding",
    turmaVinculada: "T5",
    attachments: [],
    createdAt: NOW,
    updatedAt: NOW,
    nome: "Pós-Grad. Bodybuilding Elite",
    expert: "Prof. Thiago Barbosa, CREF 12345",
    promessa: "Torne-se o profissional de referência em preparação física para Bodybuilding na sua cidade.",
    subPromessas: [
      { id: "sp1", text: "Domine periodização para hipertrofia máxima" },
      { id: "sp2", text: "Prepare atletas do iniciante ao competidor" },
      { id: "sp3", text: "Construa protocolos individualizados com ciência" },
    ],
    coProdutores: "Instituto PTA Experts",
    coordenador: "Carlos Mendes",
    debateProduto: "Lives semanais + Q&A no Telegram",
    profSlides: "André Rocha",
    headMarketing: "Lucas Figueiredo",
    liderLancamentos: "Beatriz Matos",
    designer: "Camila Torres",
    editorVideo: "Pedro Gomes",
    socialMedia: "Fernanda Lima",
    gestorTrafego: "Rodrigo Pinto",
    webDesigner: "Juliana Costa",
    palavrasChave: ["bodybuilding", "hipertrofia", "musculação", "periodização", "atleta natural", "fisiculturismo"],
    descricaoAvatar: "Personal trainer ou profissional de EF com clientes que querem hipertrofia, quer trabalhar com atletas naturais e precisa de método científico para gerar resultados previsíveis.",
    oQueVaiAprender: [
      "Periodização ondulante e linear para hipertrofia",
      "Nutrição esportiva aplicada ao bodybuilding",
      "Avaliação e prescrição para atletas naturais",
      "Suplementação com base em evidências",
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
      {
        id: "e1",
        titulo: "Curso Completo",
        itens: [
          { id: "i1", text: "7 módulos + 70 aulas em vídeo" },
          { id: "i2", text: "Planilhas de periodização editáveis" },
          { id: "i3", text: "Certificado 320h" },
        ],
      },
    ],
    bonus: [
      "Bônus: Biblioteca de treinos para 16 semanas",
      "Bônus: Calculadora de macros para atletas",
    ],
    paraQuemE: "Personal trainers e profissionais de EF que atendem ou querem atender atletas de bodybuilding e musculação de alto rendimento.",
    sofrimentoPersona: [
      { id: "s1", titulo: "Personal generalista", pontos: "Não tem método para bodybuilding; perde clientes para especialistas; cobra menos que poderia" },
    ],
    doresESolucoes: [
      { id: "d1", dor: "Sem protocolo específico para atletas", solucao: "Método PTA BB: 7 módulos do iniciante ao competidor" },
      { id: "d2", dor: "Insegurança com nutrição e suplementação", solucao: "Módulo completo de nutrição esportiva com calculadoras práticas" },
    ],
    receitaTecnica: "Método PTA Bodybuilding: Base Fisiológica → Periodização → Nutrição → Suplementação → Prep Competição.",
    linksVenda: [
      { id: "lv1", turma: "T5", valor: "1.980,00", link: "https://pay.hotmart.com/bb-t5-demo" },
    ],
    paginasCaptura: [
      { id: "pc1", label: "Pré-Especialização BB", url: "https://ptaexperts.com.br/pre-bodybuilding-demo" },
    ],
    paginasVenda: [
      { id: "pv1", label: "Principal T5", url: "https://ptaexperts.com.br/bodybuilding-t5-demo" },
    ],
  },
  {
    id: "p003",
    type: "imersao",
    courseGroup: "biomecanica",
    turmaVinculada: "T8",
    attachments: [],
    createdAt: NOW,
    updatedAt: NOW,
    nome: "Imersão Biomecânica Funcional",
    expert: "Dr. Rafael Menezes",
    promessa: "2 dias intensivos para transformar sua visão clínica sobre movimento humano.",
    subPromessas: [
      { id: "sp1", text: "Aprenda na prática, com casos reais e dinâmicas" },
      { id: "sp2", text: "Networking com os melhores da área" },
      { id: "sp3", text: "Porta de entrada para a Pós-Grad. Biomecânica T8" },
    ],
    coProdutores: "Instituto PTA Experts",
    coordenador: "Ana Carvalho",
    debateProduto: "Discussão de casos ao vivo com Dr. Rafael",
    profSlides: "Marcelo Santos",
    headMarketing: "Lucas Figueiredo",
    liderLancamentos: "Beatriz Matos",
    designer: "Camila Torres",
    editorVideo: "Diego Alves",
    socialMedia: "Fernanda Lima",
    gestorTrafego: "Rodrigo Pinto",
    webDesigner: "Juliana Costa",
    palavrasChave: ["imersão", "biomecânica", "evento presencial", "workshop", "fisioterapia"],
    descricaoAvatar: "Fisioterapeuta ou profissional de EF que quer se atualizar rapidamente e está avaliando a pós-graduação.",
    oQueVaiAprender: [],
    temaAulaInaugural: "",
    temaImersao: "Análise de Movimento Funcional: da teoria à prática clínica em 2 dias imersivos com cases reais, laboratório de biomecânica e dinâmicas em grupo.",
    valorBase: "697,00",
    lotes: [
      { id: "l1", label: "Lote 1 (Esgotado)", valor: "497,00", promo: "Early bird — esgotado" },
      { id: "l2", label: "Lote 2 (Esgotado)", valor: "597,00", promo: "Esgotado" },
      { id: "l3", label: "Lote 3", valor: "697,00", promo: "Último lote" },
    ],
    entregaveis: [],
    bonus: ["Acesso ao replay das sessões teóricas por 30 dias", "Apostila digital exclusiva"],
    paraQuemE: "Fisioterapeutas e profissionais de EF que querem atualização prática e acesso antecipado à Pós-Grad.",
    sofrimentoPersona: [],
    doresESolucoes: [],
    receitaTecnica: "",
    linksVenda: [
      { id: "lv1", turma: "Abr/2026", valor: "697,00", link: "https://pay.hotmart.com/imersao-bio-demo" },
    ],
    paginasCaptura: [
      { id: "pc1", label: "Página Imersão", url: "https://ptaexperts.com.br/imersao-biomecanica-demo" },
    ],
    paginasVenda: [
      { id: "pv1", label: "Checkout", url: "https://ptaexperts.com.br/imersao-checkout-demo" },
    ],
  },
];

// ─── Seed function — grava dados fictícios no localStorage ────────────────────

export function seedDemoData(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("pta_hist_rows_v2",  JSON.stringify(MOCK_HISTORICAL_ROWS));
    localStorage.setItem("pta_hist_metas_v1", JSON.stringify(MOCK_HISTORICAL_METAS));
    localStorage.setItem("pta_products_v1",   JSON.stringify(MOCK_PRODUCTS));
    localStorage.setItem("pta_onboarding_v1", "1");
  } catch { /* unavailable */ }
}
