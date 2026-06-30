"use client";

import { useState } from "react";
import {
  ArrowLeft, BookOpen, CalendarDays, Copy, Edit3, ExternalLink,
  GraduationCap, Link2, Loader2, Package, Plus, Tag, Trash2, Users,
  Layers, Gift, ArrowRight,
} from "lucide-react";
import { ProductData, ProductType, COURSE_GROUPS_PRODUCT } from "@/types/product";
import { useProductStore } from "@/hooks/useProductStore";
import { ProductForm } from "./ProductForm";
import { ProdutosEmpty } from "@/components/empty/ProdutosEmpty";

const BRAND_GRAD = "var(--dm-btn-primary-bg)";

// ─── Product card ─────────────────────────────────────────────────────────────

interface ProductCardProps {
  product: ProductData;
  onView: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function ProductCard({ product: p, onView, onEdit, onDuplicate, onDelete }: ProductCardProps) {
  const isPos  = p.type === "pos";
  const course = COURSE_GROUPS_PRODUCT.find((g) => g.id === p.courseGroup);

  const linkCount = p.linksVenda.length + (p.paginasVenda?.length ?? 0);
  const delivCount = p.entregaveis?.length ?? 0;
  // Preço de referência: último lote (padrão) ou valor base.
  const refPrice = p.lotes.length > 0 ? p.lotes[p.lotes.length - 1].valor : p.valorBase;

  // Ações de hover não devem disparar o clique do card.
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

  return (
    <article
      onClick={onView}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onView(); }}
      className="group relative flex cursor-pointer flex-col gap-3 rounded-2xl border border-[color:var(--dm-border-default)] bg-[var(--dm-bg-surface)] p-4 transition-all hover:-translate-y-0.5 hover:border-[color:var(--dm-primary-border)] hover:shadow-lg"
    >
      {/* Chips + ações de hover */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ background: "var(--dm-primary-soft)", color: "var(--dm-primary)" }}>
            {isPos ? "Pós Grad." : "Imersão"}
          </span>
          {course && (
            <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
              style={{ background: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)" }}>
              {course.label}
            </span>
          )}
          {p.turmaVinculada && (
            <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
              style={{ background: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)" }}>
              {p.turmaVinculada}
            </span>
          )}
        </div>

        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button type="button" onClick={stop(onEdit)} title="Editar"
            className="flex h-7 w-7 items-center justify-center rounded-lg border transition hover:opacity-80"
            style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
            <Edit3 size={12} />
          </button>
          <button type="button" onClick={stop(onDuplicate)} title="Duplicar"
            className="flex h-7 w-7 items-center justify-center rounded-lg border transition hover:opacity-80"
            style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
            <Copy size={12} />
          </button>
          <button type="button" onClick={stop(onDelete)} title="Remover"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-300/40 text-red-400 transition hover:bg-red-500/10">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Nome + expert */}
      <div>
        <h3 className="text-[15px] font-bold leading-snug" style={{ color: "var(--dm-text-primary)" }}>
          {p.nome || "Sem nome"}
        </h3>
        {p.expert && (
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--dm-text-tertiary)" }}>{p.expert}</p>
        )}
      </div>

      {/* Promessa */}
      {p.promessa && (
        <p className="line-clamp-2 text-[12px] leading-relaxed" style={{ color: "var(--dm-text-secondary)" }}>
          {p.promessa}
        </p>
      )}

      {/* Rodapé: stats sutis + preço de referência */}
      <div className="mt-auto flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--dm-border-subtle)" }}>
        <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
          <span className="flex items-center gap-1" title="Lotes"><Layers size={12} /> {p.lotes.length}</span>
          <span className="flex items-center gap-1" title="Links de venda"><Link2 size={12} /> {linkCount}</span>
          <span className="flex items-center gap-1" title="Entregáveis"><Gift size={12} /> {delivCount}</span>
        </div>
        {refPrice
          ? <span className="text-[13px] font-bold" style={{ color: "var(--dm-primary)" }}>R$ {refPrice}</span>
          : <ArrowRight size={14} className="opacity-0 transition group-hover:opacity-100" style={{ color: "var(--dm-primary)" }} />}
      </div>
    </article>
  );
}

