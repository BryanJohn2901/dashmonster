import { CampaignData } from "@/types/campaign";
import { HistoricalRow, HistoricalMeta } from "@/types/historical";
import { ProductData, ProductType, emptyProduct } from "@/types/product";
import { AdvertiserProfile } from "@/hooks/useAdvertiserStore";

// Dados fictícios NEUTROS por empresa demo. Sem taxonomia de nenhum nicho
// específico: cada empresa demo é gerada a partir de um tema compacto, para que
// trocar de empresa mude tudo na tela sem embutir dados de negócio real.

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW = "2026-05-21T00:00:00.000Z";
const DAYS = 30;

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

// Ruído leve para os valores parecerem orgânicos.
function jitter(base: number, pct = 0.15): number {
  return Math.round(base * (1 + (Math.random() * 2 - 1) * pct));
}

function mk(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  const labels: Record<number, string> = { 1:"Jan", 2:"Fev", 3:"Mar", 4:"Abr", 5:"Mai", 6:"Jun", 7:"Jul", 8:"Ago", 9:"Set", 10:"Out", 11:"Nov", 12:"Dez" };
  return { month: String(m).padStart(2, "0"), year: y, monthKey, monthLabel: `${labels[m]}/${y}` };
}

/** Produto compacto: parte dos campos + defaults do emptyProduct. */
function mkProduct(
  p: Partial<ProductData> & { id: string; nome: string; type: ProductType; categoria: string },
): ProductData {
  return { ...emptyProduct(p.type), createdAt: NOW, updatedAt: NOW, ...p } as ProductData;
}

// ─── Dataset por empresa ──────────────────────────────────────────────────────

export interface CompanyDataset {
  campaigns: CampaignData[];
  sourceLabel: string;
  historical: HistoricalRow[];
  metas: HistoricalMeta[];
  products: ProductData[];
  profiles: AdvertiserProfile[];
}

// ── Gerador genérico a partir de um tema ────────────────────────────────────────
interface ThemeProduct { id: string; nome: string; categoria: string; expert: string; promessa: string; preco: string; tag: string }
interface ThemeCampaign { name: string; investFrac: number; clicks: number; impr: number; conv: number; ticket: number; leads: number }
interface Theme {
  sourceLabel: string;
  igBase: string;
  products: ThemeProduct[];
  campaigns: ThemeCampaign[];
}

function genDataset(theme: Theme): CompanyDataset {
  // Campanhas — 30 dias com padrão de semana
  const campaigns: CampaignData[] = Array.from({ length: DAYS }, (_, i) => {
    const dt = dateStr(i);
    const dow = new Date(dt).getDay();
    const wk = (dow === 0 || dow === 6) ? 0.65 : 1;
    return theme.campaigns.map((c) =>
      row(uid("c"), dt, c.name,
        jitter(c.investFrac * 200 * wk), jitter(c.clicks * wk), jitter(c.impr * wk),
        jitter(c.conv), jitter(c.conv * c.ticket), jitter(c.leads)),
    );
  }).flat();

  // Produtos
  const products: ProductData[] = theme.products.map((p) =>
    mkProduct({
      id: p.id, type: "imersao", categoria: p.categoria, nome: p.nome,
      expert: p.expert, promessa: p.promessa, valorBase: p.preco,
      palavrasChave: [p.tag.toLowerCase()],
      subPromessas: [{ id: `${p.id}s1`, text: p.promessa }],
      linksVenda: [{ id: `${p.id}lv`, turma: "—", valor: p.preco, link: `https://pay.demo/${p.id}` }],
      paginasVenda: [{ id: `${p.id}pv`, label: "Principal", url: `https://demo.com/${p.id}` }],
    }),
  );

  // Histórico — 1 lançamento por produto, espalhado nos últimos meses
  const months = ["2026-05", "2026-04", "2026-03", "2026-02", "2026-01", "2025-12"];
  const historical: HistoricalRow[] = theme.products.map((p, idx) => {
    const inv = jitter(8000 + idx * 1500);
    const ticket = Number(p.preco.replace(/[.,]/g, "")) / 100 || 200;
    const sales = jitter(40 + idx * 6);
    const rev = Math.round(sales * ticket);
    return {
      id: `${p.id}h`, kind: "lancamento", product: p.nome, turma: `T${idx + 1}`, tag: p.tag,
      ...mk(months[idx % months.length]), investment: inv, revenue: rev,
      cpm: 24 + idx, reach: jitter(420000), ctr: 2.3 + idx * 0.1, clicks: jitter(11000),
      pageViews: jitter(6000), pageViewRate: 55, preCheckouts: jitter(900), preCheckoutRate: 15,
      sales, salesRate: 4, cac: Math.round(inv / Math.max(1, sales)), roas: Math.round((rev / inv) * 10) / 10,
    } as HistoricalRow;
  });

  const metas: HistoricalMeta[] = theme.products.map((p, idx) => ({
    id: `${p.id}m`, product: p.nome, kind: "lancamento", investment: jitter(9000),
    cpm: 25, ctr: 2.4, pageViewRate: 55, preCheckoutRate: 15, salesTarget: 45 + idx * 5, cac: 300,
  }));

  // Perfis de anunciante — 1 por produto (até 4)
  const profiles: AdvertiserProfile[] = theme.products.slice(0, 4).map((p, idx) => ({
    id: `${p.id}ap`, name: p.nome, product: p.nome,
    adAccountId: `act_demo_${p.id}`, groupId: p.tag.toLowerCase(),
    campaigns: [{ id: `${p.id}c`, name: theme.campaigns[idx % theme.campaigns.length].name }],
    instagramUsername: `${theme.igBase}${idx + 1}`, createdAt: NOW,
  }));

  return { campaigns, sourceLabel: theme.sourceLabel, historical, metas, products, profiles };
}

