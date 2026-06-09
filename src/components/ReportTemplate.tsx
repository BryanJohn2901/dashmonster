"use client";

import { Sparkles } from "lucide-react";
import type { ReportData, ReportAccent } from "@/types/report";

export const REPORT_WIDTH = 1080;

// Acentos semânticos (legíveis em light e dark). Valor neutro usa token de texto.
const ACCENT_HEX: Record<ReportAccent, string> = {
  brand: "#6366C8",
  green: "#0EA66E",
  rose:  "#E5484D",
  amber: "#D9870B",
  sky:   "#0E8FD9",
  slate: "var(--dm-text-primary)",
};

interface ReportTemplateProps {
  data: ReportData;
  hiddenIds?: Set<string>;
  generatedAt: string;
  innerRef?: React.Ref<HTMLDivElement>;
}

/**
 * Layout do relatório — usa tokens de tema (var(--dm-...)) para respeitar
 * light/dark. Distribuição em grade fixa (4 colunas), ritmo de espaçamento
 * consistente. É o mesmo nó renderizado na prévia e capturado no export.
 */
export function ReportTemplate({ data, hiddenIds, generatedAt, innerRef }: ReportTemplateProps) {
  const hidden = hiddenIds ?? new Set<string>();

  const page    = "var(--dm-bg-page, #0b1437)";
  const surface = "var(--dm-bg-surface, #111c44)";
  const border  = "var(--dm-border-subtle, rgba(255,255,255,0.08))";
  const tPri     = "var(--dm-text-primary, #fff)";
  const tSec     = "var(--dm-text-secondary, #A3AED0)";
  const tTer     = "var(--dm-text-tertiary, #707EAE)";

  const funnelSteps = data.funnel?.steps.filter((s) => !hidden.has(s.id)) ?? [];
  const maxFunnel = Math.max(1, ...funnelSteps.map((s) => parseLoose(s.value)));

  const labelCls: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: tTer, margin: "0 0 12px" };

  return (
    <div ref={innerRef} style={{ width: REPORT_WIDTH, background: page, padding: 32, fontFamily: "var(--font-poppins), Poppins, system-ui, sans-serif", color: tPri, boxSizing: "border-box" }}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, borderRadius: 18, padding: "20px 24px", marginBottom: 28, background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)", boxShadow: "0 8px 24px rgba(49,52,145,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", height: 46, width: 46, alignItems: "center", justifyContent: "center", borderRadius: 13, background: "rgba(255,255,255,0.16)" }}>
            <Sparkles size={22} color="#fff" />
          </div>
          <div>
            <p style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.1, margin: 0, color: "#fff" }}>{data.title || "Relatório"}</p>
            <p style={{ fontSize: 12, opacity: 0.88, margin: "5px 0 0", color: "#fff" }}>DashMonster · {data.period}</p>
          </div>
        </div>
        <p style={{ fontSize: 11, opacity: 0.78, margin: 0, color: "#fff", textAlign: "right" }}>Gerado em<br />{generatedAt}</p>
      </div>

      {/* Grupos */}
      {data.groups.map((g) => {
        const items = g.items.filter((it) => !hidden.has(it.id));
        if (items.length === 0) return null;
        return (
          <div key={g.id} style={{ marginBottom: 24 }}>
            <p style={labelCls}>{g.label}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
              {items.map((it) => {
                const accent = it.accent ? ACCENT_HEX[it.accent] : tPri;
                return (
                  <div key={it.id} style={{ background: surface, border: `1px solid ${border}`, borderRadius: 16, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 6, minHeight: 92 }}>
                    <span style={{ fontSize: 10.5, color: tTer, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{it.label}</span>
                    <span style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1, color: accent, fontVariantNumeric: "tabular-nums" }}>{it.value}</span>
                    {it.sub && <span style={{ fontSize: 11, color: tTer }}>{it.sub}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Funil */}
      {funnelSteps.length > 0 && (
        <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 20, padding: 24, marginTop: 4 }}>
          <p style={{ fontSize: 16, fontWeight: 800, margin: "0 0 18px", color: tPri }}>Funil de Conversão</p>
          {funnelSteps.map((s, i) => {
            const v = parseLoose(s.value);
            const widthPct = Math.max(28, (v / maxFunnel) * 100);
            return (
              <div key={s.id}>
                {i > 0 && s.rateLabel && (
                  <div style={{ display: "flex", justifyContent: "center", margin: "10px 0" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: tSec, background: "var(--dm-bg-elevated, rgba(255,255,255,0.06))", borderRadius: 999, padding: "4px 12px", border: `1px solid ${border}` }}>
                      {s.rateLabel}: {s.rateValue}
                    </span>
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: `${widthPct}%`, margin: "0 auto", background: s.color, borderRadius: 14, padding: "14px 18px", minHeight: 48, boxShadow: "0 4px 12px rgba(0,0,0,0.18)" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{s.label}</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{s.value}</span>
                </div>
              </div>
            );
          })}

          {data.funnel!.footer.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${data.funnel!.footer.length}, 1fr)`, gap: 14, marginTop: 20, paddingTop: 18, borderTop: `1px solid ${border}` }}>
              {data.funnel!.footer.map((f) => (
                <div key={f.label}>
                  <p style={{ fontSize: 10, color: tTer, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 5px", fontWeight: 600 }}>{f.label}</p>
                  <p style={{ fontSize: 15, fontWeight: 800, margin: 0, color: tPri, fontVariantNumeric: "tabular-nums" }}>{f.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function parseLoose(s: string): number {
  const cleaned = s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}
