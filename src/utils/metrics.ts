import {
  AggregatedCampaign,
  BudgetDistributionPoint,
  CampaignComparisonPoint,
  CampaignData,
  DashboardTotals,
  DailyTrendPoint,
} from "@/types/campaign";

const safeDivide = (numerator: number, denominator: number, ctx?: string): number => {
  if (denominator === 0) {
    // Suspicious: positive numerator with zero denominator signals corrupted/missing data.
    if (numerator > 0 && ctx && process.env.NODE_ENV !== "production") {
      console.warn(`[safeDivide] ${ctx}: numerator=${numerator} but denominator=0`);
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
  const ctr = safeDivide(row.clicks, row.impressions, "ctr") * 100;
  const cpc = safeDivide(row.investment, row.clicks, "cpc");
  const cpa = safeDivide(row.investment, row.conversions, "cpa");
  const roas = safeDivide(row.revenue, row.investment, "roas");
  const conversionRate = safeDivide(row.conversions, row.clicks, "conversionRate") * 100;

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

  const roas = safeDivide(totals.totalRevenue, totals.totalInvestment, "roas");
  const roi = (roas - 1) * 100;
  // Derived metrics: ratio of sums (weighted average by volume),
  // NOT arithmetic mean of per-campaign rates.
  const cpa = safeDivide(totals.totalInvestment, totals.totalConversions, "cpa");
  const ctr = safeDivide(totals.totalClicks, totals.totalImpressions, "ctr") * 100;
  const conversionRate = safeDivide(totals.totalConversions, totals.totalClicks, "conversionRate") * 100;
  const cpc = safeDivide(totals.totalInvestment, totals.totalClicks, "cpc");
  const cpm = safeDivide(totals.totalInvestment, totals.totalImpressions, "cpm") * 1000;
  const cpl = safeDivide(totals.totalInvestment, totals.totalLeads, "cpl");

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
