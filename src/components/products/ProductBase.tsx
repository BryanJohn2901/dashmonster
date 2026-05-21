"use client";

import { useState } from "react";
import {
  ArrowLeft, BookOpen, CalendarDays, Copy, Edit3, ExternalLink,
  GraduationCap, Link2, Loader2, Package, Plus, Tag, Trash2, Users,
} from "lucide-react";
import { ProductData, ProductType, COURSE_GROUPS_PRODUCT } from "@/types/product";
import { useProductStore } from "@/hooks/useProductStore";
import { ProductForm } from "./ProductForm";
import { TabLanding } from "@/components/TabLanding";

const BRAND_GRAD = "linear-gradient(135deg, #6366C8 0%, #313491 100%)";

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

  const accent = isPos ? "#313491" : "#7C3AED";
  const badgeBg = isPos ? "rgba(49,52,145,0.08)" : "rgba(124,58,237,0.08)";
  const badgeColor = isPos ? "#313491" : "#7C3AED";

  return (
    <article
      className="group relative flex flex-col rounded-[20px] border bg-white dark:bg-[#0F1020] shadow-horizon transition-all hover:-translate-y-0.5"
      style={{ borderColor: "var(--dm-border-default)", borderLeftWidth: 3, borderLeftColor: accent }}
    >
      <div className="flex flex-col flex-1 p-4 gap-3">
        {/* Badges + actions */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={{ background: badgeBg, color: badgeColor }}
            >
              {isPos ? "Pós Grad." : "Imersão"}
            </span>
            {course && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)" }}>
                {course.label}
              </span>
            )}
            {p.turmaVinculada && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-[#05CD99]"
                style={{ background: "rgba(5,205,153,0.10)" }}>
                {p.turmaVinculada}
              </span>
            )}
          </div>

          {/* Hover actions */}
          <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button type="button" onClick={onEdit} title="Editar"
              className="flex h-7 w-7 items-center justify-center rounded-lg border transition hover:opacity-80"
              style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
              <Edit3 size={12} />
            </button>
            <button type="button" onClick={onDuplicate} title="Duplicar"
              className="flex h-7 w-7 items-center justify-center rounded-lg border transition hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-900/20"
              style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
              <Copy size={12} />
            </button>
            <button type="button" onClick={onDelete} title="Remover"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 text-red-400 transition hover:bg-red-50 dark:border-red-800/50 dark:hover:bg-red-900/20">
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {/* Nome + expert */}
        <div>
          <h3 className="text-sm font-bold leading-snug" style={{ color: "var(--dm-text-primary)" }}>
            {p.nome || "Sem nome"}
          </h3>
          {p.expert && (
            <p className="mt-0.5 text-xs" style={{ color: "var(--dm-text-tertiary)" }}>{p.expert}</p>
          )}
        </div>

        {/* Promessa */}
        {p.promessa && (
          <p className="line-clamp-2 text-[12px] leading-relaxed" style={{ color: "var(--dm-text-secondary)" }}>
            {p.promessa}
          </p>
        )}

        {/* Pills de contagem */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t" style={{ borderColor: "var(--dm-border-subtle)" }}>
          {p.lotes.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)" }}>
              {p.lotes.length} lote{p.lotes.length !== 1 ? "s" : ""}
            </span>
          )}
          {(p.linksVenda.length > 0 || (p.paginasVenda?.length ?? 0) > 0) && (
            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)" }}>
              {p.linksVenda.length + (p.paginasVenda?.length ?? 0)} link{(p.linksVenda.length + (p.paginasVenda?.length ?? 0)) !== 1 ? "s" : ""}
            </span>
          )}
          {p.entregaveis?.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)" }}>
              {p.entregaveis.length} entregável{p.entregaveis.length !== 1 ? "is" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Botão Visualizar — separado do editar */}
      <button
        type="button"
        onClick={onView}
        className="flex w-full items-center justify-center gap-1.5 rounded-b-[20px] border-t py-2.5 text-[12px] font-semibold transition hover:opacity-90"
        style={{ borderColor: "var(--dm-border-default)", background: BRAND_GRAD, color: "#fff" }}
      >
        Visualizar produto
      </button>
    </article>
  );
}