// ─── Product viewer (read-only) — Bento Grid ─────────────────────────────────

function BentoTile({
  children, className = "", style = {},
}: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`border p-5 ${className}`}
      style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)", borderRadius: "var(--dm-shape-xl)", ...style }}
    >
      {children}
    </div>
  );
}

function BentoLabel({ children }: { children: React.ReactNode }) {
  return <p className="dm-section-title mb-3">{children}</p>;
}

function ProductViewer({ product: p, onEdit, onClose }: { product: ProductData; onEdit: () => void; onClose: () => void }) {
  const isPos   = p.type === "pos";
  const course  = COURSE_GROUPS_PRODUCT.find((g) => g.id === p.courseGroup);
  const heroGrad = "linear-gradient(135deg, #0B3D24 0%, #15803D 55%, #22C55E 100%)";
  const accentColor = "#16A34A";
  const accentLight = "rgba(22,163,74,0.08)";

  const teamFields = [
    { label: "Expert",            value: p.expert },
    { label: "Coordenador",       value: p.coordenador },
    { label: "Head Marketing",    value: p.headMarketing },
    { label: "Líder Lançamentos", value: p.liderLancamentos },
    { label: "Gestor Tráfego",    value: p.gestorTrafego },
    { label: "Designer",          value: p.designer },
    { label: "Editor de Vídeo",   value: p.editorVideo },
    { label: "Social Media",      value: p.socialMedia },
    { label: "Web Designer",      value: p.webDesigner },
    { label: "Co-Produtores",     value: p.coProdutores },
  ].filter((f) => f.value);

  const hasLinks     = p.linksVenda?.length > 0 || p.paginasCaptura?.length > 0 || p.paginasVenda?.length > 0;
  const hasKeywords  = (p.palavrasChave?.length ?? 0) > 0;
  const hasAvatar    = !!(p.descricaoAvatar || p.paraQuemE);
  const hasPricing   = (p.lotes?.length ?? 0) > 0;
  const hasBonus     = p.bonus?.filter(Boolean).length > 0;
  const hasDeliv     = (p.entregaveis?.length ?? 0) > 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* ── Bento Grid body ── */}
      <div className="flex-1 p-5 lg:p-7">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* ── HERO — full width ── */}
          {/* shape-xl=28px com p-7 acima → top corners 100% visíveis */}
          <div
            className="col-span-1 md:col-span-2 lg:col-span-3 relative overflow-hidden"
            style={{ background: heroGrad, borderRadius: "var(--dm-shape-xl)", boxShadow: "0 20px 50px -24px rgba(11,61,36,0.7)" }}
          >
            {/* orbs decorativos + brilho superior */}
            <div className="absolute -top-16 -right-16 h-64 w-64 rounded-full opacity-10" style={{ background: "white" }} />
            <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full opacity-[0.07]" style={{ background: "white" }} />
            <div className="absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)" }} />
            <div className="relative p-6 lg:p-8">
              {/* Controles — voltar + editar, dentro do hero (sem barra separada) */}
              <div className="mb-5 flex items-center justify-between">
                <button
                  type="button" onClick={onClose}
                  className="flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-[12px] font-semibold text-white backdrop-blur-sm transition hover:bg-white/25"
                >
                  <ArrowLeft size={15} /> Voltar
                </button>
                <button
                  type="button" onClick={onEdit}
                  className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-[13px] font-semibold shadow-lg transition hover:-translate-y-0.5"
                  style={{ color: "#15803D" }}
                >
                  <Edit3 size={14} /> Editar
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider bg-white/20 text-white">
                  {isPos ? <GraduationCap size={12} /> : <CalendarDays size={12} />}
                  {isPos ? "Pós Graduação" : "Imersão"}
                </span>
                {course && (
                  <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold bg-white/10 text-white/75">
                    {course.label}
                  </span>
                )}
                {p.turmaVinculada && (
                  <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold bg-emerald-400/25 text-emerald-300">
                    {p.turmaVinculada}
                  </span>
                )}
              </div>
              <h2
                className="text-xl lg:text-2xl font-bold text-white leading-tight mb-3"
                style={{ fontFamily: "var(--font-poppins)" }}
              >
                {p.nome || "Sem nome"}
              </h2>
              {p.promessa && (
                <p className="text-sm text-white/80 leading-relaxed mb-4 max-w-2xl">{p.promessa}</p>
              )}
              {p.subPromessas?.filter((s) => s.text).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {p.subPromessas.filter((s) => s.text).map((s) => (
                    <span
                      key={s.id}
                      className="flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1"
                    >
                      <span className="h-1 w-1 flex-shrink-0 rounded-full bg-white/50" />
                      <span className="text-[11px] text-white/75">{s.text}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── PRECIFICAÇÃO ── */}
          {hasPricing && (
            <BentoTile>
              <BentoLabel>Precificação</BentoLabel>
              {p.valorBase && (
                <p className="text-[11px] mb-3" style={{ color: "var(--dm-text-secondary)" }}>
                  Valor base:{" "}
                  <span className="font-bold" style={{ color: "var(--dm-text-primary)" }}>
                    R$ {p.valorBase}
                  </span>
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {p.lotes.map((l) => (
                  <div
                    key={l.id}
                    className="rounded-xl p-3"
                    style={{ background: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-subtle)" }}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "var(--dm-text-tertiary)" }}>
                      {l.label}
                    </p>
                    <p className="text-base font-bold" style={{ color: "var(--dm-brand-500)" }}>
                      R$ {l.valor}
                    </p>
                    {l.promo && (
                      <p className="text-[10px] mt-0.5" style={{ color: "var(--dm-text-tertiary)" }}>{l.promo}</p>
                    )}
                  </div>
                ))}
              </div>
            </BentoTile>
          )}

          {/* ── EQUIPE — spans 2 when pricing exists, 3 when not ── */}
          {teamFields.length > 0 && (
            <BentoTile className={hasPricing ? "col-span-1 md:col-span-1 lg:col-span-2" : "col-span-1 md:col-span-2 lg:col-span-3"}>
              <BentoLabel>Equipe</BentoLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {teamFields.map((f) => (
                  <div
                    key={f.label}
                    className="rounded-xl p-2.5"
                    style={{ background: "var(--dm-bg-elevated)" }}
                  >
                    <p className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--dm-text-tertiary)" }}>
                      {f.label}
                    </p>
                    <p className="text-[12px] font-semibold leading-snug" style={{ color: "var(--dm-text-primary)" }}>
                      {f.value}
                    </p>
                  </div>
                ))}
              </div>
            </BentoTile>
          )}

          {/* ── ENTREGÁVEIS — spans 2 when bonus exists ── */}
          {hasDeliv && (
            <BentoTile className={hasBonus ? "col-span-1 md:col-span-1 lg:col-span-2" : "col-span-1 md:col-span-2 lg:col-span-3"}>
              <BentoLabel>Entregáveis</BentoLabel>
              <div className="space-y-3">
                {p.entregaveis.map((e) => (
                  <div
                    key={e.id}
                    className="rounded-xl p-3"
                    style={{ background: "var(--dm-bg-elevated)" }}
                  >
                    <p className="text-[12px] font-bold mb-2" style={{ color: "var(--dm-text-primary)" }}>
                      {e.titulo}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                      {e.itens.map((i) => (
                        <div key={i.id} className="flex items-start gap-2">
                          <span
                            className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full"
                            style={{ background: "#05CD99" }}
                          />
                          <p className="text-[11px]" style={{ color: "var(--dm-text-secondary)" }}>{i.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </BentoTile>
          )}

          {/* ── BÔNUS ── */}
          {hasBonus && (
            <BentoTile>
              <BentoLabel>Bônus</BentoLabel>
              <div className="space-y-2">
                {p.bonus.filter(Boolean).map((b, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 rounded-xl p-2.5"
                    style={{ background: "var(--dm-bg-elevated)" }}
                  >
                    <span className="flex-shrink-0 text-sm">🎁</span>
                    <p className="text-[12px]" style={{ color: "var(--dm-text-secondary)" }}>{b}</p>
                  </div>
                ))}
              </div>
            </BentoTile>
          )}

          {/* ── LINKS — full width ── */}
          {hasLinks && (
            <BentoTile className="col-span-1 md:col-span-2 lg:col-span-3">
              <BentoLabel>Links</BentoLabel>
              <div className="flex flex-wrap gap-2">
                {p.paginasCaptura?.map((l) => (
                  <a
                    key={l.id}
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-medium transition hover:opacity-80"
                    style={{
                      background: "var(--dm-bg-elevated)",
                      border: "1px solid var(--dm-border-default)",
                      color: "var(--dm-brand-500)",
                    }}
                  >
                    <Link2 size={10} />
                    <span className="font-semibold" style={{ color: "var(--dm-text-secondary)" }}>{l.label}:</span>
                    <span className="truncate max-w-[200px]">{l.url}</span>
                    <ExternalLink size={9} style={{ color: "var(--dm-text-tertiary)", flexShrink: 0 }} />
                  </a>
                ))}
                {p.paginasVenda?.map((l) => (
                  <a
                    key={l.id}
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-medium transition hover:opacity-80"
                    style={{
                      background: "var(--dm-bg-elevated)",
                      border: "1px solid var(--dm-border-default)",
                      color: "var(--dm-brand-500)",
                    }}
                  >
                    <Link2 size={10} />
                    <span className="font-semibold" style={{ color: "var(--dm-text-secondary)" }}>{l.label}:</span>
                    <span className="truncate max-w-[200px]">{l.url}</span>
                    <ExternalLink size={9} style={{ color: "var(--dm-text-tertiary)", flexShrink: 0 }} />
                  </a>
                ))}
                {p.linksVenda?.map((l) => (
                  <a
                    key={l.id}
                    href={l.link}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-medium transition hover:opacity-80"
                    style={{
                      background: accentLight,
                      border: `1px solid ${accentColor}30`,
                      color: accentColor,
                    }}
                  >
                    <Tag size={10} />
                    <span className="font-semibold">{l.turma} · R$ {l.valor}:</span>
                    <span className="truncate max-w-[200px]">{l.link}</span>
                    <ExternalLink size={9} style={{ flexShrink: 0 }} />
                  </a>
                ))}
              </div>
            </BentoTile>
          )}

          {/* ── PALAVRAS-CHAVE ── */}
          {hasKeywords && (
            <BentoTile className={hasAvatar ? "" : "col-span-1 md:col-span-2 lg:col-span-3"}>
              <BentoLabel>Palavras-chave</BentoLabel>
              <div className="flex flex-wrap gap-1.5">
                {p.palavrasChave.map((w, i) => (
                  <span
                    key={i}
                    className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                    style={{ background: accentLight, color: accentColor }}
                  >
                    {w}
                  </span>
                ))}
              </div>
            </BentoTile>
          )}

          {/* ── PÚBLICO-ALVO — spans 2 when keywords exist ── */}
          {hasAvatar && (
            <BentoTile className={hasKeywords ? "col-span-1 md:col-span-1 lg:col-span-2" : "col-span-1 md:col-span-2 lg:col-span-3"}>
              <BentoLabel>Público-alvo</BentoLabel>
              {p.descricaoAvatar && (
                <div className="mb-4">
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                    style={{ color: "var(--dm-text-tertiary)" }}
                  >
                    Descrição do avatar
                  </p>
                  <div
                    className="text-[13px] prose prose-sm max-w-none dark:prose-invert"
                    style={{ color: "var(--dm-text-primary)" }}
                    dangerouslySetInnerHTML={{ __html: p.descricaoAvatar }}
                  />
                </div>
              )}
              {p.paraQuemE && (
                <div>
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                    style={{ color: "var(--dm-text-tertiary)" }}
                  >
                    Para quem é
                  </p>
                  <div
                    className="text-[13px] prose prose-sm max-w-none dark:prose-invert"
                    style={{ color: "var(--dm-text-primary)" }}
                    dangerouslySetInnerHTML={{ __html: p.paraQuemE }}
                  />
                </div>
              )}
            </BentoTile>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon, title, count,
}: {
  icon: React.ElementType; title: string; count: number;
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg"
        style={{ background: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-default)" }}>
        <Icon size={15} style={{ color: "var(--dm-text-secondary)" }} />
      </div>
      <div>
        <h2 className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>{title}</h2>
        <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>{count} produto{count !== 1 ? "s" : ""}</p>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ type, onAdd }: { type: ProductType; onAdd: () => void }) {
  const isPos = type === "pos";
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-10 text-center"
      style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)" }}>
      <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: "var(--dm-primary-soft)" }}>
        {isPos ? <GraduationCap size={20} style={{ color: "var(--dm-primary)" }} /> : <CalendarDays size={20} style={{ color: "var(--dm-primary)" }} />}
      </div>
      <div>
        <p className="text-sm font-semibold" style={{ color: "var(--dm-text-secondary)" }}>
          Nenhuma {isPos ? "pós-graduação" : "imersão"} cadastrada
        </p>
        <p className="mt-0.5 text-xs" style={{ color: "var(--dm-text-tertiary)" }}>
          Clique em <span className="font-semibold">+ Novo produto</span> para adicionar
        </p>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="mt-1 flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-hover"
      >
        <Plus size={12} /> Adicionar {isPos ? "Pós Graduação" : "Imersão"}
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type View = "list" | "add" | "edit" | "view";

interface ProductBaseProps {
  // Seleção do produto aberto, controlada pelo Dashboard (mantém ao trocar de aba + nomeia a aba).
  viewId?: string | null;
  onOpenView?: (p: ProductData) => void;
  onCloseView?: () => void;
}

export function ProductBase({ viewId, onOpenView, onCloseView }: ProductBaseProps = {}) {
  const controlled = onOpenView !== undefined;
  const [view,    setView]    = useState<View>("list");
  const [editing, setEditing] = useState<ProductData | null>(null);
  const [localViewId, setLocalViewId] = useState<string | null>(null);

  const { products, addProduct, updateProduct, deleteProduct, syncStatus } = useProductStore();

  const effectiveViewId = controlled ? (viewId ?? null) : localViewId;
  const viewing = effectiveViewId ? products.find((p) => p.id === effectiveViewId) ?? null : null;

  const posList     = products.filter((p) => p.type === "pos");
  const imersaoList = products.filter((p) => p.type === "imersao");

  // Agrupamento da Base = categoria personalizada (preenchida no produto).
  // Legado/sem categoria cai no rótulo do tipo (Pós Graduação / Imersão).
  const groups = (() => {
    const m = new Map<string, ProductData[]>();
    for (const p of products) {
      const key = p.categoria?.trim() || (p.type === "pos" ? "Pós Graduação" : "Imersão");
      const arr = m.get(key) ?? [];
      arr.push(p);
      m.set(key, arr);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  })();

  // Categorias já existentes — alimentam o combobox do formulário.
  const existingCategories = [...new Set(
    products.map((p) => p.categoria?.trim()).filter((c): c is string => !!c),
  )].sort((a, b) => a.localeCompare(b, "pt-BR"));

  const handleAdd = () => { setEditing(null); setView("add"); };

  const handleView = (p: ProductData) => {
    if (controlled) onOpenView!(p);
    else setLocalViewId(p.id);
  };
  const handleCloseView = () => {
    if (controlled) onCloseView!();
    else setLocalViewId(null);
  };

  const handleEdit = (p: ProductData) => { setEditing(p); setView("edit"); };

  const handleDelete = (id: string) => {
    if (!confirm("Remover este produto da base?")) return;
    deleteProduct(id);
  };

  const handleDuplicate = (p: ProductData) => {
    const now = new Date().toISOString();
    addProduct({ ...p, id: crypto.randomUUID(), nome: `${p.nome} (Cópia)`, createdAt: now, updatedAt: now });
  };

  const handleSave = (p: ProductData) => {
    if (editing) updateProduct(p);
    else addProduct(p);
    setView("list");
    setEditing(null);
  };

  const handleCancel = () => { setView("list"); setEditing(null); };

  // ── Form view (add/edit tem prioridade) ───────────────────────────────────
  if (view === "add" || view === "edit") {
    return (
      <ProductForm
        product={editing}
        existingCategories={existingCategories}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    );
  }

  // ── Viewer (read-only) — controlado por viewId ────────────────────────────
  if (viewing) {
    return (
      <ProductViewer
        product={viewing}
        onEdit={() => { setEditing(viewing); setView("edit"); }}
        onClose={handleCloseView}
      />
    );
  }

  // ── Empty onboarding (no products yet) ────────────────────────────────────
  if (products.length === 0) {
    return (
      <div className="p-6">
        <ProdutosEmpty onAddProduct={handleAdd} />
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">

      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 shadow-sm dark:bg-slate-700">
              <Package size={16} className="text-white" />
            </div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Base de Produtos</h1>
            {syncStatus === "loading" && (
              <span className="flex items-center gap-1 text-[10px] text-slate-400"><Loader2 size={11} className="animate-spin" /> Sincronizando…</span>
            )}
            {syncStatus === "synced" && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">✓ Sincronizado</span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400 ml-11 dark:text-slate-500">
            Cadastre pós-graduações e imersões com promessa, entregáveis e links de venda
          </p>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-hover"
        >
          <Plus size={14} /> Novo produto
        </button>
      </div>

      {/* Stats summary */}
      {products.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total de produtos", value: products.length, color: "text-slate-900 dark:text-slate-100" },
            { label: "Pós Graduações",    value: posList.length,   color: "text-[#15803D] dark:text-[#22C55E]" },
            { label: "Imersões",          value: imersaoList.length, color: "text-slate-600 dark:text-slate-300" },
            { label: "Com links de venda",value: products.filter((p) => p.linksVenda.length > 0 || p.paginasVenda?.length > 0).length, color: "text-emerald-700 dark:text-emerald-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl p-4 shadow-sm"
              style={{ border: "1px solid var(--dm-border-default)", background: "var(--dm-bg-surface)" }}>
              <p className="text-2xl font-bold" style={{ color: "var(--dm-text-primary)" }}>{value}</p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--dm-text-tertiary)" }}>{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Seções por categoria (personalizada) ── */}
      {groups.map(([categoria, items]) => (
        <section key={categoria}>
          <SectionHeader
            icon={Package}
            title={categoria}
            count={items.length}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                onView={() => handleView(p)}
                onEdit={() => handleEdit(p)}
                onDuplicate={() => handleDuplicate(p)}
                onDelete={() => handleDelete(p.id)}
              />
            ))}
            <button
              type="button"
              onClick={handleAdd}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-8 text-center transition hover:bg-[var(--dm-primary-soft)]"
              style={{ borderColor: "var(--dm-border-default)" }}
            >
              <Plus size={18} style={{ color: "var(--dm-text-tertiary)" }} />
              <span className="text-xs font-semibold" style={{ color: "var(--dm-text-tertiary)" }}>Adicionar em {categoria}</span>
            </button>
          </div>
        </section>
      ))}

    </div>
  );
}
