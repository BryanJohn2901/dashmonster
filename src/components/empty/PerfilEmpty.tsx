"use client";

import React from "react";
import { Users, PlusCircle } from "lucide-react";
import { Sk } from "./Skeleton";

interface PerfilEmptyProps {
  onCreateProfile: () => void;
}

const CARD_DELAYS = [0, 150, 300];

function GhostProfileCard({ delay }: { delay: number }) {
  return (
    <div
      className="rounded-2xl border p-5 animate-pulse"
      style={{
        borderColor: "var(--dm-border-default)",
        backgroundColor: "var(--dm-bg-surface)",
        animationDelay: `${delay}ms`,
      }}
    >
      {/* Avatar + name */}
      <div className="flex items-center gap-3">
        <Sk w="40px" h="40px" className="rounded-full flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <Sk w="60%" h="12px" />
          <Sk w="40%" h="9px" className="mt-1.5" />
        </div>
      </div>

      {/* Divider */}
      <div
        className="my-4 h-px w-full"
        style={{ backgroundColor: "var(--dm-border-default)" }}
      />

      {/* Metric rows */}
      {[55, 70, 45, 65].map((w, i) => (
        <div key={i} className="flex items-center gap-2 mb-2.5 last:mb-0">
          <Sk w="14px" h="14px" className="rounded flex-shrink-0" />
          <Sk w={`${w}%`} h="8px" className="flex-1" />
          <Sk w="22%" h="8px" className="ml-auto flex-shrink-0" />
        </div>
      ))}

      {/* Tag pills */}
      <div className="mt-4 flex items-center gap-2">
        <Sk w="52px" h="20px" className="rounded-full" />
        <Sk w="44px" h="20px" className="rounded-full" />
      </div>
    </div>
  );
}

export function PerfilEmpty({ onCreateProfile }: PerfilEmptyProps) {
  return (
    <div
      className="mx-auto max-w-4xl"
      style={{ animation: "dm-fade-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both" }}
    >
      {/* Header */}
      <div className="mb-8 flex flex-col items-center gap-4 text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ backgroundColor: "var(--dm-bg-surface)", color: "var(--dm-brand-500)", border: "1px solid var(--dm-border-default)" }}
        >
          <Users size={24} />
        </div>
        <div>
          <h2
            className="text-xl font-extrabold tracking-tight"
            style={{ fontFamily: "var(--font-display)", color: "var(--dm-text-primary)" }}
          >
            Perfil de Anunciantes
          </h2>
          <p className="mt-1.5 text-[13px]" style={{ color: "var(--dm-text-secondary)" }}>
            Crie perfis de audiência para segmentar e comparar a performance entre públicos.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreateProfile}
          className="flex items-center gap-2 rounded-xl px-6 py-2.5 text-[13px] font-semibold text-white shadow-md transition-all hover:-translate-y-0.5"
          style={{ backgroundColor: "var(--dm-brand-500)" }}
        >
          <PlusCircle size={15} />
          Criar primeiro perfil
        </button>
      </div>

      {/* Ghost cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {CARD_DELAYS.map((delay, i) => (
          <GhostProfileCard key={i} delay={delay} />
        ))}
      </div>
    </div>
  );
}
