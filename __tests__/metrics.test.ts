import { aggregateByOrigin, aggregateTotals } from "@/utils/metrics";
import type { CampaignData } from "@/types/campaign";

const row = (over: Partial<CampaignData>): CampaignData => ({
  id: Math.random().toString(36).slice(2),
  date: "2026-06-01",
  campaignName: "c",
  investment: 0,
  clicks: 0,
  impressions: 0,
  conversions: 0,
  leads: 0,
  revenue: 0,
  ctr: 0,
  cpc: 0,
  cpa: 0,
  roas: 0,
  conversionRate: 0,
  ...over,
});

describe("aggregateByOrigin", () => {
  it("agrupa leads por canal: Meta (source) + origem explícita", () => {
    const campaigns = [
      row({ source: "meta", leads: 150 }),                 // → "Meta Ads"
      row({ source: "sheet", origem: "Google", leads: 50 }),
      row({ source: "sheet", origem: "Orgânico", leads: 30 }),
      row({ source: "sheet", origem: "Orgânico", leads: 20 }), // soma com a anterior
    ];

    const breakdown = aggregateByOrigin(campaigns);
    const byOrigin = Object.fromEntries(breakdown.map((b) => [b.origem, b.leads]));

    expect(byOrigin["Meta Ads"]).toBe(150);
    expect(byOrigin["Google"]).toBe(50);
    expect(byOrigin["Orgânico"]).toBe(50);
    // ordenado por leads desc
    expect(breakdown[0].origem).toBe("Meta Ads");
  });

  it("derive origem de eduzz e separa receita por canal", () => {
    const campaigns = [
      row({ source: "meta", revenue: 1000, investment: 200 }),
      row({ source: "eduzz", revenue: 500 }),
    ];
    const breakdown = aggregateByOrigin(campaigns);
    const eduzz = breakdown.find((b) => b.origem === "Eduzz");
    const meta = breakdown.find((b) => b.origem === "Meta Ads");
    expect(eduzz?.revenue).toBe(500);
    expect(eduzz?.investment).toBe(0);
    expect(meta?.revenue).toBe(1000);
  });
});

describe("aggregateTotals", () => {
  it("inclui sourceBreakdown e mantém ROAS sobre o total (orgânico não polui)", () => {
    const campaigns = [
      row({ source: "meta", investment: 100, revenue: 300, leads: 10 }),
      row({ source: "sheet", origem: "Orgânico", leads: 40 }), // sem investimento
    ];
    const totals = aggregateTotals(campaigns);
    expect(totals.totalLeads).toBe(50);
    expect(totals.totalInvestment).toBe(100);
    expect(totals.roas).toBeCloseTo(3);
    expect(totals.sourceBreakdown.length).toBe(2);
  });
});
