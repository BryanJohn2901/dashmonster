"use client";

import { Sparkles } from "lucide-react";
import type { ReportData, ReportAccent } from "@/types/report";

export const REPORT_WIDTH = 1024;

const ACCENT_HEX: Record<ReportAccent, string> = {
  brand: "#6366C8",
  green: "#05CD99",
  rose:  "#EE5D50",
  amber: "#F4A60D",
  sky:   "#0EA5E9",
  slate: "#64748B",
};

interface ReportTemplateProps {
  data: ReportData;
  hiddenIds?: Set<string>;
  generatedAt: string;
  /** ref encaminhada para captura */
  innerRef?: React.Ref<HTMLDivElement>;
}

/**
 * Layout dedicado do relatório — sem botões/controles. Fundo, tipografia e
 * espaçamento próprios, largura fixa (REPORT_WIDTH). Tudo inline para fidelidade
 * total na rasterização (modern-screenshot).
 */
export function ReportTemplate({ data, hiddenIds, generatedAt, innerRef }: ReportTemplateProps) {
  const hidden = hiddenIds ?? new Set<string>();
  const bg = "#0B1437";
  const card = "#111C44";
  const border = "rgba(255,255,255,0.08)";
  const textPrimary = "#FFFFFF";
  const textSec = "#A3AED0";
  const textTer = "#707EAE";

  const funnelSteps = data.funnel?.steps.filter((s) => !hidden.has(s.id)) ?? [];
  const maxFunnel = Math.max(1, ...funnelSteps.map((s) => parseLoose(s.value)));

  return (
    <div ref={innerRef} style={{ width: REPORT_WIDTH, background: bg, padding: 28, fontFamily: "var(--font-poppins), Poppins, system-ui, sans-serif", color: textPrimary }}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, borderRadius: 20, padding: "18px 22px", marginBottom: 22, background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", height: 44, width: 44, alignItems: "center", justifyContent: "center", borderRadius: 12, background: "rgba(255,255,255,0.15)" }}>
            <Sparkles size={22} color="#fff" />
          </div>
          <div>
            <p style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1, margin: 0 }}>{data.title || "Relatório"}</p>
            <p style={{ fontSize: 12, opacity: 0.85, margin: "4px 0 0" }}>DashMonster · {data.period}</p>
          </div>
        </div>
        <p style={{ fontSize: 11, opacity: 0.75, margin: 0 }}>Gerado em {generatedAt}</p>
      </div>

      {/* Grupos de métricas */}
      {data.groups.map((g) => {
        const items = g.items.filter((it) => !hidden.has(it.id));
        if (items.length === 0) return null;
        return (
          <div key={g.id} style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: textTer, margin: "0 0 10px" }}>{g.label}</p>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(items.length, 4)}, 1fr)`, gap: 12 }}>
              {items.map((it) => {
                const accent = it.accent ? ACCENT_HEX[it.accent] : textSec;
                return (
                  <div key={it.id} style={{ background: card, border: `1px solid ${border}`, borderRadius: 16, padding: 16 }}>
                    <p style={{ fontSize: 11, color: textTer, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{it.label}</p>
                    <p style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1, margin: 0, color: accent === textSec ? textPrimary : accent }}>{it.value}</p>
                    {it.sub && <p style={{ fontSize: 11, color: textTer, margin: "6px 0 0" }}>{it.sub}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Funil */}
      {funnelSteps.length > 0 && (
        <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 20, padding: 20, marginTop: 4 }}>
          <p style={{ fontSize: 15, fontWeight: 800, margin: "0 0 16px" }}>Funil de Conversão</p>
          {funnelSteps.map((s, i) => {
            const v = parseLoose(s.value);
            const widthPct = Math.max(22, (v / maxFunnel) * 100);
            return (
              <div key={s.id}>
                {i > 0 && s.rateLabel && (
                  <div style={{ display: "flex", justifyContent: "center", margin: "8px 0" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: textSec, background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: "3px 10px" }}>
                      {s.rateLabel}: {s.rateValue}
                    </span>
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: `${widthPct}%`, margin: "0 auto", background: s.color, borderRadius: 12, padding: "12px 16px", minHeight: 44 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{s.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>{s.value}</span>
                </div>
              </div>
            );
          })}

          {data.funnel!.footer.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${data.funnel!.footer.length}, 1fr)`, gap: 12, marginTop: 18, paddingTop: 16, borderTop: `1px solid ${border}` }}>
              {data.funnel!.footer.map((f) => (
                <div key={f.label}>
                  <p style={{ fontSize: 10, color: textTer, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px" }}>{f.label}</p>
                  <p style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>{f.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Extrai número de strings tipo "R$ 1.234,56" / "60.438" / "12,5%" para dimensionar barras.
function parseLoose(s: string): number {
  const cleaned = s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}
