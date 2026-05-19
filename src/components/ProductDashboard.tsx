"use client";

import { useMemo } from "react";
import { ArrowLeft, Activity, BadgeDollarSign, MousePointerClick, Target, TrendingUp, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { CampaignData } from "@/types/campaign";
import { aggregateTotals, formatCurrency, formatNumber, formatPercent } from "@/utils/metrics";
import { KpiCard } from "@/components/KpiCard";
import { FunnelCard } from "@/components/FunnelCard";
import { CampaignTable } from "@/components/CampaignTable";
import { useMetricVisibility } from "@/hooks/useMetricVisibility";


const SLUG_META: Record<string, { name: string; emoji: string; description: string }> = {
  pos:       { name: "Pós-graduação", emoji: "🎓", description: "Campanhas de pós-graduação" },
  livros:    { name: "Livros",        emoji: "📚", description: "Campanhas de livros físicos" },
  ebooks:    { name: "Ebooks",        emoji: "📱", description: "Campanhas de e-books" },
  perpetuo:  { name: "Perpétuo",      emoji: "♾️",  description: "Campanhas de acesso perpétuo" },
  eventos:   { name: "Eventos",       emoji: "🎫", description: "Campanhas de eventos" },
};

interface ProductDashboardProps {
  slug: string;
  campaigns: CampaignData[];
}

export function ProductDashboard({ slug, campaigns }: ProductDashboardProps) {
  const meta = SLUG_META[slug] ?? { name: slug, emoji: "📊", description: "Produto personalizado" };
  const totals = useMemo(() => aggregateTotals(campaigns), [campaigns]);
  const { isVisible: isMetricVisible } = useMetricVisibility();

  if (campaigns.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
        <span className="text-5xl">{meta.emoji}</span>
        <h1 className="text-xl font-bold" style={{ color: "var(--dm-text-primary)" }}>{meta.name}</h1>
        <p className="text-sm" style={{ color: "var(--dm-text-tertiary)" }}>
          Nenhuma campanha encontrada para este produto no período selecionado.
        </p>
        <Link href="/" className="rounded-lg border px-4 py-2 text-sm font-semibold hover:opacity-80 transition-opacity"
          style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
          ← Voltar ao Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--dm-bg-base)" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-20 border-b px-4 py-3"
        style={{ backgroundColor: "var(--dm-bg-card)", borderColor: "var(--dm-border-default)" }}
      >
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-70"
            style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}
          >
            <ArrowLeft size={12} />
            Dashboard
          </Link>
          <span className="text-xl leading-none">{meta.emoji}</span>
          <div>
            <h1 className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>{meta.name}</h1>
            <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
              {campaigns.length} campanha{campaigns.length !== 1 ? "s" : ""} · {meta.description}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <KpiCard
            title="Total Investido" value={formatCurrency(totals.totalInvestment)}
            subtitle={`${campaigns.length} campanhas`}
            icon={Wallet} accentColor="blue"
          />
          <KpiCard
            title="Receita Total" value={formatCurrency(totals.totalRevenue)}
            subtitle={`ROAS: ${totals.roas.toFixed(2)}x`}
            icon={BadgeDollarSign} accentColor="emerald"
          />
          <KpiCard
            title="ROAS" value={`${totals.roas.toFixed(2)}x`}
            subtitle={undefined}
            icon={TrendingUp} accentColor="violet"
          />
          <KpiCard
            title="Conversões" value={formatNumber(totals.totalConversions)}
            subtitle={`Tx: ${formatPercent(totals.averageConversionRate)}`}
            icon={Target} accentColor="amber"
          />
          {totals.totalLeads > 0 && (
            <KpiCard
              title="Leads" value={formatNumber(totals.totalLeads)}
              subtitle={`CPL: ${formatCurrency(totals.averageCpl)}`}
              icon={Users} accentColor="violet"
            />
          )}
          <KpiCard
            title="Cliques" value={formatNumber(totals.totalClicks)}
            subtitle={`CTR: ${formatPercent(totals.averageCtr)}`}
            icon={MousePointerClick} accentColor="blue"
          />
          <KpiCard
            title="Impressões" value={formatNumber(totals.totalImpressions)}
            subtitle={undefined}
            icon={Activity} accentColor="blue"
          />
        </div>

        {/* Funnel */}
        <FunnelCard
          impressions={totals.totalImpressions}
          clicks={totals.totalClicks}
          conversions={totals.totalConversions}
          investment={totals.totalInvestment}
          leads={totals.totalLeads}
          storageScope={`produto-${slug}`}
        />

        {/* Campaign table */}
        <CampaignTable campaigns={campaigns} isMetricVisible={isMetricVisible} />
      </main>
    </div>
  );
}