// ─── Product viewer (read-only) — Bento Grid ─────────────────────────────────

function BentoTile({
  children, className = "", style = {},
}: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-[20px] border p-5 ${className}`}
      style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)", ...style }}
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
  const heroGrad = isPos
    ? "linear-gradient(135deg, #1a1f6e 0%, #313491 55%, #4d50aa 100%)"
    : "linear-gradient(135deg, #3b0764 0%, #7c3aed 55%, #a78bfa 100%)";
  const accentColor = isPos ? "#313491" : "#7C3AED";
  const accentLight = isPos ? "rgba(49,52,145,0.08)" : "rgba(124,58,237,0.08)";

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
      {/* ── Sticky header ── */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between gap-3 px-6 py-4 border-b"
        style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)" }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button" onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl border transition hover:opacity-70"
            style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}
          >
            <ArrowLeft size={14} />
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: accentLight, color: accentColor }}
              >
                {isPos ? "Pós Grad." : "Imersão"}
              </span>
              {course && <span className="text-[10px] text-slate-400">{course.label}</span>}
              {p.turmaVinculada && <span className="text-[10px] font-semibold text-[#05CD99]">{p.turmaVinculada}</span>}
            </div>
            <h1
              className="text-base font-bold mt-0.5 truncate max-w-xs"
              style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins)" }}
            >
              {p.nome || "Sem nome"}
            </h1>
          </div>
        </div>
        <button
          type="button" onClick={onEdit}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-90"
          style={{ background: BRAND_GRAD }}
        >
          <Edit3 size={13} /> Editar
        </button>
      </div>

      {/* ── Bento Grid body ── */}
      <div className="flex-1 p-4 lg:p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* ── HERO — full width ── */}
          <div
            className="col-span-1 md:col-span-2 lg:col-span-3 rounded-[20px] relative overflow-hidden"
            style={{ background: heroGrad }}
          >
            {/* decorative orb */}
            <div
              className="absolute -top-16 -right-16 h-64 w-64 rounded-full opacity-10"
              style={{ background: "white" }}
            />
            <div className="relative p-6 lg:p-8">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider bg-white/20 text-white">
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
  icon: Icon, title, count, color,
}: {
  icon: React.ElementType; title: string; count: number; color: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
        <Icon size={15} />
      </div>
      <div>
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h2>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">{count} produto{count !== 1 ? "s" : ""}</p>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ type, onAdd }: { type: ProductType; onAdd: () => void }) {
  const isPos = type === "pos";
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 py-10 text-center dark:border-slate-700 dark:bg-slate-800/40">
      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${isPos ? "bg-blue-50 dark:bg-blue-900/30" : "bg-violet-50 dark:bg-violet-900/30"}`}>
        {isPos ? <GraduationCap size={20} className="text-blue-400" /> : <CalendarDays size={20} className="text-violet-400" />}
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
          Nenhuma {isPos ? "pós-graduação" : "imersão"} cadastrada
        </p>
        <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
          Clique em <span className="font-semibold">+ Novo produto</span> para adicionar
        </p>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className={`mt-1 flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-sm transition ${isPos ? "bg-brand hover:bg-brand-hover" : "bg-violet-600 hover:bg-violet-700"}`}
      >
        <Plus size={12} /> Adicionar {isPos ? "Pós Graduação" : "Imersão"}
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type View = "list" | "add" | "edit" | "view";

