"use client";

import React from "react";
import { ArrowRight, Link2, Settings2, TrendingUp, Upload } from "lucide-react";
import { Sk } from "./Skeleton";

interface DashboardWelcomeProps {
  onOpenControlPanel?: () => void;
  onSelectTab: (tab: "meta" | "sheets" | "csv") => void;
}

const connectors = [
  {
    tab: "meta" as const,
    icon: Settings2,
    label: "Meta Ads",
    sub: "Dados em tempo real direto da sua conta",
    recommended: true,
  },
  {
    tab: "sheets" as const,
    icon: Link2,
    label: "Google Sheets",
    sub: "Planilha compartilhada como fonte de dados",
    recommended: false,
  },
  {
    tab: "csv" as const,
    icon: Upload,
    label: "Arquivo CSV",
    sub: "Relatório exportado do Gerenciador de Anúncios",
    recommended: false,
  },
];

export function DashboardWelcome({ onOpenControlPanel, onSelectTab }: DashboardWelcomeProps) {
  return (
    <div
      className="mx-auto max-w-4xl"
      style={{ animation: "dm-fade-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both" }}
    >
      <div
        className="glass-panel relative overflow-hidden rounded-[1.75rem] p-6 sm:p-10"
        style={{ backgroundColor: "var(--dm-bg-surface)" }}
      >
        {/* Background glows */}
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#16A34A]/10 blur-[80px]" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-emerald-500/[0.06] blur-[80px]" />

        <div className="relative flex flex-col gap-10 sm:flex-row sm:items-start sm:gap-12">
          {/* ── Left column ── */}
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            {/* Hero */}
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#16A34A] to-[#15803D] shadow-lg shadow-[#16A34A]/25">
                <TrendingUp size={24} className="text-white" strokeWidth={2} />
              </div>
              <div>
                <h2
                  className="text-xl font-extrabold tracking-tight sm:text-2xl"
                  style={{ fontFamily: "var(--font-display)", color: "var(--dm-text-primary)" }}
                >
                  Bem-vindo ao DashMonster
                </h2>
                <p className="text-[13px]" style={{ color: "var(--dm-text-secondary)" }}>
                  Conecte uma fonte de dados para começar a analisar suas campanhas.
                </p>
              </div>
            </div>

            {/* Connector cards */}
            <div className="flex flex-col gap-2.5">
              {connectors.map(({ tab, icon: Icon, label, sub, recommended }) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    if (tab === "meta" && onOpenControlPanel) {
                      onOpenControlPanel();
                    } else {
                      onSelectTab(tab);
                    }
                  }}
                  className="group flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
                  style={{
                    borderColor: "var(--dm-border-default)",
                    backgroundColor: "var(--dm-bg-elevated)",
                  }}
                >
                  <div
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-colors group-hover:bg-[#16A34A]/10 dark:group-hover:bg-[#16A34A]/20"
                    style={{ backgroundColor: "var(--dm-bg-surface)" }}
                  >
                    <Icon size={18} style={{ color: "var(--dm-brand-500)" }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[13px] font-semibold"
                        style={{ color: "var(--dm-text-primary)" }}
                      >
                        {label}
                      </span>
                      {recommended && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold leading-none text-white"
                          style={{ backgroundColor: "var(--dm-brand-500)" }}
                        >
                          Recomendado
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
                      {sub}
                    </p>
                  </div>
                  <ArrowRight
                    size={14}
                    className="flex-shrink-0 opacity-30 transition-opacity group-hover:opacity-70"
                    style={{ color: "var(--dm-text-secondary)" }}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* ── Right column — ghost KPI grid ── */}
          <div className="hidden w-56 flex-shrink-0 flex-col gap-3 opacity-50 sm:flex">
            <p
              className="mb-1 text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--dm-text-tertiary)" }}
            >
              Prévia do painel
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-2xl border p-3"
                  style={{
                    borderColor: "var(--dm-border-default)",
                    backgroundColor: "var(--dm-bg-surface)",
                  }}
                >
                  <Sk w="45%" h="8px" />
                  <Sk w="65%" h="26px" className="mt-2" />
                  <Sk w="35%" h="7px" className="mt-2.5" />
                </div>
              ))}
            </div>
            {/* ghost sparkline */}
            <div
              className="mt-1 rounded-2xl border p-3"
              style={{
                borderColor: "var(--dm-border-default)",
                backgroundColor: "var(--dm-bg-surface)",
              }}
            >
              <Sk w="50%" h="8px" />
              <div className="mt-3 flex items-end gap-1">
                {[40, 65, 50, 80, 60, 90, 70].map((pct, i) => (
                  <div
                    key={i}
                    className="flex-1 animate-pulse rounded-sm"
                    style={{
                      height: `${pct * 0.4}px`,
                      backgroundColor: "var(--dm-border-default)",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
