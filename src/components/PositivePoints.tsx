"use client";

import { useMemo } from "react";
import { Award, Star, TrendingUp, Zap } from "lucide-react";
import { AggregatedCampaign } from "@/types/campaign";
import { formatCurrency, formatPercent } from "@/utils/metrics";

interface PositivePointsProps {
  campaigns: AggregatedCampaign[];
}

interface TopListProps {
  title: string;
  subtitle: string;
  icon: React.ElementType;
  items: AggregatedCampaign[];
  metricLabel: string;
  metricValue: (c: AggregatedCampaign) => string;
  badgeColor: string;
}

function TopList({ title, subtitle, icon: Icon, items, metricLabel, metricValue, badgeColor }: TopListProps) {
  if (items.length === 0) return null;

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Icon size={18} className={badgeColor} />
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      <ol className="space-y-2">
        {items.map((c, idx) => (
          <li key={c.campaignName} className="flex items-center gap-3">
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${idx === 0 ? "bg-amber-100 text-amber-700" : idx === 1 ? "bg-slate-100 text-slate-600" : "bg-slate-50 text-slate-500"}`}>
              {idx + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-slate-800">{c.campaignName}</p>
              <p className="text-xs text-slate-500">
                Invest.: {formatCurrency(c.investment)} · Receita: {formatCurrency(c.revenue)}
              </p>
            </div>
            <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${badgeColor === "text-emerald-600" ? "bg-emerald-50 text-emerald-700" : badgeColor === "text-slate-600" ? "bg-slate-100 text-slate-700" : "bg-[#16A34A]/10 text-[#15803D]"}`}>
              {metricLabel}: {metricValue(c)}
            </span>
          </li>
        ))}
      </ol>
    </article>
  );
}

export function PositivePoints({ campaigns }: PositivePointsProps) {
  const topRoas = useMemo(
    () =>
      [...campaigns]
        .filter((c) => c.roas >= 2 && c.investment > 50)
        .sort((a, b) => b.roas - a.roas)
        .slice(0, 5),
    [campaigns],
  );

  const topCtr = useMemo(
    () =>
      [...campaigns]
        .filter((c) => c.ctr >= 1 && c.impressions > 500)
        .sort((a, b) => b.ctr - a.ctr)
        .slice(0, 5),
    [campaigns],
  );

  const topConversion = useMemo(
    () =>
      [...campaigns]
        .filter((c) => c.conversionRate >= 2 && c.clicks > 50)
        .sort((a, b) => b.conversionRate - a.conversionRate)
        .slice(0, 5),
    [campaigns],
  );

  const topRevenue = useMemo(
    () =>
      [...campaigns]
        .filter((c) => c.revenue > 0)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5),
    [campaigns],
  );

  const hasAny = topRoas.length > 0 || topCtr.length > 0 || topConversion.length > 0;

  if (!hasAny) {
    return (
      <article className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-slate-500">
          Nenhum destaque positivo nos filtros atuais. Tente ampliar o período ou os lançamentos.
        </p>
      </article>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TopList
        title="Melhor ROAS"
        subtitle="Maior retorno sobre investimento (≥ 2x)"
        icon={TrendingUp}
        items={topRoas}
        metricLabel="ROAS"
        metricValue={(c) => `${c.roas.toFixed(2)}x`}
        badgeColor="text-emerald-600"
      />
      <TopList
        title="Maior Receita Gerada"
        subtitle="Campanhas que mais converteram em valor"
        icon={Award}
        items={topRevenue}
        metricLabel="Receita"
        metricValue={(c) => formatCurrency(c.revenue)}
        badgeColor="text-emerald-600"
      />
      <TopList
        title="Melhor CTR"
        subtitle="Alta taxa de cliques — criativo engaja (≥ 1%)"
        icon={Zap}
        items={topCtr}
        metricLabel="CTR"
        metricValue={(c) => formatPercent(c.ctr)}
        badgeColor="text-slate-600"
      />
      <TopList
        title="Melhor Taxa de Conversão"
        subtitle="Cliques que viram compras (≥ 2%)"
        icon={Star}
        items={topConversion}
        metricLabel="Conv."
        metricValue={(c) => formatPercent(c.conversionRate)}
        badgeColor="text-[#15803D]"
      />
    </div>
  );
}
