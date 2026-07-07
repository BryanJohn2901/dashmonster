"use client";

import { useMemo, useState } from "react";
import { useCompany } from "@/hooks/useCompany";
import { companyTemplateCategories } from "@/types/userConfig";
import {
  Activity, Award, BarChart2, BookMarked, CalendarDays, FileText,
  Globe, GraduationCap, Heart, ImageIcon, Loader2, Package,
  Plus, Repeat, Rocket, Sparkles, Star, Target, TrendingUp,
  Trophy, Users, Wallet, X, Zap,
} from "lucide-react";
import { ProductCategory } from "@/types/campaign";
import type { CustomSection, ColorKey } from "@/hooks/useCampaignStore";

// ─── Category definitions ─────────────────────────────────────────────────────

interface CategoryConfig {
  id: ProductCategory;
  label: string;
  description: string;
  icon: React.ElementType;
  tags: string[];
  vars: {
    bg: string; border: string; hoverBorder: string;
    iconBg: string; icon: string; title: string;
    tagBg: string; tagText: string; base: string;
  };
}

export const CATEGORY_CONFIGS: CategoryConfig[] = [
  {
    id: "pos",
    label: "Lançamentos de Pós",
    description: "Campanhas mensais de lançamento das turmas de pós-graduação",
    icon: GraduationCap,
    tags: ["Biomecânica (BM)", "Trein. Funcional (TF)", "Trein. Feminino (SM)", "Musculação (MPA)", "Fisiologia (FE)", "Bodybuilding (BB)"],
    vars: {
      bg: "var(--dm-cat-pos-bg)", border: "var(--dm-cat-pos-border)", hoverBorder: "var(--dm-cat-pos-base)",
      iconBg: "var(--dm-cat-pos-tag-bg)", icon: "var(--dm-cat-pos-icon)", title: "var(--dm-cat-pos-title)",
      tagBg: "var(--dm-cat-pos-tag-bg)", tagText: "var(--dm-cat-pos-tag-text)", base: "var(--dm-cat-pos-base)",
    },
  },
  {
    id: "livros",
    label: "Livros",
    description: "Campanhas de venda de livros físicos e digitais",
    icon: BookMarked,
    tags: ["Livro de Biomecânica", "Livro de Marketing"],
    vars: {
      bg: "var(--dm-cat-livros-bg)", border: "var(--dm-cat-livros-border)", hoverBorder: "var(--dm-cat-livros-base)",
      iconBg: "var(--dm-cat-livros-tag-bg)", icon: "var(--dm-cat-livros-icon)", title: "var(--dm-cat-livros-title)",
      tagBg: "var(--dm-cat-livros-tag-bg)", tagText: "var(--dm-cat-livros-tag-text)", base: "var(--dm-cat-livros-base)",
    },
  },
  {
    id: "ebooks",
    label: "Ebooks",
    description: "Produtos digitais e materiais de educação online",
    icon: FileText,
    tags: ["Ebook Bio Joelho", "Ebook Bio Coluna"],
    vars: {
      bg: "var(--dm-cat-ebooks-bg)", border: "var(--dm-cat-ebooks-border)", hoverBorder: "var(--dm-cat-ebooks-base)",
      iconBg: "var(--dm-cat-ebooks-tag-bg)", icon: "var(--dm-cat-ebooks-icon)", title: "var(--dm-cat-ebooks-title)",
      tagBg: "var(--dm-cat-ebooks-tag-bg)", tagText: "var(--dm-cat-ebooks-tag-text)", base: "var(--dm-cat-ebooks-base)",
    },
  },
  {
    id: "perpetuo",
    label: "Perpétuo",
    description: "Campanhas evergreen de oferta contínua sem data de encerramento",
    icon: Repeat,
    tags: ["Notável Play"],
    vars: {
      bg: "var(--dm-cat-perpetuo-bg)", border: "var(--dm-cat-perpetuo-border)", hoverBorder: "var(--dm-cat-perpetuo-base)",
      iconBg: "var(--dm-cat-perpetuo-tag-bg)", icon: "var(--dm-cat-perpetuo-icon)", title: "var(--dm-cat-perpetuo-title)",
      tagBg: "var(--dm-cat-perpetuo-tag-bg)", tagText: "var(--dm-cat-perpetuo-tag-text)", base: "var(--dm-cat-perpetuo-base)",
    },
  },
  {
    id: "eventos",
    label: "Eventos",
    description: "Eventos presenciais, mentorias e imersões",
    icon: CalendarDays,
    tags: ["Biomechanic Specialist", "Mentoria Scala", "Next", "Power Trainer"],
    vars: {
      bg: "var(--dm-cat-eventos-bg)", border: "var(--dm-cat-eventos-border)", hoverBorder: "var(--dm-cat-eventos-base)",
      iconBg: "var(--dm-cat-eventos-tag-bg)", icon: "var(--dm-cat-eventos-icon)", title: "var(--dm-cat-eventos-title)",
      tagBg: "var(--dm-cat-eventos-tag-bg)", tagText: "var(--dm-cat-eventos-tag-text)", base: "var(--dm-cat-eventos-base)",
    },
  },
];

