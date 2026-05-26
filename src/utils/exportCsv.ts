import type { CampaignData } from "@/types/campaign";
import type { DashboardTotals } from "@/types/campaign";

// ─── Column definitions ───────────────────────────────────────────────────────

interface CsvColumn {
  header: string;
  getValue: (row: CampaignData) => string | number;
}

const CAMPAIGN_COLUMNS: CsvColumn[] = [
  { header: "Data",          getValue: (r) => r.date },
  { header: "Campanha",      getValue: (r) => r.campaignName },
  { header: "Investimento",  getValue: (r) => r.investment.toFixed(2) },
  { header: "Receita",       getValue: (r) => r.revenue.toFixed(2) },
  { header: "Impressões",    getValue: (r) => r.impressions },
  { header: "Cliques",       getValue: (r) => r.clicks },
  { header: "Conversões",    getValue: (r) => r.conversions },
  { header: "Leads",         getValue: (r) => r.leads ?? 0 },
  { header: "ROAS",          getValue: (r) => r.roas.toFixed(4) },
  { header: "ROI (%)",       getValue: (r) => ((r.roas - 1) * 100).toFixed(2) },
  { header: "CTR (%)",       getValue: (r) => r.ctr.toFixed(4) },
  { header: "CPC",           getValue: (r) => r.cpc.toFixed(4) },
  { header: "CPA",           getValue: (r) => r.cpa.toFixed(4) },
  { header: "Tx. Conv. (%)", getValue: (r) => r.conversionRate.toFixed(4) },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeCsvCell(value: string | number): string {
  const str = String(value);
  // Wrap in quotes if cell contains comma, quote, or newline
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvString(headers: string[], rows: (string | number)[][]): string {
  const lines: string[] = [headers.map(escapeCsvCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(","));
  }
  return lines.join("\r\n");
}

function triggerDownload(csvContent: string, filename: string): void {
  // BOM for Excel UTF-8 compatibility
  const bom = "﻿";
  const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Downloads campaign rows as a CSV file.
 * Filename encodes the date range if provided.
 */
export function exportCampaignsCsv(
  campaigns: CampaignData[],
  opts?: { dateFrom?: string; dateTo?: string; label?: string },
): void {
  const headers = CAMPAIGN_COLUMNS.map((c) => c.header);
  const rows = campaigns.map((c) => CAMPAIGN_COLUMNS.map((col) => col.getValue(c)));

  const parts = ["dashmonster_campanhas"];
  if (opts?.label) parts.push(opts.label.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40));
  if (opts?.dateFrom) parts.push(opts.dateFrom);
  if (opts?.dateTo) parts.push(opts.dateTo);
  const filename = `${parts.join("_")}.csv`;

  triggerDownload(buildCsvString(headers, rows), filename);
}

/**
 * Downloads the aggregated totals row as a CSV file.
 */
export function exportTotalsCsv(
  totals: DashboardTotals,
  opts?: { dateFrom?: string; dateTo?: string; label?: string },
): void {
  const headers = [
    "Investimento Total", "Receita Total", "Impressões", "Cliques",
    "Conversões", "Leads", "ROAS", "ROI (%)", "CTR (%)", "CPC", "CPA", "CPM", "CPL",
    "Tx. Conv. (%)",
  ];
  const rows = [[
    totals.totalInvestment.toFixed(2),
    totals.totalRevenue.toFixed(2),
    totals.totalImpressions,
    totals.totalClicks,
    totals.totalConversions,
    totals.totalLeads,
    totals.roas.toFixed(4),
    totals.roi.toFixed(2),
    totals.ctr.toFixed(4),
    totals.cpc.toFixed(4),
    totals.cpa.toFixed(4),
    totals.cpm.toFixed(4),
    totals.cpl.toFixed(4),
    totals.conversionRate.toFixed(4),
  ]];

  const parts = ["dashmonster_totais"];
  if (opts?.label) parts.push(opts.label.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40));
  if (opts?.dateFrom) parts.push(opts.dateFrom);
  if (opts?.dateTo) parts.push(opts.dateTo);
  const filename = `${parts.join("_")}.csv`;

  triggerDownload(buildCsvString(headers, rows), filename);
}
