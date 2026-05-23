"use client";

import React from "react";
import { ImageIcon, Settings2, Upload } from "lucide-react";
import { Sk } from "./Skeleton";

interface CriativosEmptyProps {
  variant: "no-data" | "no-account";
  onConnect?: () => void;
  onImportCsv?: () => void;
}

const CARD_DELAYS = [0, 80, 160, 240, 320, 400];

function GhostCreativeCard({ delay }: { delay: number }) {
  return (
    <div
      className="overflow-hidden rounded-2xl border animate-pulse"
      style={{
        borderColor: "var(--dm-border-default)",
        backgroundColor: "var(--dm-bg-surface)",
        animationDelay: `${delay}ms`,
      }}
    >
      {/* Image area — no border-radius to mimic card thumbnail flush edge */}
      <Sk w="100%" h="112px" className="rounded-none" />
      {/* Info */}
      <div className="p-3">
        <Sk w="70%" h="9px" />
        <Sk w="45%" h="8px" className="mt-1.5" />
        <div className="mt-2.5 flex items-center gap-1.5">
          <Sk w="28px" h="16px" className="rounded-full flex-shrink-0" />
          <Sk w="28px" h="16px" className="rounded-full flex-shrink-0" />
          <Sk w="28px" h="16px" className="rounded-full flex-shrink-0" />
        </div>
      </div>
    </div>
  );
}

export function CriativosEmpty({ variant, onConnect, onImportCsv }: CriativosEmptyProps) {
  const subtitle =
    variant === "no-data"
      ? "Importe dados ou conecte o Meta Ads para ver e ranquear seus criativos."
      : "Conecte o Meta Ads para carregar thumbnails e ranquear criativos por performance.";

  return (
    <div
      className="mx-auto max-w-4xl"
      style={{ animation: "dm-fade-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both" }}
    >
      {/* Header */}
      <div className="flex flex-col items-center gap-4 text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{
            backgroundColor: "var(--dm-bg-surface)",
            color: "var(--dm-brand-500)",
            border: "1px solid var(--dm-border-default)",
          }}
        >
          <ImageIcon size={24} />
        </div>
        <div>
          <h2
            className="text-xl font-extrabold tracking-tight"
            style={{ fontFamily: "var(--font-display)", color: "var(--dm-text-primary)" }}
          >
            Melhores Criativos
          </h2>
          <p
            className="mx-auto mt-1.5 max-w-sm text-[13px]"
            style={{ color: "var(--dm-text-secondary)" }}
          >
            {subtitle}
          </p>
        </div>

        {/* CTAs */}
        {onConnect && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={onConnect}
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-semibold text-white shadow-md transition-all hover:-translate-y-0.5"
              style={{ backgroundColor: "var(--dm-brand-500)" }}
            >
              <Settings2 size={14} />
              Conectar Meta Ads
            </button>
            {variant === "no-data" && onImportCsv && (
              <button
                type="button"
                onClick={onImportCsv}
                className="flex items-center gap-2 rounded-xl border px-5 py-2.5 text-[13px] font-semibold transition-all hover:-translate-y-0.5 hover:shadow-sm"
                style={{
                  borderColor: "var(--dm-border-default)",
                  color: "var(--dm-text-primary)",
                  backgroundColor: "var(--dm-bg-elevated)",
                }}
              >
                <Upload size={14} />
                Importar CSV
              </button>
            )}
          </div>
        )}
      </div>

      {/* Ghost creative grid */}
      <div
        className="pointer-events-none mt-8 grid grid-cols-2 gap-3 select-none sm:grid-cols-3"
        style={{ opacity: 0.45 }}
      >
        {CARD_DELAYS.map((delay, i) => (
          <GhostCreativeCard key={i} delay={delay} />
        ))}
      </div>
    </div>
  );
}
