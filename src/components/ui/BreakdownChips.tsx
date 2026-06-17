// Chips de quebra por canal — ex.: "150 Meta · 50 Google · 50 Orgânico".
// Linguagem do bento: ponto colorido + valor + rótulo, dentro dos tokens --dm-.

/** Fatia da quebra exibida sob o valor de um StatCard / estágio de funil. */
export interface TileBreakdown {
  label: string;
  value: string;
  color: string;
}

export function BreakdownChips({
  items,
  size = "sm",
}: {
  items: TileBreakdown[];
  /** "sm" p/ cards, "xs" p/ estágios de funil (mais compacto). */
  size?: "sm" | "xs";
}) {
  if (items.length < 2) return null; // 1 canal só não precisa de quebra
  const dot = size === "xs" ? "h-1.5 w-1.5" : "h-1.5 w-1.5";
  const text = size === "xs" ? "text-[9px]" : "text-[10px]";
  const gap = size === "xs" ? "gap-x-2.5 gap-y-0.5" : "gap-x-2.5 gap-y-1";
  return (
    <div className={`flex flex-wrap items-center ${gap}`}>
      {items.map((b) => (
        <span
          key={b.label}
          className={`flex items-center gap-1 ${text} font-semibold tabular-nums`}
          style={{ color: "var(--dm-text-secondary)" }}
        >
          <span className={`${dot} flex-shrink-0 rounded-full`} style={{ backgroundColor: b.color }} />
          {b.value} <span className="font-medium" style={{ color: "var(--dm-text-tertiary)" }}>{b.label}</span>
        </span>
      ))}
    </div>
  );
}
