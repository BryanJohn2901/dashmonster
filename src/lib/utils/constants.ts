export const STAGE_COLORS: Record<
  string,
  { label: string; colorClasses: { border: string; bg: string; text: string; shadow: string } }
> = {
  slate: {
    label: "Cinza",
    colorClasses: { border: "border-slate-500", bg: "bg-slate-500/10", text: "text-slate-400", shadow: "100 116 139" },
  },
  blue: {
    label: "Azul",
    colorClasses: { border: "border-blue-500", bg: "bg-blue-500/10", text: "text-blue-400", shadow: "59 130 246" },
  },
  cyan: {
    label: "Ciano",
    colorClasses: { border: "border-cyan-500", bg: "bg-cyan-500/10", text: "text-cyan-400", shadow: "6 182 212" },
  },
  amber: {
    label: "Âmbar",
    colorClasses: { border: "border-amber-500", bg: "bg-amber-500/10", text: "text-amber-400", shadow: "245 158 11" },
  },
  orange: {
    label: "Laranja",
    colorClasses: { border: "border-orange-500", bg: "bg-orange-500/10", text: "text-orange-400", shadow: "249 115 22" },
  },
  emerald: {
    label: "Esmeralda",
    colorClasses: { border: "border-emerald-500", bg: "bg-emerald-500/10", text: "text-emerald-400", shadow: "34 197 94" },
  },
  rose: {
    label: "Rosa",
    colorClasses: { border: "border-rose-500", bg: "bg-rose-500/10", text: "text-rose-400", shadow: "244 63 94" },
  },
  indigo: {
    label: "Índigo",
    colorClasses: { border: "border-indigo-500", bg: "bg-indigo-500/10", text: "text-indigo-400", shadow: "99 102 241" },
  },
};

export const LEAD_STATUSES = [
  { id: "new", label: "Novo" },
  { id: "contacted", label: "Contatado" },
  { id: "qualified", label: "Qualificado" },
  { id: "unqualified", label: "Não Qualificado" },
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number]["id"];

export const ACTIVITY_TYPES = [
  { id: "call", label: "Ligação" },
  { id: "email", label: "E-mail" },
  { id: "meeting", label: "Reunião" },
  { id: "note", label: "Nota" },
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number]["id"];

export const WORKSPACE_PLANS = {
  free: {
    id: "free",
    label: "Free",
    maxLeads: 50,
    maxMembers: 2,
  },
  pro: {
    id: "pro",
    label: "Pro",
    maxLeads: Infinity,
    maxMembers: Infinity,
    price: 4900,
  },
} as const;

export type WorkspacePlan = keyof typeof WORKSPACE_PLANS;
