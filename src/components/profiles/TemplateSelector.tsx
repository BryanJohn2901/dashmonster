"use client";

import { TEMPLATE_LIST } from "@/lib/templates";
import type { TemplateId } from "@/lib/templates/types";
import { ChevronDown, Settings2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const BRAND_GRAD = "linear-gradient(135deg, #6366C8 0%, #313491 100%)";

interface Props {
  current: TemplateId;
  onChange: (id: TemplateId) => void;
  variant?: "modal" | "dropdown";
  onOpenBuilder?: () => void;
}

export function TemplateSelector({ current, onChange, variant = "dropdown", onOpenBuilder }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentTpl = TEMPLATE_LIST.find((t) => t.id === current) ?? TEMPLATE_LIST[0];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (variant === "modal") {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
        {TEMPLATE_LIST.map((tpl) => {
          const isPersonalizado = tpl.id === "personalizado";
          const isSelected = current === tpl.id;
          return (
            <button
              key={tpl.id}
              type="button"
              onClick={() => {
                onChange(tpl.id);
                if (isPersonalizado && onOpenBuilder) onOpenBuilder();
              }}
              className="relative text-left rounded-[20px] p-5 transition hover:-translate-y-0.5 card-hover"
              style={{
                backgroundColor: "var(--dm-bg-surface)",
                border: isSelected ? `2px solid var(--dm-brand-500)` : "2px solid var(--dm-border-default)",
                boxShadow: isSelected ? "0 4px 18px rgba(49,52,145,0.18)" : undefined,
              }}
            >
              {/* Color accent bar */}
              <div className="mb-3 h-1 w-10 rounded-full" style={{ background: isSelected ? BRAND_GRAD : tpl.color }} />

              <div className="text-[10px] uppercase tracking-widest font-semibold mb-1" style={{ color: "var(--dm-text-tertiary)" }}>
                Template
              </div>
              <div className="text-[15px] font-bold" style={{
                color: isSelected ? "var(--dm-brand-500)" : "var(--dm-text-primary)",
                fontFamily: "var(--font-poppins), Poppins, sans-serif",
              }}>
                {tpl.label}
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed line-clamp-2" style={{ color: "var(--dm-text-tertiary)" }}>
                {tpl.description}
              </p>
              {isPersonalizado ? (
                <div className="mt-3 flex items-center gap-1 text-[10px] font-semibold" style={{ color: "var(--dm-brand-500)" }}>
                  <Settings2 size={10} />
                  {isSelected ? "Configurar métricas →" : "Monte do seu jeito"}
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-1">
                  {tpl.kpis.slice(0, 3).map((k) => (
                    <span
                      key={k.id}
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{ backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)" }}
                    >
                      {k.label}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // ── Dropdown variant ──────────────────────────────────────────────────────────
  return (
    <div ref={ref} className="flex items-center gap-1.5">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[12px] font-semibold transition"
          style={{
            backgroundColor: open ? "var(--dm-bg-elevated)" : "var(--dm-bg-elevated)",
            borderColor: open ? "var(--dm-brand-500)" : "var(--dm-border-default)",
            color: open ? "var(--dm-brand-500)" : "var(--dm-text-secondary)",
          }}
        >
          <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: currentTpl.color }} />
          <span>Template: <span style={{ color: "var(--dm-text-primary)" }}>{currentTpl.label}</span></span>
          <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div
            className="absolute left-0 top-full z-50 mt-1.5 w-64 overflow-hidden rounded-[16px] border shadow-horizon"
            style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}
          >
            {/* Gradient top bar */}
            <div className="h-1" style={{ background: BRAND_GRAD }} />
            <div className="py-1.5">
              {TEMPLATE_LIST.map((tpl) => {
                const isSelected = tpl.id === current;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => {
                      onChange(tpl.id);
                      setOpen(false);
                      if (tpl.id === "personalizado" && onOpenBuilder) onOpenBuilder();
                    }}
                    className="flex w-full items-start gap-3 px-4 py-2.5 text-left text-xs transition hover:bg-[var(--dm-bg-elevated)]"
                    style={isSelected ? { backgroundColor: "rgba(49,52,145,0.07)" } : {}}
                  >
                    <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full" style={{ background: tpl.color }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold leading-tight" style={{
                        color: isSelected ? "var(--dm-brand-500)" : "var(--dm-text-primary)",
                      }}>
                        {tpl.label}
                      </p>
                      <p className="mt-0.5 text-[10px] leading-snug" style={{ color: "var(--dm-text-tertiary)" }}>
                        {tpl.description}
                      </p>
                    </div>
                    {isSelected && (
                      <div className="h-2 w-2 flex-shrink-0 rounded-full mt-1" style={{ background: "var(--dm-brand-500)" }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Configurar button — only for personalizado */}
      {current === "personalizado" && onOpenBuilder && (
        <button
          type="button"
          onClick={onOpenBuilder}
          title="Configurar métricas do layout personalizado"
          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold transition"
          style={{
            backgroundColor: "rgba(49,52,145,0.09)",
            color: "var(--dm-brand-500)",
            border: "1px solid rgba(49,52,145,0.20)",
          }}
        >
          <Settings2 size={11} /> Configurar
        </button>
      )}
    </div>
  );
}