export function ProductBase() {
  const [view,    setView]    = useState<View>("list");
  const [editing, setEditing] = useState<ProductData | null>(null);
  const [viewing, setViewing] = useState<ProductData | null>(null);

  const { products, addProduct, updateProduct, deleteProduct, syncStatus } = useProductStore();

  const posList     = products.filter((p) => p.type === "pos");
  const imersaoList = products.filter((p) => p.type === "imersao");

  const handleAdd = () => { setEditing(null); setView("add"); };

  const handleView = (p: ProductData) => { setViewing(p); setView("view"); };

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

  // ── Viewer (read-only) ────────────────────────────────────────────────────
  if (view === "view" && viewing) {
    return (
      <ProductViewer
        product={viewing}
        onEdit={() => { setEditing(viewing); setView("edit"); }}
        onClose={() => { setViewing(null); setView("list"); }}
      />
    );
  }

  // ── Form view ──────────────────────────────────────────────────────────────
  if (view === "add" || view === "edit") {
    return (
      <ProductForm
        product={editing}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    );
  }

  // ── Empty onboarding (no products yet) ────────────────────────────────────
  if (products.length === 0) {
    return (
      <TabLanding
        icon={Package}
        title="Base de Produtos"
        subtitle="Cadastre seus produtos — pós-graduações e imersões — com promessa, entregáveis e links de venda. Vincule cada produto às campanhas que o promovem."
        features={[
          { icon: Package,    label: "Catálogo Centralizado",    description: "Todos os produtos em um lugar: nome, tipo, turma, promessa e entregáveis." },
          { icon: Users,      label: "Vinculação com Campanhas", description: "Associe cada produto aos grupos de campanha que o promovem no Meta Ads." },
          { icon: BookOpen,   label: "Links de Venda",           description: "Organize as páginas de venda e materiais de cada produto com facilidade." },
        ]}
        steps={[
          { label: "Cadastre o produto",   description: "Nome, tipo (pós ou imersão), turma e promessa principal." },
          { label: "Adicione detalhes",    description: "Entregáveis, links de vendas e página de checkout." },
          { label: "Vincule campanhas",    description: "Relacione com os grupos de campanha do Meta Ads para cruzar dados." },
        ]}
        cta={{ label: "Cadastrar primeiro produto", onClick: handleAdd }}
      />
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
            { label: "Total de produtos", value: products.length, color: "text-slate-900" },
            { label: "Pós Graduações",    value: posList.length,   color: "text-blue-700" },
            { label: "Imersões",          value: imersaoList.length, color: "text-violet-700" },
            { label: "Com links de venda",value: products.filter((p) => p.linksVenda.length > 0 || p.paginasVenda?.length > 0).length, color: "text-emerald-700" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl p-4 shadow-sm"
              style={{ border: "1px solid var(--dm-border-default)", background: "var(--dm-bg-surface)" }}>
              <p className="text-2xl font-bold" style={{ color: "var(--dm-text-primary)" }}>{value}</p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--dm-text-tertiary)" }}>{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Pós Graduação section ── */}
      <section>
        <SectionHeader
          icon={GraduationCap}
          title="Pós Graduação"
          count={posList.length}
          color="bg-blue-100 text-blue-600"
        />
        {posList.length === 0 ? (
          <EmptyState type="pos" onAdd={handleAdd} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {posList.map((p) => (
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
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 py-8 text-center transition hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:hover:border-blue-600 dark:hover:bg-blue-900/10"
            >
              <Plus size={18} className="text-slate-300 dark:text-slate-600" />
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">Nova Pós Graduação</span>
            </button>
          </div>
        )}
      </section>

      {/* ── Imersão section ── */}
      <section>
        <SectionHeader
          icon={CalendarDays}
          title="Imersões"
          count={imersaoList.length}
          color="bg-violet-100 text-violet-600"
        />
        {imersaoList.length === 0 ? (
          <EmptyState type="imersao" onAdd={handleAdd} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {imersaoList.map((p) => (
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
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 py-8 text-center transition hover:border-violet-300 hover:bg-violet-50 dark:border-slate-700 dark:hover:border-violet-600 dark:hover:bg-violet-900/10"
            >
              <Plus size={18} className="text-slate-300 dark:text-slate-600" />
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">Nova Imersão</span>
            </button>
          </div>
        )}
      </section>

    </div>
  );
}
