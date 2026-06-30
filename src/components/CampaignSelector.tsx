"use client";

import { Activity, BookOpen, Dumbbell, Trophy, Users, Zap } from "lucide-react";

type GroupId = "biomecanica" | "musculacao" | "fisiologia" | "bodybuilding" | "feminino" | "funcional";

interface GroupConfig {
  id: GroupId;
  label: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  selectedCard: string;
  dotActive: string;
}

// Sistema preto/branco + verde — cards sem cor própria; verde só no selecionado.
const G_CARD = {
  iconBg: "bg-[#16A34A]/10",
  iconColor: "text-[#16A34A]",
  selectedCard: "border-[#16A34A] bg-[#16A34A]/5 ring-1 ring-[#16A34A]/40",
  dotActive: "bg-[#16A34A]",
};

const GROUPS: GroupConfig[] = [
  { id: "biomecanica",  label: "Biomecânica",      icon: BookOpen, ...G_CARD },
  { id: "musculacao",   label: "Musculação",       icon: Dumbbell, ...G_CARD },
  { id: "fisiologia",   label: "Fisiologia",       icon: Activity, ...G_CARD },
  { id: "bodybuilding", label: "Bodybuilding",     icon: Trophy,   ...G_CARD },
  { id: "feminino",     label: "Trein. Feminino",  icon: Users,    ...G_CARD },
  { id: "funcional",    label: "Trein. Funcional", icon: Zap,      ...G_CARD },
];

interface CampaignSelectorProps {
  turmasByGroup: Record<string, string[]>;
  selectedGroup: string;
  selectedTurma: string;
  activeCampaigns: Record<string, boolean>;
  onSelectGroup: (group: string) => void;
  onSelectTurma: (turma: string) => void;
  onToggleActive: (group: string, active: boolean) => void;
}

export function CampaignSelector({
  turmasByGroup,
  selectedGroup,
  selectedTurma,
  activeCampaigns,
  onSelectGroup,
  onSelectTurma,
  onToggleActive,
}: CampaignSelectorProps) {
  const selectedConfig = GROUPS.find((g) => g.id === selectedGroup);
  const turmaList = selectedGroup !== "all" ? (turmasByGroup[selectedGroup] ?? []) : [];

  return (
    <div className="space-y-3">
      {/* Campaign blocks */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {GROUPS.map((group) => {
          const Icon = group.icon;
          const isSelected = selectedGroup === group.id;
          const isActive = activeCampaigns[group.id] ?? false;

          return (
            <div
              key={group.id}
              onClick={() => onSelectGroup(isSelected ? "all" : group.id)}
              className={`relative flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 p-3 text-center transition select-none ${
                isSelected
                  ? group.selectedCard
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {/* Active status dot */}
              <span
                title={isActive ? "Campanha ativa" : "Campanha inativa"}
                className={`absolute right-2.5 top-2.5 h-2 w-2 rounded-full transition-colors ${
                  isActive ? group.dotActive : "bg-slate-300"
                }`}
              />

              <div className={`flex h-9 w-9 items-center justify-center rounded-full ${group.iconBg}`}>
                <Icon size={16} className={group.iconColor} />
              </div>

              <p className="text-xs font-semibold leading-tight text-slate-800">{group.label}</p>

              {/* Active checkbox — stops propagation so it doesn't also toggle card selection */}
              <label
                className="flex items-center gap-1 text-xs text-slate-500"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => onToggleActive(group.id, e.target.checked)}
                  className="h-3 w-3 rounded accent-blue-600"
                />
                Ativa
              </label>
            </div>
          );
        })}
      </div>

      {/* Turma selector — only when a specific group is selected */}
      {selectedGroup !== "all" && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
          <span className="text-xs font-semibold text-slate-500">
            {selectedConfig?.label}:
          </span>
          <button
            type="button"
            onClick={() => onSelectTurma("all")}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
              selectedTurma === "all"
                ? "border-brand bg-brand text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            Todas
          </button>

          {turmaList.length > 0 ? (
            turmaList.map((turma) => (
              <button
                key={turma}
                type="button"
                onClick={() => onSelectTurma(turma)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                  selectedTurma === turma
                    ? "border-brand bg-brand text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {turma}
              </button>
            ))
          ) : (
            <span className="text-xs italic text-slate-400">
              Nenhuma turma detectada nos dados carregados
            </span>
          )}
        </div>
      )}
    </div>
  );
}
