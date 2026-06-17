import type { LucideIcon } from "lucide-react";

// Barra de sub-abas única do dashboard (estilo underline com a cor primária).
// Substitui as variações divergentes (border-blue-500 em Análises, pílulas em
// Criativos). Genérica sobre o id da aba.

export interface SegmentedTab<T extends string> {
  id: T;
  label: string;
  icon?: LucideIcon;
  count?: number;
}

export function SegmentedTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: SegmentedTab<T>[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      className="flex gap-1 overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ borderColor: "var(--dm-border-default)" }}
    >
      {tabs.map(({ id, label, icon: Icon, count }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className="flex flex-shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-semibold transition-all"
            style={{
              borderColor: isActive ? "var(--dm-primary)" : "transparent",
              color: isActive ? "var(--dm-primary)" : "var(--dm-text-secondary)",
            }}
          >
            {Icon && <Icon size={13} />}
            {label}
            {count !== undefined && count > 0 && (
              <span
                className="rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                style={{
                  backgroundColor: isActive ? "var(--dm-primary-soft)" : "var(--dm-bg-elevated)",
                  color: isActive ? "var(--dm-primary)" : "var(--dm-text-tertiary)",
                }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
