"use client";

import React from "react";
import { Package, PlusCircle } from "lucide-react";
import { Sk } from "./Skeleton";

interface ProdutosEmptyProps {
  onAddProduct: () => void;
}

const CARD_DELAYS = [0, 120, 240];

function GhostProductCard({ delay }: { delay: number }) {
  return (
    <div
      className="rounded-2xl border p-5 animate-pulse"
      style={{
        borderColor: "var(--dm-border-default)",
        backgroundColor: "var(--dm-bg-surface)",
        animationDelay: `${delay}ms`,
      }}
    >
      {/* Category + type badges */}
      <div className="flex items-center gap-2">
        <Sk w="52px" h="20px" className="rounded-full flex-shrink-0" />
        <Sk w="36px" h="20px" className="rounded-full flex-shrink-0" />
      </div>

      {/* Product name */}
      <Sk w="72%" h="14px" className="mt-4" />
      <Sk w="52%" h="9px" className="mt-2" />

      {/* Divider */}
      <div
        className="my-4 h-px w-full"
        style={{ backgroundColor: "var(--dm-border-default)" }}
      />

      {/* Deliverable rows */}
      {[68, 58, 45].map((w, i) => (
        <div key={i} className="flex items-center gap-2 mb-2 last:mb-0">
          <Sk w="6px" h="6px" className="rounded-full flex-shrink-0" />
          <Sk w={`${w}%`} h="8px" />
        </div>
      ))}

      {/* Link row */}
      <div className="mt-3 flex items-center gap-2">
        <Sk w="14px" h="14px" className="rounded flex-shrink-0" />
        <Sk w="58%" h="8px" />
      </div>

      {/* Campaign badge */}
      <Sk w="80px" h="20px" className="rounded-full mt-4" />
    </div>
  );
}

export function ProdutosEmpty({ onAddProduct }: ProdutosEmptyProps) {
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
          <Package size={24} />
        </div>
        <div>
          <h2
            className="text-xl font-extrabold tracking-tight"
            style={{ fontFamily: "var(--font-display)", color: "var(--dm-text-primary)" }}
          >
            Base de Produtos
          </h2>
          <p className="mt-1.5 text-[13px]" style={{ color: "var(--dm-text-secondary)" }}>
            Cadastre seus produtos e vincule-os às campanhas do Meta Ads para cruzar dados de performance.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddProduct}
          className="flex items-center gap-2 rounded-xl px-6 py-2.5 text-[13px] font-semibold text-white shadow-md transition-all hover:-translate-y-0.5"
          style={{ backgroundColor: "var(--dm-brand-500)" }}
        >
          <PlusCircle size={15} />
          Cadastrar primeiro produto
        </button>
      </div>

      {/* Ghost cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {CARD_DELAYS.map((delay, i) => (
          <GhostProductCard key={i} delay={delay} />
        ))}
      </div>
    </div>
  );
}