// ─── Lookup maps (re-exported for header chip) ────────────────────────────────

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORY_CONFIGS.map((c) => [c.id, c.label]),
);

export const CATEGORY_ICON: Record<string, React.ElementType> = Object.fromEntries(
  CATEGORY_CONFIGS.map((c) => [c.id, c.icon]),
);

export const CATEGORY_DOT: Record<string, string> = Object.fromEntries(
  CATEGORY_CONFIGS.map((c) => [c.id, c.vars.base]),
);

// ─── Icon picker options ──────────────────────────────────────────────────────

const ICON_OPTIONS: Array<{ name: string; icon: React.ElementType; label: string }> = [
  { name: "Users",       icon: Users,       label: "Pessoas" },
  { name: "Zap",         icon: Zap,         label: "Performance" },
  { name: "Target",      icon: Target,      label: "Meta" },
  { name: "TrendingUp",  icon: TrendingUp,  label: "Crescimento" },
  { name: "Star",        icon: Star,        label: "Estrela" },
  { name: "Package",     icon: Package,     label: "Produto" },
  { name: "BarChart2",   icon: BarChart2,   label: "Análise" },
  { name: "Activity",    icon: Activity,    label: "Atividade" },
  { name: "Sparkles",    icon: Sparkles,    label: "Destaque" },
  { name: "Globe",       icon: Globe,       label: "Global" },
  { name: "Heart",       icon: Heart,       label: "Engajamento" },
  { name: "ImageIcon",   icon: ImageIcon,   label: "Mídia" },
  { name: "Wallet",      icon: Wallet,      label: "Financeiro" },
  { name: "Award",       icon: Award,       label: "Prêmio" },
  { name: "Trophy",      icon: Trophy,      label: "Resultado" },
  { name: "Rocket",      icon: Rocket,      label: "Lançamento" },
];

export const ICON_MAP: Record<string, React.ElementType> = Object.fromEntries(
  ICON_OPTIONS.map((o) => [o.name, o.icon]),
);

// ─── Color options ────────────────────────────────────────────────────────────

const COLOR_OPTIONS: Array<{ key: ColorKey; hex: string; label: string }> = [
  { key: "blue",    hex: "#0D9488", label: "Teal" },
  { key: "emerald", hex: "#10b981", label: "Verde" },
  { key: "violet",  hex: "#22C55E", label: "Verde-vivo" },
  { key: "amber",   hex: "#f59e0b", label: "Âmbar" },
  { key: "rose",    hex: "#f43f5e", label: "Rosa" },
  { key: "pink",    hex: "#ec4899", label: "Pink" },
  { key: "cyan",    hex: "#0F766E", label: "Verde-água" },
  { key: "orange",  hex: "#f97316", label: "Laranja" },
];

export const COLOR_HEX: Record<ColorKey, string> = Object.fromEntries(
  COLOR_OPTIONS.map((c) => [c.key, c.hex]),
) as Record<ColorKey, string>;