// demo-1 — Negócio digital (info-produtos, ticket médio)
const DIGITAL_THEME: Theme = {
  sourceLabel: "Meta Ads · Empresa Demo A (Dados Fictícios)",
  igBase: "empresademo",
  products: [
    { id: "d1p1", nome: "Curso Online A", categoria: "Curso", expert: "Equipe Demo", promessa: "Domine o tema do zero ao avançado com um método claro.", preco: "997,00", tag: "Cursos" },
    { id: "d1p2", nome: "Mentoria B", categoria: "Mentoria", expert: "Equipe Demo", promessa: "Acompanhamento próximo para acelerar seus resultados.", preco: "1.997,00", tag: "Mentorias" },
    { id: "d1p3", nome: "Ebook C", categoria: "Ebook", expert: "Equipe Demo", promessa: "Um guia direto ao ponto para começar hoje.", preco: "47,00", tag: "Ebooks" },
    { id: "d1p4", nome: "Comunidade D", categoria: "Assinatura", expert: "Equipe Demo", promessa: "Conteúdo contínuo e uma rede para crescer junto.", preco: "97,00", tag: "Assinaturas" },
  ],
  campaigns: [
    { name: "[A] Curso | Conversão", investFrac: 0.34, clicks: 420, impr: 30000, conv: 24, ticket: 997, leads: 0 },
    { name: "[A] Mentoria | Lead Aplicação", investFrac: 0.26, clicks: 180, impr: 16000, conv: 9, ticket: 1997, leads: 48 },
    { name: "[A] Ebook | Captação", investFrac: 0.22, clicks: 520, impr: 34000, conv: 60, ticket: 47, leads: 80 },
    { name: "[A] Comunidade | Assinatura", investFrac: 0.18, clicks: 300, impr: 20000, conv: 20, ticket: 97, leads: 0 },
  ],
};

