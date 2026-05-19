"use client";

import { useState } from "react";
import { Check, Settings2, X } from "lucide-react";
import type { PersonalizadoConfig } from "@/lib/templates/types";
import {
  ALL_KPI_OPTIONS,
  ALL_FUNNEL_OPTIONS,
  KPI_GROUPS,
  DEFAULT_PERSONALIZADO_CONFIG,
} from "@/lib/templates";
import { loadMetaCredentials } from "@/utils/metaApi";

const BRAND_GRAD = "linear-gradient(135deg, #6366C8 0%, #313491 100%)";
const MAX_KPIS = 10;

interface Props {
  config: PersonalizadoConfig;
  onChange: (config: PersonalizadoConfig) => void;
  onClose: () => void;
}

export function PersonalizadoBuilder({ config, onChange, onClose }: Props) {
  const [name,      setName]      = useState<string>(config.name ?? "");
  const [kpiIds,    setKpiIds]    = useState<string[]>(config.kpiIds);
  const [funnelIds, setFunnelIds] = useState<string[]>(config.funnelIds);

  const hasIgToken = Boolean(loadMetaCredentials().accessToken);

  const toggleKpi = (id: string) => {
    setKpiIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev;
        return prev.filter((k) => k !== id);
      }
      if (prev.length >= MAX_KPIS) return prev;
      return [...prev, id];
    });
  };

  const toggleFunnel = (id: string) =>
    setFunnelIds((prev) =>
      prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id],
    );

  const handleSave = () => {
    onChange({ name: name.trim() || undefined, kpiIds, funnelIds });
    onClose();
  };

  const handleReset = () => {
    setName("");
    setKpiIds(DEFAULT_PERSONALIZADO_CONFIG.kpiIds);
    setFunnelIds(DEFAULT_PERSONALIZADO_CONFIG.funnelIds);
  };

  const kpiMap = Object.fromEntries(ALL_KPI_OPTIONS.map((k) => [k.id, k]));
  const visibleGroups = KPI_GROUPS.filter((g) => !g.igOnly || hasIgToken);

  const atMax = kpiIds.length >= MAX_KPIS;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div
        className="flex w-full max-w-2xl flex-col overflow-hidden rounded-[20px] shadow-horizon"
        style={{ backgroundColor: "var(--dm-bg-surface)", border: "1px solid var(--dm-border-default)", maxHeight: "90vh" }}
      >
        {/* Gradient top bar */}
        <div className="h-1.5 w-full flex-shrink-0" style={{ background: BRAND_GRAD }} />

        {/* Header */}
        <div
          className="flex flex-shrink-0 items-center justify-between px-6 py-5"
          style={{ borderBottom: "1px solid var(--dm-border-default)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-[10px]"
              style={{ background: BRAND_GRAD }}
            >
              <Settings2 size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins), Poppins, sans-serif" }}>
                Layout Personalizado
              </h2>
              <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
                {kpiIds.length}/{MAX_KPIS} métricas · {funnelIds.length} etapas no funil
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full transition hover:opacity-70"
            style={{ backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)" }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* Nome do layout */}
          <div className="px-6 pt-5 pb-4" style={{ borderBottom: "1px solid var(--dm-border-subtle)" }}>
            <label className="mb-2 block text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>
              Nome do layout <span className="normal-case font-normal tracking-normal opacity-50">(opcional)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Tráfego · Pós Graduação"
              className="h-9 w-full rounded-[12px] border px-3 text-[13px] outline-none transition"
              style={{
                borderColor: "var(--dm-border-default)",
                backgroundColor: "var(--dm-bg-elevated)",
                color: "var(--dm-text-primary)",
              }}
            />
          </div>

          {/* KPIs */}
          <div className="px-6 py-5 space-y-5" style={{ borderBottom: "1px solid var(--dm-border-subtle)" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-bold" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins), Poppins, sans-serif" }}>
                Métricas principais
              </h3>
              <span
                className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
                style={{
                  backgroundColor: atMax ? "rgba(49,52,145,0.1)" : "var(--dm-bg-elevated)",
                  color: atMax ? "var(--dm-brand-500)" : "var(--dm-text-tertiary)",
                }}
              >
                {kpiIds.length}/{MAX_KPIS}
              </span>
            </div>

            <div className="space-y-4">
              {visibleGroups.map((group) => {
                const groupKpis = group.kpiIds.map((id) => kpiMap[id]).filter(Boolean);
                return (
                  <div key={group.label}>
                    <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>
                      {group.label}
                      {group.igOnly && (
                        <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold normal-case tracking-normal"
                          style={{ backgroundColor: "#E1306C18", color: "#E1306C" }}>
                          Instagram
                        </span>
                      )}
                    </p>
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      {groupKpis.map((kpi) => {
                        const selected = kpiIds.includes(kpi.id);
                        const disabled = !selected && atMax;
                        return (
                          <button
                            key={kpi.id}
                            type="button"
                            onClick={() => !disabled && toggleKpi(kpi.id)}
                            className="flex items-center gap-2 rounded-[12px] px-3 py-2 text-left text-[12px] transition"
                            style={{
                              backgroundColor: selected
                                ? "rgba(49,52,145,0.09)"
                                : disabled
                                  ? "var(--dm-bg-elevated)"
                                  : "var(--dm-bg-elevated)",
                              border: `1.5px solid ${selected ? "rgba(49,52,145,0.40)" : "var(--dm-border-default)"}`,
                              color: selected
                                ? "var(--dm-brand-500)"
                                : disabled
                                  ? "var(--dm-text-tertiary)"
                                  : "var(--dm-text-secondary)",
                              cursor: disabled ? "not-allowed" : "pointer",
                              opacity: disabled ? 0.5 : 1,
                            }}
                          >
                            {/* Checkbox */}
                            <span
                              className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full transition"
                              style={{
                                background: selected ? BRAND_GRAD : "transparent",
                                border: selected ? "none" : "1.5px solid var(--dm-border-default)",
                              }}
                            >
                              {selected && <Check size={9} className="text-white" />}
                            </span>
                            <span className="truncate font-medium">{kpi.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Funnel stages */}
          <div className="px-6 py-5">
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-[13px] font-bold" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins), Poppins, sans-serif" }}>
                Etapas do funil
              </h3>
              <span className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
                ({funnelIds.length} selecionadas)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {ALL_FUNNEL_OPTIONS.map((stage) => {
                const selected = funnelIds.includes(stage.id);
                return (
                  <button
                    key={stage.id}
                    type="button"
                    onClick={() => toggleFunnel(stage.id)}
                    className="flex items-center gap-2 rounded-[12px] px-3 py-2 text-left text-[12px] transition"
                    style={{
                      backgroundColor: selected ? "rgba(5,205,153,0.09)" : "var(--dm-bg-elevated)",
                      border: `1.5px solid ${selected ? "rgba(5,205,153,0.40)" : "var(--dm-border-default)"}`,
                      color: selected ? "#05CD99" : "var(--dm-text-secondary)",
                    }}
                  >
                    <span
                      className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full transition"
                      style={{
                        backgroundColor: selected ? "#05CD99" : "transparent",
                        border: selected ? "none" : "1.5px solid var(--dm-border-default)",
                      }}
                    >
                      {selected && <Check size={9} className="text-white" />}
                    </span>
                    <span className="truncate font-medium">{stage.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex flex-shrink-0 items-center justify-between px-6 py-4"
          style={{ borderTop: "1px solid var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}
        >
          <button
            onClick={handleReset}
            className="text-[12px] font-semibold transition hover:opacity-70"
            style={{ color: "var(--dm-text-tertiary)" }}
          >
            Restaurar padrão
          </button>
          <div className="flex gap-2.5">
            <button
              onClick={onClose}
              className="rounded-[12px] border px-4 py-2 text-[12px] font-semibold transition hover:opacity-80"
              style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)", backgroundColor: "var(--dm-bg-surface)" }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={kpiIds.length === 0 || funnelIds.length === 0}
              className="rounded-[12px] px-5 py-2 text-[12px] font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: BRAND_GRAD, boxShadow: "0 4px 14px rgba(49,52,145,0.30)" }}
            >
              Aplicar Layout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
