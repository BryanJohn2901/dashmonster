"use client";

import React from "react";
import { CalendarDays, Upload, PlusCircle } from "lucide-react";
import { Sk } from "./Skeleton";

interface HistoricoEmptyProps {
  onImportCsv: () => void;
  onAddManual: () => void;
}

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun"];
const GHOST_ROWS: { pct: number }[] = [{ pct: 28 }, { pct: 54 }, { pct: 72 }, { pct: 38 }];

export function HistoricoEmpty({ onImportCsv, onAddManual }: HistoricoEmptyProps) {
  return (
    <div
      className="mx-auto max-w-3xl"
      style={{ animation: "dm-fade-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both" }}
    >
      <div
        className="glass-panel relative overflow-hidden rounded-[1.75rem] p-6 sm:p-10"
        style={{ backgroundColor: "var(--dm-bg-surface)" }}
      >
        {/* Glow */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#16A34A]/10 blur-[80px]" />

        <div className="relative">
          {/* ── Header ── */}
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div
                className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-brand-500)" }}
              >
                <CalendarDays size={20} />
              </div>
              <div>
                <h2
                  className="text-lg font-extrabold tracking-tight"
                  style={{ fontFamily: "var(--font-display)", color: "var(--dm-text-primary)" }}
                >
                  Histórico de Performance
                </h2>
                <p className="mt-0.5 text-[13px]" style={{ color: "var(--dm-text-secondary)" }}>
                  Registre resultados mês a mês e acompanhe a evolução de cada lançamento.
                </p>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={onImportCsv}
                className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold text-white shadow-md transition-all hover:-translate-y-0.5"
                style={{ backgroundColor: "var(--dm-brand-500)" }}
              >
                <Upload size={14} />
                Importar CSV
              </button>
              <button
                type="button"
                onClick={onAddManual}
                className="flex items-center gap-1.5 rounded-xl border px-4 py-2 text-[13px] font-semibold transition-all hover:-translate-y-0.5 hover:shadow-sm"
                style={{
                  borderColor: "var(--dm-border-default)",
                  color: "var(--dm-text-primary)",
                  backgroundColor: "var(--dm-bg-elevated)",
                }}
              >
                <PlusCircle size={14} />
                Adicionar manualmente
              </button>
            </div>
          </div>

          {/* ── Ghost timeline ── */}
          <div
            className="pointer-events-none mt-8 select-none"
            style={{ opacity: 0.45, filter: "blur(0.4px)" }}
          >
            {/* Month ticks header */}
            <div className="mb-4 flex items-center gap-0 pl-[72px]">
              {MONTHS.map((m) => (
                <div key={m} className="flex-1 text-center">
                  <span
                    className="text-[10px] font-semibold uppercase"
                    style={{ color: "var(--dm-text-tertiary)" }}
                  >
                    {m}
                  </span>
                </div>
              ))}
            </div>

            {/* Data rows */}
            <div className="flex flex-col gap-4">
              {GHOST_ROWS.map((row, i) => (
                <div key={i} className="flex items-center gap-3">
                  {/* Product label placeholder */}
                  <div className="w-[64px] flex-shrink-0">
                    <Sk w="100%" h="9px" />
                    <Sk w="70%" h="7px" className="mt-1.5" />
                  </div>
                  {/* Bar */}
                  <div
                    className="h-5 flex-1 overflow-hidden rounded-full"
                    style={{ backgroundColor: "var(--dm-border-default)" }}
                  >
                    <div
                      className="h-full rounded-full animate-pulse"
                      style={{
                        width: `${row.pct}%`,
                        background: "linear-gradient(90deg, var(--dm-brand-500), var(--dm-brand-400, #22C55E))",
                        opacity: 0.35,
                        animationDelay: `${i * 180}ms`,
                      }}
                    />
                  </div>
                  {/* Value placeholder */}
                  <div className="w-10 flex-shrink-0 text-right">
                    <Sk w="100%" h="9px" />
                  </div>
                </div>
              ))}
            </div>

            {/* Ghost axis line */}
            <div
              className="mt-4 h-px w-full"
              style={{ backgroundColor: "var(--dm-border-default)" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
