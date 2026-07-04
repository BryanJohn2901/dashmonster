"use client";

import { useTheme } from "next-themes";

// ── Data viz palette — minimalista, poucas cores
// Regra: verde = dado principal; cinza = comparativo; teal/âmbar/rosa = categorias
export const PIE_COLORS_LIGHT = [
  "#16A34A", "#0D9488", "#F59E0B", "#15803D",
  "#E14D4D", "#64748B", "#22C55E", "#0F766E",
  "#D97706", "#94A3B8", "#4ADE80", "#475569",
];
export const PIE_COLORS_DARK = [
  "#22C55E", "#2DD4BF", "#FBBF24", "#4ADE80",
  "#F87171", "#94A3B8", "#16A34A", "#5EEAD4",
  "#FCD34D", "#CBD5E1", "#86EFAC", "#64748B",
];

// ─── Shared chart theme ────────────────────────────────────────────────────────

export function useChartTheme() {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return {
    dark,
    pieColors:   dark ? PIE_COLORS_DARK : PIE_COLORS_LIGHT,
    /* Primary series: verde de marca */
    c1: dark ? "#22C55E" : "#16A34A",   /* chart-primary */
    c2: dark ? "#8A8FAD" : "#A0A5B3",   /* chart-secondary (cinza — dado comparativo) */
    c3: dark ? "#22C55E" : "#1FA971",   /* chart-success */
    c4: dark ? "#EAB308" : "#F4A93C",   /* warning/investment */
    gridStroke:  dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)",
    tickFill:    dark ? "#6F7686" : "#9CA3AF",
    tooltipStyle: {
      contentStyle: {
        borderRadius: 14,
        border: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
        background: dark ? "rgba(13,16,26,0.92)" : "rgba(255,255,255,0.96)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.14)",
        fontSize: 12,
        padding: "8px 12px",
        color: dark ? "#F3F4F6" : "#151821",
      },
      cursor: { fill: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)" },
    },
  };
}

// Short "DD/MM" date label — no rotation needed.
// Datas vêm como "YYYY-MM-DD" (calendário puro, sem hora). `new Date(...)` parseia
// isso como UTC-midnight; ler com getDate()/getMonth() (locais) desloca o rótulo em
// -1 dia para fusos atrás de UTC (ex: Brasil). Usa getters UTC para preservar o dia exato.
export function shortDate(v: string): string {
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return String(v);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Smart interval: target ≤ 8 visible ticks
export function xInterval(length: number): number {
  if (length <= 8)  return 0;
  if (length <= 16) return 1;
  if (length <= 32) return Math.ceil(length / 7) - 1;
  if (length <= 90) return Math.ceil(length / 6) - 1;
  return Math.ceil(length / 5) - 1;
}
