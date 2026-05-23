"use client";

import React from "react";
import { BarChart2, Upload } from "lucide-react";
import { Sk } from "./Skeleton";

interface AnaliseEmptyProps {
  onImport: () => void;
}

export function AnaliseEmpty({ onImport }: AnaliseEmptyProps) {
  return (
    <div
      className="mx-auto max-w-4xl"
      style={{ animation: "dm-fade-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both" }}
    >
      <div
        className="glass-panel relative overflow-hidden rounded-[1.75rem] p-6 sm:p-10"
        style={{ backgroundColor: "var(--dm-bg-surface)" }}
      >
        {/* Glow */}
        <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-blue-500/10 blur-[80px]" />
        <div className="pointer-events-none absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-violet-500/8 blur-[80px]" />

        <div className="relative flex flex-col gap-10 sm:flex-row sm:items-start sm:gap-12">
          {/* ── Left column ── */}
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            <div className="flex items-start gap-3">
              <div
                className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-brand-500)" }}
              >
                <BarChart2 size={20} />
              </div>
              <div>
                <h2
                  className="text-xl font-extrabold tracking-tight"
                  style={{ fontFamily: "var(--font-display)", color: "var(--dm-text-primary)" }}
                >
                  Análise de Campanhas
                </h2>
                <p className="mt-1 text-[13px]" style={{ color: "var(--dm-text-secondary)" }}>
                  Diagnósticos automáticos, score de saúde e oportunidades de melhoria para cada campanha.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onImport}
              className="flex w-fit items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-semibold text-white shadow-md transition-all hover:-translate-y-0.5"
              style={{ backgroundColor: "var(--dm-brand-500)" }}
            >
              <Upload size={14} />
              Importar dados
            </button>
          </div>

          {/* ── Right column — ghost rows ── */}
          <div className="hidden w-64 flex-shrink-0 flex-col gap-2 opacity-50 sm:flex">
            <p
              className="mb-1 text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--dm-text-tertiary)" }}
            >
              Prévia da análise
            </p>

            {/* Ghost campaign rows */}
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl border p-3"
                style={{
                  borderColor: "var(--dm-border-default)",
                  backgroundColor: "var(--dm-bg-elevated)",
                  animationDelay: `${i * 100}ms`,
                }}
              >
                {/* Score circle */}
                <Sk w="36px" h="36px" className="rounded-full flex-shrink-0" />
                {/* Name + sub */}
                <div className="flex-1 min-w-0">
                  <Sk w="55%" h="10px" />
                  <Sk w="35%" h="8px" className="mt-1.5" />
                </div>
                {/* Score badge */}
                <Sk w="32px" h="24px" className="rounded-lg flex-shrink-0" />
              </div>
            ))}

            {/* Ghost diagnosis card */}
            <div
              className="mt-1 rounded-xl border p-3"
              style={{
                borderColor: "var(--dm-border-default)",
                backgroundColor: "var(--dm-bg-elevated)",
              }}
            >
              <Sk w="45%" h="9px" />
              <Sk w="80%" h="7px" className="mt-2.5" />
              <Sk w="72%" h="7px" className="mt-1.5" />
              <Sk w="60%" h="7px" className="mt-1.5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