// ─── New Section Modal ────────────────────────────────────────────────────────

interface NewSectionModalProps {
  onSave: (section: CustomSection) => void;
  onClose: () => void;
}

function NewSectionModal({ onSave, onClose }: NewSectionModalProps) {
  const [label, setLabel]         = useState("");
  const [description, setDesc]    = useState("");
  const [iconName, setIconName]   = useState("Users");
  const [colorKey, setColorKey]   = useState<ColorKey>("blue");
  const [saving, setSaving]       = useState(false);

  const SelectedIcon = ICON_MAP[iconName] ?? Users;

  const handleSave = () => {
    if (!label.trim()) return;
    setSaving(true);
    const section: CustomSection = {
      id:          `custom_${Date.now()}`,
      label:       label.trim(),
      description: description.trim(),
      iconName,
      colorKey,
    };
    onSave(section);
    setSaving(false);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-6 shadow-2xl"
        style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ backgroundColor: COLOR_HEX[colorKey] + "20", color: COLOR_HEX[colorKey] }}
            >
              <SelectedIcon size={18} />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>Nova Categoria</p>
              <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Crie uma categoria personalizada</p>
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ color: "var(--dm-text-tertiary)" }} className="transition hover:opacity-70">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-secondary)" }}>
              Nome da categoria *
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="Ex: Perfis de Instagram"
              autoFocus
              className="h-9 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-2"
              style={{
                borderColor: "var(--dm-border-default)",
                backgroundColor: "var(--dm-bg-elevated)",
                color: "var(--dm-text-primary)",
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-secondary)" }}>
              Descrição (opcional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Ex: Acompanhamento de crescimento do perfil"
              className="h-9 w-full rounded-lg border px-3 text-sm outline-none transition"
              style={{
                borderColor: "var(--dm-border-default)",
                backgroundColor: "var(--dm-bg-elevated)",
                color: "var(--dm-text-primary)",
              }}
            />
          </div>

          {/* Icon picker */}
          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-secondary)" }}>
              Ícone
            </label>
            <div className="grid grid-cols-8 gap-1.5">
              {ICON_OPTIONS.map(({ name, icon: Ico }) => (
                <button
                  key={name}
                  type="button"
                  title={name}
                  onClick={() => setIconName(name)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border transition"
                  style={{
                    backgroundColor: iconName === name ? COLOR_HEX[colorKey] + "20" : "var(--dm-bg-elevated)",
                    borderColor: iconName === name ? COLOR_HEX[colorKey] : "var(--dm-border-default)",
                    color: iconName === name ? COLOR_HEX[colorKey] : "var(--dm-text-secondary)",
                  }}
                >
                  <Ico size={15} />
                </button>
              ))}
            </div>
          </div>

          {/* Color picker */}
          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-secondary)" }}>
              Cor
            </label>
            <div className="flex gap-2">
              {COLOR_OPTIONS.map(({ key, hex, label: lbl }) => (
                <button
                  key={key}
                  type="button"
                  title={lbl}
                  onClick={() => setColorKey(key)}
                  className="h-7 w-7 rounded-full border-2 transition hover:scale-110"
                  style={{
                    backgroundColor: hex,
                    borderColor: colorKey === key ? "var(--dm-text-primary)" : "transparent",
                    outline: colorKey === key ? `2px solid ${hex}40` : "none",
                    outlineOffset: "2px",
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border py-2 text-sm font-semibold transition hover:bg-black/5 dark:hover:bg-white/5"
            style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!label.trim() || saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold text-white transition disabled:opacity-40"
            style={{ backgroundColor: COLOR_HEX[colorKey] }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Criar categoria
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Gate component ───────────────────────────────────────────────────────────

interface CategoryGateProps {
  onSelect: (cat: ProductCategory) => void;
  customSections?: CustomSection[];
  onAddSection?: (section: CustomSection) => void;
  onRemoveSection?: (id: string) => void;
}

export function CategoryGate({
  onSelect,
  customSections = [],
  onAddSection,
  onRemoveSection,
}: CategoryGateProps) {
  const [showModal, setShowModal] = useState(false);
  const { company } = useCompany();

  // ponytail: template da empresa decide os cards — legado sem config mantém os 5 fixos.
  const templateCats = useMemo(
    () => companyTemplateCategories(company?.settings),
    [company?.settings],
  );
  const builtinCards = useMemo(() => {
    const slugs = new Set(templateCats.map((c) => c.slug));
    return CATEGORY_CONFIGS.filter((c) => slugs.has(c.id));
  }, [templateCats]);
  const companyCards = useMemo(() => {
    const builtinIds = new Set<string>(CATEGORY_CONFIGS.map((c) => c.id));
    return templateCats.filter((c) => !builtinIds.has(c.slug));
  }, [templateCats]);

  const handleAddSection = (section: CustomSection) => {
    onAddSection?.(section);
    // Immediately select the new custom category
    onSelect(section.id);
  };

  return (
    <div className="flex min-h-[min(70vh,560px)] flex-col items-center justify-center px-4 py-10 sm:py-14">
      {showModal && (
        <NewSectionModal
          onSave={handleAddSection}
          onClose={() => setShowModal(false)}
        />
      )}

      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="mb-8 text-center sm:mb-10">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)" }}>
            <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: "var(--dm-brand-500)" }}>1</span>
            Passo 1 de 2 — área de negócio
          </p>
          <div
            className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg"
            style={{ backgroundColor: "var(--dm-brand-500)" }}
          >
            <GraduationCap size={28} style={{ color: "var(--dm-text-inverse)" }} />
          </div>
          <h1
            className="text-2xl font-bold tracking-tight sm:text-3xl"
            style={{ color: "var(--dm-text-primary)" }}
          >
            Que tipo de campanhas quer ver primeiro?
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed" style={{ color: "var(--dm-text-secondary)" }}>
            Cada cartão agrupa um conjunto de cursos e métricas. Pode mudar mais tarde pelo canto superior do dashboard.
          </p>
        </div>

        {/* Cards — responsive grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {builtinCards.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelect(cat.id)}
              className="dm-cat-card group relative flex flex-col rounded-2xl border p-6 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
              style={{
                backgroundColor: "var(--dm-bg-surface)",
                borderColor: "var(--dm-border-default)",
                "--dm-cat-card-hover-border": "var(--dm-brand-500)",
              } as React.CSSProperties}
            >
              <div
                className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl"
                style={{ backgroundColor: "var(--dm-bg-elevated)" }}
              >
                <cat.icon size={20} style={{ color: cat.vars.base }} />
              </div>

              {/* Title + description */}
              <p className="text-[15px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>{cat.label}</p>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--dm-text-secondary)" }}>
                {cat.description}
              </p>

              {/* Tags — neutral */}
              <div className="mt-4 flex flex-wrap gap-1">
                {cat.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md px-2 py-0.5 text-[10px] font-medium"
                    style={{ backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)" }}
                  >
                    {tag}
                  </span>
                ))}
                {cat.tags.length > 3 && (
                  <span
                    className="rounded-md px-2 py-0.5 text-[10px] font-medium"
                    style={{ backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)" }}
                  >
                    +{cat.tags.length - 3}
                  </span>
                )}
              </div>

              {/* Hover indicator */}
              <span
                className="absolute right-4 top-4 h-2 w-2 rounded-full opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                style={{ backgroundColor: "var(--dm-brand-500)" }}
              />
            </button>
          ))}

          {/* Filtros configurados no Painel Admin (empresa nova sem os 5 fixos) */}
          {companyCards.map((cat) => (
            <button
              key={cat.slug}
              type="button"
              onClick={() => onSelect(cat.slug)}
              className="dm-cat-card group relative flex flex-col rounded-2xl border p-6 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
              style={{
                backgroundColor: "var(--dm-bg-surface)",
                borderColor: "var(--dm-border-default)",
                "--dm-cat-card-hover-border": "var(--dm-brand-500)",
              } as React.CSSProperties}
            >
              <div
                className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl"
                style={{ backgroundColor: "var(--dm-bg-elevated)" }}
              >
                <Target size={20} style={{ color: "var(--dm-brand-500)" }} />
              </div>
              <p className="text-[15px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>{cat.name}</p>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--dm-text-secondary)" }}>
                Filtro configurado pela empresa
              </p>
              <div className="mt-4">
                <span
                  className="rounded-md px-2 py-0.5 text-[10px] font-medium"
                  style={{ backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)" }}
                >
                  Empresa
                </span>
              </div>
              <span
                className="absolute right-4 top-4 h-2 w-2 rounded-full opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                style={{ backgroundColor: "var(--dm-brand-500)" }}
              />
            </button>
          ))}

          {/* Empresa nova sem filtros configurados */}
          {builtinCards.length === 0 && companyCards.length === 0 && customSections.length === 0 && (
            <div
              className="col-span-full rounded-2xl border border-dashed p-6 text-center text-sm"
              style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}
            >
              Esta empresa ainda não tem filtros configurados. Peça ao administrador para configurar
              em Painel Admin → Filtros &amp; histórico, ou crie uma categoria personalizada abaixo.
            </div>
          )}

          {/* Separador visual — só aparece se houver categorias personalizadas */}
          {customSections.length > 0 && (
            <div className="col-span-full flex items-center gap-3 pt-2">
              <div className="h-px flex-1" style={{ backgroundColor: "var(--dm-border-subtle)" }} />
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>
                Personalizadas
              </span>
              <div className="h-px flex-1" style={{ backgroundColor: "var(--dm-border-subtle)" }} />
            </div>
          )}

          {/* Custom section cards */}
          {customSections.map((sec) => {
            const Ico = ICON_MAP[sec.iconName] ?? Package;
            const hex = COLOR_HEX[sec.colorKey] ?? "#16A34A";
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => onSelect(sec.id)}
                className="group relative flex flex-col rounded-xl border p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}
              >
                {/* Delete button */}
                {onRemoveSection && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRemoveSection(sec.id); }}
                    className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full opacity-0 transition group-hover:opacity-100 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30"
                    style={{ color: "var(--dm-text-tertiary)" }}
                    title="Remover categoria"
                  >
                    <X size={12} />
                  </button>
                )}
                <div
                  className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{ backgroundColor: hex + "18", color: hex }}
                >
                  <Ico size={18} />
                </div>
                <p className="text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>{sec.label}</p>
                <p className="mt-1 text-[11px] leading-relaxed" style={{ color: "var(--dm-text-secondary)" }}>
                  {sec.description || "Categoria personalizada"}
                </p>
                <div className="mt-3">
                  <span
                    className="rounded-md px-2 py-0.5 text-[10px] font-medium"
                    style={{ backgroundColor: hex + "15", color: hex }}
                  >
                    Personalizado
                  </span>
                </div>
                <span
                  className="absolute right-4 top-4 h-2 w-2 rounded-full opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                  style={{ backgroundColor: hex }}
                />
              </button>
            );
          })}

          {/* + Nova Categoria card — máx 3 personalizadas */}
          {onAddSection && customSections.length < 3 && (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="group flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              style={{
                backgroundColor: "var(--dm-bg-surface)",
                borderColor: "var(--dm-border-default)",
              }}
            >
              <div
                className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg transition group-hover:scale-110"
                style={{ backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)" }}
              >
                <Plus size={20} />
              </div>
              <p className="text-sm font-semibold" style={{ color: "var(--dm-text-secondary)" }}>Nova Categoria</p>
              <p className="mt-1 text-center text-[11px] leading-relaxed" style={{ color: "var(--dm-text-tertiary)" }}>
                Crie uma categoria personalizada para seus anúncios
              </p>
            </button>
          )}
        </div>

        <p className="mt-8 text-center text-xs leading-relaxed" style={{ color: "var(--dm-text-tertiary)" }}>
          Dica: no telemóvel, use o menu ☰ para mudar de separador; no desktop, a categoria também aparece no topo ao lado do título da página.
        </p>
      </div>
    </div>
  );
}
