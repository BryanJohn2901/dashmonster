"use client";

import { useTheme } from "next-themes";

// ── Data viz palette — minimalista, poucas cores
// Regra: azul/roxo = dado principal; cinza = comparativo; verde/vermelho = semântico
export const PIE_COLORS_LIGHT = [
  "#313491", "#4A4FCC", "#6E72FF", "#A5A8FF",
  "#1FA971", "#F4A93C", "#E14D4D", "#8A8FAD",
  "#D6D8FF", "#6F7482", "#0891b2", "#A0A5B3",
];
export const PIE_COLORS_DARK = [
  "#6C70FF", "#8A8FCC", "#A5A8FF", "#C4C6FF",
  "#22C55E", "#EAB308", "#EF4444", "#8A8FAD",
  "#D6D8FF", "#6F7686", "#22D3EE", "#A0A5B3",
];

// ─── Shared chart theme ────────────────────────────────────────────────────────

export function useChartTheme() {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return {
    dark,
    pieColors:   dark ? PIE_COLORS_DARK : PIE_COLORS_LIGHT,
    /* Primary series: nova paleta minimalista */
    c1: dark ? "#6C70FF" : "#313491",   /* chart-primary */
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

// Short "DD/MM" date label — no rotation needed
export function shortDate(v: string): string {
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return String(v);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Smart interval: target ≤ 8 visible ticks
export function xInterval(length: number): number {
  if (length <= 8)  return 0;
  if (length <= 16) return 1;
  if (length <= 32) return Math.ceil(length / 7) - 1;
  if (length <= 90) return Math.ceil(length / 6) - 1;
  return Math.ceil(length / 5) - 1;
}
