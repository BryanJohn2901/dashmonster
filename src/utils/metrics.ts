import {
  AggregatedCampaign,
  BudgetDistributionPoint,
  CampaignComparisonPoint,
  CampaignData,
  DashboardTotals,
  DailyTrendPoint,
} from "@/types/campaign";
import type { ManualOverrideStore } from "@/hooks/useManualMetrics";

const safeDivide = (numerator: number, denominator: number, ctx?: string): number => {
  if (denominator === 0) {
    if (numerator > 0 && ctx && process.env.NODE_ENV !== "production") {
      console.warn(`[safeDivide] ${ctx}: num=${numerator} but den=0`);
    }
    return 0;
  }
  return numerator / denominator;
};

export const calculateDerivedMetrics = (
  row: Omit<
    CampaignData,
    "id" | "ctr" | "cpc" | "cpa" | "roas" | "conversionRate"
  >,
  index: number,
): CampaignData => {
  const ctr = safeDivide(row.clicks, row.impressions) * 100;
  const cpc = safeDivide(row.investment, row.clicks);
  const cpa = safeDivide(row.investment, row.conversions);
  const roas = safeDivide(row.revenue, row.investment);
  const conversionRate = safeDivide(row.conversions, row.clicks) * 100;

  return {
    ...row,
    id: `${row.campaignName}-${row.date}-${index}`,
    ctr,
    cpc,
    cpa,
    roas,
    conversionRate,
  };
};

export const aggregateTotals = (campaigns: CampaignData[]): DashboardTotals => {
  const totals = campaigns.reduce(
    (acc, campaign) => {
      acc.totalInvestment += campaign.investment;
      acc.totalRevenue += campaign.revenue;
      acc.totalClicks += campaign.clicks;
      acc.totalImpressions += campaign.impressions;
      acc.totalConversions += campaign.conversions;
      acc.totalLeads += campaign.leads ?? 0;
      return acc;
    },
    {
      totalInvestment: 0,
      totalRevenue: 0,
      totalClicks: 0,
      totalImpressions: 0,
      totalConversions: 0,
      totalLeads: 0,
    },
  );

  const roas = safeDivide(totals.totalRevenue, totals.totalInvestment);
  const roi = (roas - 1) * 100;
  const cpa = safeDivide(totals.totalInvestment, totals.totalConversions);
  const ctr = safeDivide(totals.totalClicks, totals.totalImpressions) * 100;
  const conversionRate = safeDivide(totals.totalConversions, totals.totalClicks) * 100;
  const cpc = safeDivide(totals.totalInvestment, totals.totalClicks);
  const cpm = safeDivide(totals.totalInvestment, totals.totalImpressions) * 1000;
  const cpl = safeDivide(totals.totalInvestment, totals.totalLeads);

  return {
    ...totals,
    roi,
    roas,
    cpa,
    ctr,
    conversionRate,
    cpc,
    cpm,
    cpl,
  };
};

export const buildDailyTrend = (campaigns: CampaignData[]): DailyTrendPoint[] => {
  const map = new Map<string, DailyTrendPoint>();

  campaigns.forEach((campaign) => {
    const current = map.get(campaign.date) ?? {
      date: campaign.date,
      clicks: 0,
      conversions: 0,
      investment: 0,
    };

    current.clicks += campaign.clicks;
    current.conversions += campaign.conversions;
    current.investment += campaign.investment;
    map.set(campaign.date, current);
  });

  return Array.from(map.values()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
};

export const buildCampaignComparison = (
  campaigns: CampaignData[],
): CampaignComparisonPoint[] => {
  const map = new Map<string, CampaignComparisonPoint>();

  campaigns.forEach((campaign) => {
    const current = map.get(campaign.campaignName) ?? {
      campaignName: campaign.campaignName,
      investment: 0,
      revenue: 0,
    };

    current.investment += campaign.investment;
    current.revenue += campaign.revenue;
    map.set(campaign.campaignName, current);
  });

  return Array.from(map.values()).sort((a, b) => b.investment - a.investment);
};

export const buildBudgetDistribution = (
  campaigns: CampaignData[],
): BudgetDistributionPoint[] => {
  return buildCampaignComparison(campaigns).map((item) => ({
    campaignName: item.campaignName,
    investment: item.investment,
  }));
};

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
};

export const formatNumber = (value: number): string => {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0,
  }).format(value);
};

export const formatPercent = (value: number): string => {
  return (
    value.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + "%"
  );
};

export const aggregateByCampaign = (campaigns: CampaignData[]): AggregatedCampaign[] => {
  const map = new Map<string, Omit<AggregatedCampaign, "roas" | "roi" | "ctr" | "cpa" | "conversionRate">>();

  campaigns.forEach((c) => {
    const current = map.get(c.campaignName) ?? {
      campaignName: c.campaignName,
      investment: 0,
      revenue: 0,
      clicks: 0,
      impressions: 0,
      conversions: 0,
    };
    current.investment += c.investment;
    current.revenue += c.revenue;
    current.clicks += c.clicks;
    current.impressions += c.impressions;
    current.conversions += c.conversions;
    map.set(c.campaignName, current);
  });

  return Array.from(map.values()).map((agg) => ({
    ...agg,
    roas: safeDivide(agg.revenue, agg.investment),
    roi: (safeDivide(agg.revenue, agg.investment) - 1) * 100,
    ctr: safeDivide(agg.clicks, agg.impressions) * 100,
    cpa: safeDivide(agg.investment, agg.conversions),
    conversionRate: safeDivide(agg.conversions, agg.clicks) * 100,
  }));
};

export const formatDatePtBr = (value: string): string => {
  const parsedDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR").format(parsedDate);
};

/**
 * Applies manual overrides to campaigns where the API returned 0 for a metric.
 * Only substitutes when the API value is 0 and an override exists.
 */
export function applyOverrides(
  campaigns: CampaignData[],
  overrides: ManualOverrideStore,
): CampaignData[] {
  return campaigns.map((c) => {
    const ov = overrides[c.id];
    if (!ov) return c;

    const apply = (apiVal: number, overrideVal: number | undefined) =>
      apiVal === 0 && overrideVal !== undefined ? overrideVal : apiVal;

    const conversions = apply(c.conversions, ov.conversions);
    const leads       = apply(c.leads ?? 0, ov.leads);
    const revenue     = apply(c.revenue, ov.revenue);
    return {
      ...c,
      conversions,
      leads,
      revenue,
      cpa:            conversions > 0 ? c.investment / conversions : 0,
      roas:           c.investment > 0 ? revenue / c.investment : 0,
      conversionRate: c.clicks > 0 ? (conversions / c.clicks) * 100 : 0,
    };
  });
}
