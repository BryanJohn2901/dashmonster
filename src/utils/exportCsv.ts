import type { CampaignData, DashboardTotals } from "@/types/campaign";
import type { ManualOverrideStore } from "@/hooks/useManualMetrics";

interface ExportInput {
  campaigns: CampaignData[];
  totals:    DashboardTotals;
  dateFrom:  string;
  dateTo:    string;
  overrides: ManualOverrideStore;
}

export function exportDashboardCsv(input: ExportInput): void {
  const { campaigns, dateFrom, dateTo, overrides } = input;

  // BOM so Excel recognises UTF-8
  const BOM = "﻿";

  const period = `${dateFrom || "Início"} — ${dateTo || "Hoje"}`;

  const header = [
    "Campanha", "Data", "Período", "Origem",
    "Investimento", "Receita", "Conversões", "Leads",
    "ROAS", "CTR", "CPA", "CPL",
    "Cliques", "Impressões", "Observação",
  ].join(";");

  const rows = campaigns.map((c) => {
    const ov     = overrides[c.id];
    const origem = ov ? "MANUAL" : "API";
    const obs    = ov?.note ?? "";

    return [
      esc(c.campaignName),
      c.date,
      period,
      origem,
      br(c.investment),
      br(c.revenue),
      String(c.conversions),
      String(c.leads ?? 0),
      c.roas.toFixed(2),
      (c.ctr * 100).toFixed(2) + "%",
      c.conversions > 0 ? br(c.investment / c.conversions) : "—",
      (c.leads ?? 0) > 0 ? br(c.investment / (c.leads ?? 1)) : "—",
      String(c.clicks),
      String(c.impressions),
      esc(obs),
    ].join(";");
  });

  const csv  = BOM + [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `dashmonster-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function esc(s: string): string {
  if (/[;"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function br(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