// demo-2 — Loja online (e-commerce, ticket baixo, volume alto)
const LOJA_THEME: Theme = {
  sourceLabel: "Meta Ads · Empresa Demo B (Dados Fictícios)",
  igBase: "lojademo",
  products: [
    { id: "lf1", nome: "Fone Bluetooth", categoria: "Eletrônicos", expert: "Loja Demo", promessa: "Áudio sem fio com bateria para o dia todo.", preco: "149,00", tag: "Eletrônicos" },
    { id: "lf2", nome: "Smartwatch", categoria: "Eletrônicos", expert: "Loja Demo", promessa: "Acompanhe suas atividades no pulso.", preco: "289,00", tag: "Eletrônicos" },
    { id: "lf3", nome: "Mochila Antifurto", categoria: "Acessórios", expert: "Loja Demo", promessa: "Praticidade e segurança no dia a dia.", preco: "199,00", tag: "Acessórios" },
    { id: "lf4", nome: "Camiseta Básica", categoria: "Vestuário", expert: "Loja Demo", promessa: "Conforto e caimento para o uso diário.", preco: "79,00", tag: "Vestuário" },
    { id: "lf5", nome: "Ebook 50 Dicas", categoria: "Ebook", expert: "Loja Demo", promessa: "Dicas práticas para aproveitar melhor os produtos.", preco: "27,00", tag: "Ebook" },
  ],
  campaigns: [
    { name: "[B] Fone | Conversão Catálogo", investFrac: 0.30, clicks: 520, impr: 34000, conv: 38, ticket: 149, leads: 0 },
    { name: "[B] Smartwatch | Conversão", investFrac: 0.22, clicks: 410, impr: 26000, conv: 30, ticket: 289, leads: 0 },
    { name: "[B] Acessórios | Retargeting", investFrac: 0.18, clicks: 220, impr: 15000, conv: 12, ticket: 199, leads: 0 },
    { name: "[B] Vestuário | Tráfego", investFrac: 0.14, clicks: 480, impr: 30000, conv: 18, ticket: 79, leads: 0 },
    { name: "[B] Ebook | Lead", investFrac: 0.10, clicks: 360, impr: 22000, conv: 44, ticket: 27, leads: 60 },
  ],
};

// demo-3 — Clínica de serviços (lead-gen, ticket alto)
const CLINICA_THEME: Theme = {
  sourceLabel: "Meta Ads · Empresa Demo C (Dados Fictícios)",
  igBase: "clinicademo",
  products: [
    { id: "ce1", nome: "Procedimento A", categoria: "Procedimentos", expert: "Dra. Helena Prado", promessa: "Resultado natural com segurança profissional.", preco: "1.200,00", tag: "Procedimentos" },
    { id: "ce2", nome: "Procedimento B", categoria: "Procedimentos", expert: "Dra. Helena Prado", promessa: "Atendimento personalizado com naturalidade.", preco: "1.500,00", tag: "Procedimentos" },
    { id: "ce3", nome: "Serviço Premium", categoria: "Procedimentos", expert: "Equipe Demo", promessa: "Protocolo profissional com acompanhamento.", preco: "350,00", tag: "Procedimentos" },
    { id: "ce4", nome: "Pacote Completo", categoria: "Pacotes", expert: "Dra. Helena Prado", promessa: "Protocolo completo em 3 sessões.", preco: "4.800,00", tag: "Pacotes" },
  ],
  campaigns: [
    { name: "[C] Procedimento A | Lead Agendamento", investFrac: 0.34, clicks: 180, impr: 16000, conv: 9, ticket: 1200, leads: 55 },
    { name: "[C] Procedimento B | Lead", investFrac: 0.26, clicks: 150, impr: 13000, conv: 7, ticket: 1500, leads: 42 },
    { name: "[C] Serviço Premium | Conversão", investFrac: 0.20, clicks: 260, impr: 18000, conv: 20, ticket: 350, leads: 30 },
    { name: "[C] Pacote | Lead Premium", investFrac: 0.20, clicks: 95, impr: 9000, conv: 4, ticket: 4800, leads: 22 },
  ],
};

// Mapa empresa → dataset. Todas geradas por tema neutro.
const DATASETS: Record<string, CompanyDataset> = {
  "demo-1": genDataset(DIGITAL_THEME),
  "demo-2": genDataset(LOJA_THEME),
  "demo-3": genDataset(CLINICA_THEME),
};

/** Dataset de uma empresa demo (fallback: demo-1). */
export function getCompanyDataset(companyId?: string | null): CompanyDataset {
  return DATASETS[companyId ?? ""] ?? DATASETS["demo-1"];
}

// ─── Seed function — grava dados fictícios no localStorage (por empresa) ────────

export function seedDemoData(companyId?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const ds = getCompanyDataset(companyId);
    localStorage.setItem("gsah_hist_rows_v2",            JSON.stringify(ds.historical));
    localStorage.setItem("gsah_hist_metas_v1",           JSON.stringify(ds.metas));
    localStorage.setItem("gsah_products_v1",             JSON.stringify(ds.products));
    localStorage.setItem("gsah_advertiser_profiles_v2",  JSON.stringify(ds.profiles));
    localStorage.setItem("gsah_onboarding_v1",           "1");
  } catch { /* unavailable */ }
}
