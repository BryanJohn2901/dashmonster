"use client";

import React from "react";
import { ArrowRight } from "lucide-react";

interface Feature {
  icon: React.ElementType;
  label: string;
  description: string;
}

interface Step {
  label: string;
  description: string;
}

interface TabLandingProps {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  features: Feature[];
  steps: Step[];
  cta: { label: string; onClick: () => void };
  ctaSecondary?: { label: string; onClick: () => void };
  /** Optional slot rendered below the steps (e.g. import cards for overview) */
  children?: React.ReactNode;
}

export function TabLanding({
  icon: Icon,
  title,
  subtitle,
  features,
  steps,
  cta,
  ctaSecondary,
  children,
}: TabLandingProps) {
  return (
    <div className="relative mx-auto max-w-4xl overflow-hidden rounded-[2rem] p-1 sm:p-2" style={{ animation: "dm-fade-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both" }}>
      {/* Background Glow */}
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[#16A34A]/20 blur-[100px]" />
      <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-emerald-500/10 blur-[100px]" />

      <div className="glass-panel relative flex flex-col gap-8 rounded-[1.75rem] p-6 sm:p-12">
        {/* ── Hero ── */}
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-[#16A34A] to-[#15803D] text-white shadow-xl shadow-[#16A34A]/30">
            <Icon size={40} strokeWidth={1.5} />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ fontFamily: "var(--font-display)", color: "var(--dm-text-primary)" }}>
            {title}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed" style={{ color: "var(--dm-text-secondary)" }}>
            {subtitle}
          </p>
        </div>

        {/* ── Features ── */}
        <div className="grid gap-4 sm:grid-cols-3">
          {features.map((f, idx) => (
            <div
              key={f.label}
              className="group flex flex-col gap-4 rounded-2xl border p-5 transition-all hover:-translate-y-1 hover:shadow-xl dark:bg-slate-800/50"
              style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)", animationDelay: `${idx * 100}ms`, animation: "dm-fade-up 0.4s both" }}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#16A34A]/10 text-[#16A34A] transition-colors group-hover:bg-[#16A34A]/15 dark:bg-[#22C55E]/10 dark:text-[#22C55E] dark:group-hover:bg-[#22C55E]/20">
                <f.icon size={22} />
              </div>
              <div>
                <p className="text-[16px] font-bold" style={{ color: "var(--dm-text-primary)" }}>{f.label}</p>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--dm-text-secondary)" }}>
                  {f.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Steps ── */}
        <div className="rounded-2xl border bg-slate-50/50 p-6 dark:bg-slate-800/30" style={{ borderColor: "var(--dm-border-default)" }}>
          <p className="mb-6 text-center text-[12px] font-bold uppercase tracking-widest sm:text-left" style={{ color: "var(--dm-text-tertiary)" }}>
            Como funciona
          </p>
          <div className="flex flex-col gap-6 sm:flex-row sm:gap-0">
            {steps.map((step, i) => (
              <React.Fragment key={step.label}>
                <div className="flex flex-1 flex-col gap-3 sm:items-center sm:text-center">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-300 sm:mx-auto">
                    {i + 1}
                  </div>
                  <div>
                    <p className="text-[15px] font-bold" style={{ color: "var(--dm-text-primary)" }}>{step.label}</p>
                    <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--dm-text-secondary)" }}>
                      {step.description}
                    </p>
                  </div>
                </div>
                {i < steps.length - 1 && (
                  <div className="hidden items-center justify-center px-4 sm:flex">
                    <ArrowRight size={20} className="text-slate-300 dark:text-slate-600" />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* ── Optional children slot (e.g. import cards) ── */}
        {children}

        {/* ── CTA buttons (rendered only if no children, or as footer when children present) ── */}
        {!children && (
          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <button
              type="button"
              onClick={cta.onClick}
              className="flex items-center gap-2 rounded-xl bg-brand px-8 py-3.5 text-[16px] font-bold text-white shadow-lg shadow-[#16A34A]/25 transition-all hover:-translate-y-0.5 hover:bg-brand-hover hover:shadow-[#16A34A]/40"
            >
              {cta.label}
            </button>
            {ctaSecondary && (
              <button
                type="button"
                onClick={ctaSecondary.onClick}
                className="flex items-center gap-2 rounded-xl border px-8 py-3.5 text-[16px] font-bold transition-all hover:-translate-y-0.5 hover:shadow-md"
                style={{
                  borderColor: "var(--dm-border-default)",
                  color: "var(--dm-text-primary)",
                  backgroundColor: "var(--dm-bg-surface)",
                }}
              >
                {ctaSecondary.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
