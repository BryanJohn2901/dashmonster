import type { LucideIcon } from "lucide-react";

// Cabeçalho de seção/card no estilo bento: chip de ícone (cor@10%) + título,
// com ação opcional à direita. Usado em cards, gráficos e listas.

export function SectionHeader({
  icon: Icon,
  title,
  color = "#7C3AED",
  count,
  right,
}: {
  icon: LucideIcon;
  title: string;
  /** Cor do chip de ícone (dentro da paleta do sistema). */
  color?: string;
  /** Badge numérico opcional ao lado do título. */
  count?: number;
  /** Conteúdo opcional alinhado à direita (busca, botão, etc.). */
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className="flex items-center gap-2 text-sm font-bold"
        style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}
      >
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${color}1a` }}
        >
          <Icon size={14} style={{ color }} />
        </span>
        {title}
        {count !== undefined && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums"
            style={{ backgroundColor: `${color}1a`, color }}
          >
            {count}
          </span>
        )}
      </span>
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}
