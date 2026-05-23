"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  CalendarDays, ExternalLink, Film, Filter, ImageIcon, Loader2,
  MousePointerClick, Play, RefreshCw, ShoppingCart, Star, Trophy, X,
} from "lucide-react";

import { AggregatedCampaign } from "@/types/campaign";
import { useCreativeStore } from "@/hooks/useCreativeStore";
import type { MetaCampaignCreative, AdInsight } from "@/utils/metaApi";
import { fetchMetaCreativesPage, fetchAdInsights, loadMetaCredentials } from "@/utils/metaApi";
import { formatCurrency, formatPercent } from "@/utils/metrics";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE      = 24;
const CACHE_TTL_MS   = 6 * 60 * 60 * 1000; // 6h

// ─── Types ────────────────────────────────────────────────────────────────────

interface BestCreativesProps {
  campaigns:             AggregatedCampaign[];
  adAccountId?:          string | string[];
  dateFrom?:             string;
  dateTo?:               string;
  /** Meta campaign IDs checked in the right panel — undefined = show all */
  selectedCampaignIds?:  string[];
  /** Human-readable label for the active group/filter */
  selectedGroupName?:    string;
}

type ActivityFilter = "all" | "with_data" | "no_data";

type SubTab       = "gallery" | "rankings" | "starred";
type MediaFilter  = "all" | "image" | "video" | "carousel";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<MetaCampaignCreative["mediaType"], string> = {
  image: "Imagem", video: "Vídeo", carousel: "Carrossel", unknown: "Anúncio",
};
const TYPE_COLOR: Record<MetaCampaignCreative["mediaType"], string> = {
  image:    "bg-emerald-500/10 text-emerald-500",
  video:    "bg-blue-500/10 text-blue-500",
  carousel: "bg-violet-500/10 text-violet-500",
  unknown:  "bg-slate-500/10 text-slate-400",
};

function getCacheKey(ids: string[]) { return `pta_creatives_v2_${ids.sort().join(",")}`; }
function readCache(key: string): MetaCampaignCreative[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw) as { ts: number; data: MetaCampaignCreative[] };
    if (Date.now() - ts > CACHE_TTL_MS) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}
function writeCache(key: string, data: MetaCampaignCreative[]) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

// ─── Thumbnail image (static — no iframe) ────────────────────────────────────

function AdThumb({ ad, onClick }: { ad: MetaCampaignCreative; onClick?: () => void }) {
  const [failed, setFailed] = useState(false);
  const hasImg = Boolean(ad.thumbnailUrl) && !failed;

  return (
    <div
      onClick={onClick}
      className={`relative w-full overflow-hidden bg-slate-900 ${onClick ? "cursor-pointer" : ""}`}
      style={{ aspectRatio: "4/5" }}
    >
      {hasImg ? (
        <img
          src={ad.thumbnailUrl}
          alt={ad.adName}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-600">
          {ad.mediaType === "video" ? <Film size={32} /> : <ImageIcon size={32} />}
          <span className="text-[11px]">Sem preview</span>
        </div>
      )}

      {/* Video play icon */}
      {ad.mediaType === "video" && hasImg && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 shadow-xl backdrop-blur-sm">
            <Play size={18} fill="white" className="ml-1 text-white" />
          </div>
        </div>
      )}

      {/* Media type badge */}
      <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold backdrop-blur-sm ${TYPE_COLOR[ad.mediaType]}`}
        style={{ backgroundColor: "rgba(0,0,0,0.45)" }}>
        {TYPE_LABEL[ad.mediaType]}
      </span>
    </div>
  );
}

// ─── Ad Preview iframe (used only in modal) ───────────────────────────────────

const iframeCache = new Map<string, string>();

function AdIframe({ ad, accessToken }: { ad: MetaCampaignCreative; accessToken: string }) {
  const [src, setSrc]     = useState<string | null>(iframeCache.get(ad.adId) ?? null);
  const [loading, setLoading] = useState(!iframeCache.has(ad.adId));

  useEffect(() => {
    if (src || !accessToken) return;
    setLoading(true);
    fetch(`/api/meta/ad-preview?${new URLSearchParams({ adId: ad.adId, accessToken })}`)
      .then((r) => r.json())
      .then((j: { iframeSrc?: string }) => {
        if (j.iframeSrc) { iframeCache.set(ad.adId, j.iframeSrc); setSrc(j.iframeSrc); }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ad.adId, accessToken, src]);

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <Loader2 size={24} className="animate-spin text-slate-500" />
    </div>
  );

  if (src) return (
    <iframe
      src={src}
      title={ad.adName}
      className="absolute inset-0 h-full w-full border-none"
      // Permissões necessárias para o preview interativo do Meta funcionar:
      // allow-forms: botões de CTA; allow-popups: links externos; allow-modals: diálogos.
      // allow-same-origin mantém cookies de sessão do Meta para renderizar o anúncio.
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-top-navigation-by-user-activation"
    />
  );

  // Fallback to thumbnail
  return <AdThumb ad={ad} />;
}

// ─── Creative Card ────────────────────────────────────────────────────────────

function CreativeCard({
  ad, insight, starred, onPreview, onToggleStar,
}: {
  ad: MetaCampaignCreative;
  insight?: AdInsight;
  starred: boolean;
  onPreview: () => void;
  onToggleStar: () => void;
}) {
  const score      = computeScore(insight);
  const scoreColor = score === null ? null : score >= 70 ? "#05CD99" : score >= 40 ? "#F4A60D" : "#EE5D50";

  const createdLabel = ad.createdTime
    ? new Date(ad.createdTime).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" })
    : null;

  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-xl border transition-all hover:shadow-lg hover:-translate-y-0.5"
      style={{
        borderColor: starred ? "rgba(245,158,11,0.6)" : "var(--dm-border-default)",
        backgroundColor: "var(--dm-bg-surface)",
      }}
    >
      {/* Thumbnail */}
      <AdThumb ad={ad} onClick={onPreview} />

      {/* Score badge — top left over thumbnail */}
      {score !== null && scoreColor && (
        <div
          className="absolute left-2 top-2 z-10 rounded-[6px] px-2 py-0.5 text-[10px] font-bold"
          style={{ background: "rgba(0,0,0,0.65)", color: scoreColor, border: `1px solid ${scoreColor}50`, backdropFilter: "blur(4px)" }}
        >
          {score}
        </div>
      )}

      {/* Hover overlay actions */}
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 z-10">
        <button type="button" onClick={onToggleStar}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 backdrop-blur-sm hover:bg-black/80">
          <Star size={12} fill={starred ? "#f59e0b" : "none"} stroke={starred ? "#f59e0b" : "white"} />
        </button>
        {ad.instagramUrl && (
          <a href={ad.instagramUrl} target="_blank" rel="noopener noreferrer" title="Ver no Instagram"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 backdrop-blur-sm hover:bg-black/80">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="white" stroke="none"/>
            </svg>
          </a>
        )}
        <a href={ad.adLink} target="_blank" rel="noopener noreferrer" title="Ver no Meta"
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 backdrop-blur-sm hover:bg-black/80">
          <ExternalLink size={12} className="text-white" />
        </a>
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1.5 p-3">
        <div className="flex items-start justify-between gap-1">
          <p className="line-clamp-1 text-[11px] font-semibold leading-snug"
            style={{ color: "var(--dm-text-primary)" }} title={ad.adName}>
            {ad.adName}
          </p>
          {createdLabel && (
            <span className="flex-shrink-0 flex items-center gap-0.5 text-[9px]" style={{ color: "var(--dm-text-tertiary)" }}>
              <CalendarDays size={8} />{createdLabel}
            </span>
          )}
        </div>
        <p className="truncate text-[10px]" style={{ color: "var(--dm-text-tertiary)" }} title={ad.campaignName}>
          {ad.campaignName}
        </p>

        {/* Metrics row */}
        {insight && (
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 pt-0.5 text-[10px]" style={{ color: "var(--dm-text-secondary)" }}>
            <span>CTR <strong>{formatPercent(insight.ctr)}</strong></span>
            {insight.spend > 0 && <span>Inv <strong>{formatCurrency(insight.spend)}</strong></span>}
            {insight.leads > 0 && <span>Leads <strong>{insight.leads}</strong></span>}
            {insight.conversions > 0 && <span>Vendas <strong>{insight.conversions}</strong></span>}
          </div>
        )}

        {/* CTA */}
        <button type="button" onClick={onPreview}
          className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-semibold text-white"
          style={{ backgroundColor: "var(--dm-brand-500)" }}>
          {ad.mediaType === "video" ? <Play size={10} /> : <ExternalLink size={10} />}
          Ver criativo
        </button>
      </div>
    </div>
  );
}

// ─── Creative Drawer helpers ──────────────────────────────────────────────────

const DRAWER_GRAD = "linear-gradient(135deg, #6366C8 0%, #313491 100%)";

interface InsightChip { label: string; color: "green" | "yellow" | "red" | "blue"; }

const CHIP_STYLE = {
  green:  { background: "rgba(5,205,153,0.10)",  color: "#05CD99", border: "1px solid rgba(5,205,153,0.22)" },
  yellow: { background: "rgba(244,166,13,0.10)", color: "#F4A60D", border: "1px solid rgba(244,166,13,0.22)" },
  red:    { background: "rgba(238,93,80,0.10)",  color: "#EE5D50", border: "1px solid rgba(238,93,80,0.22)" },
  blue:   { background: "rgba(99,102,200,0.10)", color: "#6366C8", border: "1px solid rgba(99,102,200,0.22)" },
} as const;

const QUALITY_TOP = { good: "#05CD99", avg: "#F4A60D", bad: "#EE5D50", neutral: "#6366C8" } as const;
type Quality = keyof typeof QUALITY_TOP;

function mq(metric: "ctr" | "cpl" | "roas" | "default", val: number): Quality {
  if (metric === "ctr")  return val >= 0.02 ? "good" : val >= 0.01 ? "avg" : "bad";
  if (metric === "cpl")  return val <= 20   ? "good" : val <= 60   ? "avg" : "bad";
  if (metric === "roas") return val >= 3    ? "good" : val >= 1.5  ? "avg" : val > 0 ? "bad" : "neutral";
  return "neutral";
}

function computeScore(i?: AdInsight): number | null {
  if (!i || i.spend === 0) return null;
  const ctr  = Math.min(i.ctr / 0.03, 1) * 40;
  const leads = i.leads > 0 ? Math.min(i.leads / 100, 1) * 30 : i.conversions > 0 ? Math.min(i.conversions / 20, 1) * 30 : 0;
  const roas  = i.roas > 0 ? Math.min(i.roas / 5, 1) * 30 : 0;
  return Math.round(ctr + leads + roas);
}

function getChips(i: AdInsight, peersAvgCtr: number): InsightChip[] {
  const chips: InsightChip[] = [];
  const cpl = i.leads > 0 ? i.spend / i.leads : null;
  if (i.ctr >= 0.02 || i.ctr > peersAvgCtr * 1.2) chips.push({ label: "✦ CTR acima da média", color: "green" });
  else if (i.ctr < 0.008)                           chips.push({ label: "↘ CTR baixo",         color: "red" });
  if (cpl !== null && cpl <= 20)  chips.push({ label: "✦ CPL ótimo",     color: "green" });
  else if (cpl !== null && cpl > 80) chips.push({ label: "⚠ CPL alto",   color: "red" });
  if (i.roas >= 3)                chips.push({ label: "✦ ROAS excelente", color: "green" });
  if (i.roas >= 2 && i.ctr >= 0.015 && i.conversions > 0) chips.push({ label: "↗ Escalável", color: "blue" });
  if (i.conversions > 0)         chips.push({ label: "↗ Gerando vendas",  color: "blue" });
  return chips.slice(0, 5);
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>{children}</span>
      <div className="h-px flex-1" style={{ backgroundColor: "var(--dm-border-subtle)" }} />
    </div>
  );
}

function PreviewModal({
  ad, insight, starred, accessToken, onClose, onToggleStar,
  allAds, allInsights, onNavigate,
}: {
  ad:           MetaCampaignCreative;
  insight?:     AdInsight;
  starred:      boolean;
  accessToken:  string;
  onClose:      () => void;
  onToggleStar: () => void;
  allAds:       MetaCampaignCreative[];
  allInsights:  Map<string, AdInsight>;
  onNavigate:   (ad: MetaCampaignCreative) => void;
}) {
  const [showIframe, setShowIframe] = useState(false);
  const currentIndex = allAds.findIndex((a) => a.adId === ad.adId);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      const idx = allAds.findIndex((a) => a.adId === ad.adId);
      if (e.key === "ArrowRight" && allAds[idx + 1]) { setShowIframe(false); onNavigate(allAds[idx + 1]); }
      if (e.key === "ArrowLeft"  && allAds[idx - 1]) { setShowIframe(false); onNavigate(allAds[idx - 1]); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, ad, allAds, onNavigate]);

  const createdLabel = ad.createdTime
    ? new Date(ad.createdTime).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    : null;

  const score      = computeScore(insight);
  const scoreColor = score === null ? "#6366C8" : score >= 70 ? "#05CD99" : score >= 40 ? "#F4A60D" : "#EE5D50";

  const campaignPeers = useMemo(() =>
    allAds
      .filter((a) => a.campaignId === ad.campaignId && allInsights.has(a.adId))
      .map((a) => ({ ad: a, ins: allInsights.get(a.adId)! }))
      .sort((a, b) => (b.ins.leads || b.ins.conversions || b.ins.clicks) - (a.ins.leads || a.ins.conversions || a.ins.clicks))
      .slice(0, 6),
  [allAds, allInsights, ad.campaignId]);

  const peersAvgCtr = campaignPeers.length > 0
    ? campaignPeers.reduce((s, p) => s + p.ins.ctr, 0) / campaignPeers.length
    : 0;

  const chips = insight ? getChips(insight, peersAvgCtr) : [];

  const cplVal = insight && insight.leads > 0 ? insight.spend / insight.leads : null;
  const cpaVal = insight && insight.conversions > 0 ? insight.spend / insight.conversions : null;

  const metricCards: { label: string; value: string | null; valueColor: string }[] = insight ? [
    { label: "Investimento", value: formatCurrency(insight.spend),                                                               valueColor: "var(--dm-text-primary)" },
    { label: "CTR",          value: formatPercent(insight.ctr),                                                                  valueColor: insight.ctr >= 0.02 ? "#05CD99" : insight.ctr >= 0.01 ? "#F4A60D" : "#EE5D50" },
    { label: cplVal != null ? "CPL" : cpaVal != null ? "CPA" : "CPC", value: formatCurrency(cplVal ?? cpaVal ?? insight.cpc),   valueColor: mq("cpl", cplVal ?? cpaVal ?? insight.cpc) === "good" ? "#05CD99" : "var(--dm-text-primary)" },
    { label: "Leads",        value: insight.leads > 0 ? insight.leads.toLocaleString("pt-BR") : null,                           valueColor: "#05CD99" },
    { label: "Vendas",       value: insight.conversions > 0 ? insight.conversions.toLocaleString("pt-BR") : null,               valueColor: "#05CD99" },
    { label: "Cliques",      value: insight.clicks.toLocaleString("pt-BR"),                                                      valueColor: "var(--dm-text-primary)" },
    { label: "ROAS",         value: insight.roas > 0 ? `${insight.roas.toFixed(2)}x` : null,                                    valueColor: mq("roas", insight.roas) === "good" ? "#05CD99" : mq("roas", insight.roas) === "avg" ? "#F4A60D" : "var(--dm-text-primary)" },
    { label: "CPM",          value: insight.cpm > 0 ? formatCurrency(insight.cpm) : null,                                       valueColor: "var(--dm-text-primary)" },
  ] : [];

  const compKey   = campaignPeers.some(p => p.ins.leads > 0) ? "leads" : campaignPeers.some(p => p.ins.conversions > 0) ? "conversions" : "clicks";
  const compMax   = Math.max(...campaignPeers.map(p => p.ins[compKey as keyof AdInsight] as number), 1);
  const compLabel = compKey === "leads" ? "Leads" : compKey === "conversions" ? "Vendas" : "Cliques";

  return (
    /* Full-screen backdrop with blur */
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.82)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      {/* Modal container */}
      <div
        className="relative flex w-full overflow-hidden rounded-2xl"
        style={{
          maxWidth: 960,
          maxHeight: "90vh",
          backgroundColor: "var(--dm-bg-surface)",
          border: "1px solid var(--dm-border-default)",
          boxShadow: "0 40px 100px rgba(0,0,0,0.55)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Brand stripe */}
        <div className="absolute left-0 right-0 top-0 z-10 h-[3px]" style={{ background: DRAWER_GRAD }} />

        {/* ── LEFT: Phone mockup ── */}
        <div
          className="flex flex-shrink-0 flex-col items-center justify-center gap-5 px-6 py-8"
          style={{
            width: 280,
            backgroundColor: "var(--dm-bg-elevated)",
            borderRight: "1px solid var(--dm-border-subtle)",
          }}
        >
          {/* iPhone frame */}
          <div
            className="relative overflow-hidden"
            style={{
              width: 210,
              borderRadius: 36,
              border: "7px solid #1a1a2e",
              boxShadow: "0 0 0 1.5px #32325e, 0 24px 48px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.06)",
              backgroundColor: "#000",
            }}
          >
            {/* Notch */}
            <div style={{
              position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
              width: 72, height: 20, backgroundColor: "#1a1a2e", borderRadius: "0 0 14px 14px", zIndex: 10,
            }} />
            {/* Side buttons (decorative) */}
            <div style={{ position: "absolute", right: -9, top: 80,  width: 3, height: 40, backgroundColor: "#0d0d1a", borderRadius: 2 }} />
            <div style={{ position: "absolute", left:  -9, top: 72,  width: 3, height: 28, backgroundColor: "#0d0d1a", borderRadius: 2 }} />
            <div style={{ position: "absolute", left:  -9, top: 108, width: 3, height: 28, backgroundColor: "#0d0d1a", borderRadius: 2 }} />

            {/* Screen — 9:16 */}
            <div style={{ aspectRatio: "9/16", position: "relative", overflow: "hidden" }}>
              {/* IG-style top bar — pointer-events:none para não bloquear cliques no iframe */}
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, zIndex: 5,
                padding: "22px 8px 8px",
                background: "linear-gradient(to bottom, rgba(0,0,0,0.65), transparent)",
                display: "flex", alignItems: "center", gap: 5,
                pointerEvents: "none",
              }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)", flexShrink: 0 }} />
                <span style={{ color: "white", fontSize: 8, fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ad.campaignName.slice(0, 20)}
                </span>
                <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 7, flexShrink: 0 }}>Patrocinado</span>
              </div>

              {/* Ad media */}
              {showIframe ? (
                <AdIframe ad={ad} accessToken={accessToken} />
              ) : ad.thumbnailUrl ? (
                <img src={ad.thumbnailUrl} alt={ad.adName} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2" style={{ backgroundColor: "#111", color: "rgba(255,255,255,0.18)" }}>
                  {ad.mediaType === "video" ? <Film size={28} /> : <ImageIcon size={28} />}
                  <span style={{ fontSize: 9 }}>Sem preview</span>
                </div>
              )}

              {/* Bottom gradient / CTA — pointer-events:none para não bloquear cliques no iframe */}
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 5,
                padding: "20px 8px 8px",
                background: "linear-gradient(to top, rgba(0,0,0,0.72), transparent)",
                display: "flex", alignItems: "center", gap: 6,
                pointerEvents: "none",
              }}>
                <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 8, flex: 1, fontWeight: 600 }}>Saiba mais</span>
                <div style={{ backgroundColor: "rgba(255,255,255,0.93)", borderRadius: 5, padding: "3px 7px", color: "#111", fontSize: 8, fontWeight: 700, flexShrink: 0 }}>
                  Ver mais
                </div>
              </div>

              {/* Score badge — pointer-events:none para não bloquear cliques no iframe */}
              {score !== null && (
                <div style={{
                  position: "absolute", top: 26, right: 7, zIndex: 6,
                  width: 26, height: 26, borderRadius: "50%",
                  backgroundColor: "rgba(0,0,0,0.72)",
                  border: `2px solid ${scoreColor}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  backdropFilter: "blur(4px)",
                  pointerEvents: "none",
                }}>
                  <span style={{ color: scoreColor, fontSize: 8, fontWeight: 800 }}>{score}</span>
                </div>
              )}
            </div>
          </div>

          {/* Nav arrows + counter */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setShowIframe(false); onNavigate(allAds[currentIndex - 1]); }}
              disabled={currentIndex <= 0}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[16px] font-bold transition hover:opacity-80 disabled:opacity-20"
              style={{ backgroundColor: "var(--dm-bg-surface)", border: "1px solid var(--dm-border-default)", color: "var(--dm-text-secondary)" }}
            >‹</button>
            <span className="text-[10px] font-semibold" style={{ color: "var(--dm-text-tertiary)", minWidth: 52, textAlign: "center" }}>
              {currentIndex + 1} / {allAds.length}
            </span>
            <button
              type="button"
              onClick={() => { setShowIframe(false); onNavigate(allAds[currentIndex + 1]); }}
              disabled={currentIndex >= allAds.length - 1}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[16px] font-bold transition hover:opacity-80 disabled:opacity-20"
              style={{ backgroundColor: "var(--dm-bg-surface)", border: "1px solid var(--dm-border-default)", color: "var(--dm-text-secondary)" }}
            >›</button>
          </div>

          {/* Interactive preview toggle */}
          {accessToken && (
            <button
              type="button"
              onClick={() => setShowIframe(!showIframe)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[11px] font-semibold transition hover:opacity-80"
              style={{
                backgroundColor: showIframe ? "rgba(99,102,200,0.15)" : "var(--dm-bg-surface)",
                color: showIframe ? "var(--dm-brand-500)" : "var(--dm-text-secondary)",
                border: `1px solid ${showIframe ? "rgba(99,102,200,0.35)" : "var(--dm-border-default)"}`,
              }}
            >
              <Play size={10} fill={showIframe ? "currentColor" : "none"} />
              {showIframe ? "Fechar preview" : "Preview interativo"}
            </button>
          )}
        </div>

        {/* ── RIGHT: Info panel ── */}
        <div className="flex flex-1 flex-col overflow-hidden">

          {/* Header */}
          <div
            className="flex flex-shrink-0 items-center gap-2.5 px-5 pb-4 pt-6"
            style={{ borderBottom: "1px solid var(--dm-border-subtle)" }}
          >
            <span className={`flex-shrink-0 rounded-[5px] px-2 py-0.5 text-[9px] font-bold tracking-wide ${TYPE_COLOR[ad.mediaType]}`}>
              {TYPE_LABEL[ad.mediaType].toUpperCase()}
            </span>
            <span
              className="min-w-0 flex-1 truncate text-[14px] font-bold"
              style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins), Poppins, sans-serif" }}
              title={ad.adName}
            >
              {ad.adName}
            </span>
            <button
              type="button"
              onClick={onToggleStar}
              className="flex flex-shrink-0 items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[11px] font-semibold transition hover:opacity-80"
              style={{
                color:           starred ? "#f59e0b" : "var(--dm-text-secondary)",
                backgroundColor: starred ? "rgba(245,158,11,0.10)" : "var(--dm-bg-elevated)",
                border:          `1px solid ${starred ? "rgba(245,158,11,0.30)" : "var(--dm-border-default)"}`,
              }}
            >
              <Star size={11} fill={starred ? "#f59e0b" : "none"} stroke={starred ? "#f59e0b" : "currentColor"} />
              {starred ? "Destacado" : "Destaque"}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[7px] transition hover:opacity-70"
              style={{ backgroundColor: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-default)", color: "var(--dm-text-tertiary)" }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col gap-4 p-5">

              {/* Campaign + date */}
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[11px]" style={{ color: "var(--dm-text-secondary)" }} title={ad.campaignName}>
                  📢 {ad.campaignName}
                </p>
                {createdLabel && (
                  <span className="flex flex-shrink-0 items-center gap-1 text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                    <CalendarDays size={9} />{createdLabel}
                  </span>
                )}
              </div>

              {/* Insight chips */}
              {chips.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {chips.map((c) => (
                    <span key={c.label} className="rounded-full px-3 py-1 text-[10px] font-semibold" style={CHIP_STYLE[c.color]}>{c.label}</span>
                  ))}
                </div>
              )}

              {/* Ad copy */}
              {ad.body && (
                <div className="rounded-[10px] p-3.5" style={{ backgroundColor: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-subtle)" }}>
                  <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>Legenda do anúncio</p>
                  <p className="text-[11px] leading-[1.6]" style={{ color: "var(--dm-text-secondary)", whiteSpace: "pre-line" }}>
                    {ad.body.length > 320 ? ad.body.slice(0, 320) + "…" : ad.body}
                  </p>
                </div>
              )}

              {/* Metrics grid */}
              {metricCards.length > 0 ? (
                <div>
                  <p className="mb-2.5 text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>Métricas do período</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {metricCards.map(({ label, value, valueColor }) => {
                      const hasData = value !== null;
                      return (
                        <div
                          key={label}
                          className="rounded-[8px] p-2.5"
                          style={{
                            backgroundColor: "var(--dm-bg-elevated)",
                            border: "1px solid var(--dm-border-subtle)",
                            opacity: hasData ? 1 : 0.38,
                          }}
                        >
                          <p className="text-[8px] font-semibold uppercase tracking-wide" style={{ color: "var(--dm-text-tertiary)" }}>{label}</p>
                          <p className="mt-1.5 text-[13px] font-bold leading-none"
                            style={{ color: hasData ? valueColor : "var(--dm-text-tertiary)", fontFamily: "var(--font-poppins), Poppins, sans-serif" }}>
                            {value ?? "—"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-[10px] p-4 text-center text-[11px]"
                  style={{ backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)", border: "1px solid var(--dm-border-subtle)" }}>
                  Aguardando métricas — clique em <strong>Atualizar</strong> ou selecione um período.
                </div>
              )}

              {/* Comparison bars */}
              {campaignPeers.length > 1 && (
                <div className="rounded-[10px] p-3.5" style={{ backgroundColor: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-subtle)" }}>
                  <p className="mb-3 text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>Ranking · {compLabel} na campanha</p>
                  <div className="space-y-2.5">
                    {campaignPeers.map(({ ad: peer, ins }) => {
                      const isMe = peer.adId === ad.adId;
                      const val  = ins[compKey as keyof AdInsight] as number;
                      const pct  = Math.round((val / compMax) * 100);
                      return (
                        <div key={peer.adId} className="flex items-center gap-2.5">
                          <span className="w-16 flex-shrink-0 truncate text-[10px] font-semibold"
                            style={{ color: isMe ? "var(--dm-brand-500)" : "var(--dm-text-secondary)" }}
                            title={peer.adName}>
                            {peer.adName}
                          </span>
                          <div className="flex-1 overflow-hidden rounded-full" style={{ height: 4, backgroundColor: "var(--dm-bg-surface)" }}>
                            <div className="h-full rounded-full"
                              style={{ width: `${pct}%`, background: isMe ? DRAWER_GRAD : "var(--dm-border-default)", transition: "width 0.6s ease" }} />
                          </div>
                          <span className="w-8 flex-shrink-0 text-right text-[10px] font-bold"
                            style={{ color: isMe ? "var(--dm-brand-500)" : "var(--dm-text-primary)", fontFamily: "var(--font-poppins), Poppins, sans-serif" }}>
                            {val}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Footer */}
          <div
            className="flex flex-shrink-0 items-center gap-2 px-5 py-3"
            style={{ borderTop: "1px solid var(--dm-border-subtle)", backgroundColor: "var(--dm-bg-elevated)" }}
          >
            {ad.previewUrl && ad.previewUrl !== ad.adLink && (
              <a href={ad.previewUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-[9px] border px-3 py-2 text-[11px] font-semibold transition hover:opacity-80"
                style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)", backgroundColor: "var(--dm-bg-surface)" }}>
                <Play size={10} /> Preview
              </a>
            )}
            {ad.instagramUrl && (
              <a href={ad.instagramUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-[9px] border px-3 py-2 text-[11px] font-semibold transition hover:opacity-80"
                style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)", backgroundColor: "var(--dm-bg-surface)" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
                </svg>
                Instagram
              </a>
            )}
            <a href={ad.adLink} target="_blank" rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-[9px] py-2.5 text-[12px] font-bold text-white transition hover:opacity-90"
              style={{ background: DRAWER_GRAD, boxShadow: "0 4px 14px rgba(49,52,145,0.22)" }}>
              <ExternalLink size={12} /> Ver no Gerenciador de Anúncios
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Ranking row ──────────────────────────────────────────────────────────────

function RankingRow({
  rank, ad, campaignName, highlight, highlightValue, onPreview,
}: {
  rank: number;
  ad?: MetaCampaignCreative;
  campaignName: string;
  highlight: string;
  highlightValue: string;
  onPreview?: () => void;
}) {
  return (
    <li className="flex items-center gap-2.5 rounded-lg border p-2.5 transition-opacity hover:opacity-90"
      style={{ borderColor: "var(--dm-border-subtle)", backgroundColor: "var(--dm-bg-elevated)" }}>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
        style={rank === 1
          ? { backgroundColor: "var(--dm-brand-50)", color: "var(--dm-brand-500)" }
          : { backgroundColor: "var(--dm-bg-surface)", color: "var(--dm-text-tertiary)" }}>
        {rank}
      </span>
      {ad?.thumbnailUrl ? (
        <img src={ad.thumbnailUrl} alt="" className="h-9 w-9 shrink-0 rounded object-cover cursor-pointer"
          onClick={onPreview} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded"
          style={{ backgroundColor: "var(--dm-border-default)" }}>
          <ImageIcon size={14} style={{ color: "var(--dm-text-tertiary)" }} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold" style={{ color: "var(--dm-text-primary)" }}>{campaignName}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="rounded-md px-2 py-0.5" style={{ backgroundColor: "var(--dm-brand-50)" }}>
          <p className="text-[9px]" style={{ color: "var(--dm-brand-500)" }}>{highlight}</p>
          <p className="text-xs font-bold" style={{ color: "var(--dm-brand-500)" }}>{highlightValue}</p>
        </div>
        {ad?.adLink && (
          <a href={ad.adLink} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-500">
            <ExternalLink size={11} />
          </a>
        )}
      </div>
    </li>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function BestCreatives({
  campaigns, adAccountId, dateFrom, dateTo,
  selectedCampaignIds, selectedGroupName,
}: BestCreativesProps) {
  const [subTab,        setSubTab]        = useState<SubTab>("gallery");
  const [mediaFilter,   setMediaFilter]   = useState<MediaFilter>("all");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [page,          setPage]          = useState(1);
  const [previewAd,       setPreviewAd]       = useState<MetaCampaignCreative | null>(null);
  const [metaAds,         setMetaAds]         = useState<MetaCampaignCreative[]>([]);
  const [adInsights,      setAdInsights]      = useState<Map<string, AdInsight>>(new Map());
  const [fetching,        setFetching]        = useState(false);
  const [fetchError,      setFetchError]      = useState<string | null>(null);
  const [cacheAge,        setCacheAge]        = useState<number | null>(null);

  // Lê o token em cada render para detectar quando o usuário o salva após o mount.
  // loadMetaCredentials() é uma leitura síncrona de localStorage — custo negligível.
  const accessToken = loadMetaCredentials().accessToken;
  const { store, saveCreative } = useCreativeStore();
  const storeRef = useRef(store);
  storeRef.current = store;

  const getIds = useCallback(() =>
    Array.isArray(adAccountId) ? adAccountId.filter(Boolean) : adAccountId ? [adAccountId] : []
  , [adAccountId]);

  // Load from cache on mount (no auto API call)
  const [hasLoaded, setHasLoaded] = useState(false);

  const fetchInsights = useCallback(async (ids: string[]) => {
    if (!accessToken) return;
    const today   = new Date().toISOString().slice(0, 10);
    const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const from    = dateFrom || yearAgo;
    const to      = dateTo   || today;
    const batches = await Promise.all(
      ids.map((id) => fetchAdInsights(id, accessToken, from, to).catch(() => [] as AdInsight[]))
    );
    const map = new Map<string, AdInsight>();
    for (const b of batches) for (const r of b) map.set(r.ad_id, r);
    setAdInsights(map);
  }, [accessToken, dateFrom, dateTo]);

  const doFetch = useCallback((force = false) => {
    const ids = getIds();
    if (!ids.length || !accessToken) return;

    const cacheKey = getCacheKey(ids);

    if (!force) {
      const cached = readCache(cacheKey);
      if (cached) {
        const raw = localStorage.getItem(cacheKey);
        const ts  = raw ? (JSON.parse(raw) as { ts: number }).ts : Date.now();
        setMetaAds(cached);
        setCacheAge(Date.now() - ts);
        setHasLoaded(true);
        // Also fetch fresh insights for the selected date range
        fetchInsights(ids).catch(() => {});
        return;
      }
    }

    setFetching(true);
    setFetchError(null);
    setCacheAge(null);

    // Carregamento progressivo: mostra primeira página (~200 ads) em ~3 segundos
    // e continua paginando em background. O usuário vê conteúdo imediatamente.
    (async () => {
      const seen   = new Set<string>();
      const merged: MetaCampaignCreative[] = [];
      let firstPageDone = false;

      for (const id of ids) {
        let cursor: string | undefined;
        do {
          const { data, nextCursor } = await fetchMetaCreativesPage(id, accessToken, cursor);
          for (const ad of data) {
            if (!seen.has(ad.adId)) { seen.add(ad.adId); merged.push(ad); }
          }

          // Após a primeira página de qualquer conta: exibe resultados imediatamente
          if (!firstPageDone) {
            firstPageDone = true;
            setMetaAds([...merged]);
            setHasLoaded(true);
            // Inicia busca de insights em paralelo sem bloquear o loop de páginas
            fetchInsights(ids).catch(() => {});
          }

          cursor = nextCursor;
        } while (cursor);
      }

      // Estado final com todos os anúncios + cache
      writeCache(cacheKey, merged);
      setMetaAds([...merged]);
      setCacheAge(0);
      setHasLoaded(true);
    })()
      .catch((err: unknown) => setFetchError(err instanceof Error ? err.message : "Erro ao buscar criativos"))
      .finally(() => setFetching(false));
  }, [getIds, accessToken, fetchInsights]);

  // On mount: load from cache OR auto-fetch if no cache exists
  useEffect(() => {
    let cancelled = false;
    const ids = getIds();
    if (!ids.length || !accessToken) return;
    const cacheKey = getCacheKey(ids);
    const cached   = readCache(cacheKey);
    if (cached) {
      const raw = localStorage.getItem(cacheKey);
      const ts  = raw ? (JSON.parse(raw) as { ts: number }).ts : Date.now();
      setMetaAds(cached);
      setCacheAge(Date.now() - ts);
      setHasLoaded(true);
      fetchInsights(ids).catch(() => {});
    } else {
      // No cache — auto-fetch from Meta API on first open
      doFetch(false);
    }
    return () => { cancelled = true; void cancelled; }; // evita setState em unmounted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(adAccountId)]);

  // Re-fetch insights whenever date range changes (ads already loaded)
  useEffect(() => {
    if (!hasLoaded) return;
    const ids = getIds();
    if (!ids.length) return;
    fetchInsights(ids).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  // Reset page when ads or external filter changes
  useEffect(() => { setPage(1); }, [metaAds, selectedCampaignIds]);

  const toggleStar = useCallback((ad: MetaCampaignCreative) => {
    const existing   = storeRef.current[ad.adId];
    const wasStarred = existing?.starred ?? false;
    saveCreative(ad.adId, {
      mediaUrl:  existing?.mediaUrl  ?? ad.thumbnailUrl,
      adLink:    existing?.adLink    ?? ad.adLink,
      notes:     existing?.notes     ?? "",
      starred:   !wasStarred,
      starredAt: !wasStarred ? new Date().toISOString() : undefined,
    });
  }, [saveCreative]);

  // Filtered + paginated ads
  const filteredAds = useMemo(() => {
    let base = subTab === "starred"
      ? metaAds.filter((a) => store[a.adId]?.starred)
      : metaAds;

    // Campaign filter: driven by right-panel selection
    if (selectedCampaignIds && selectedCampaignIds.length > 0) {
      const idSet = new Set(selectedCampaignIds);
      base = base.filter((a) => idSet.has(a.campaignId));
    }

    // Media type filter
    if (mediaFilter !== "all") base = base.filter((a) => a.mediaType === mediaFilter);

    // Activity filter — insight-based (spend > 0 means ad ran in the selected period)
    if (activityFilter === "with_data") {
      base = base.filter((a) => {
        const ins = adInsights.get(a.adId);
        return ins != null && ins.spend > 0;
      });
    } else if (activityFilter === "no_data") {
      base = base.filter((a) => {
        const ins = adInsights.get(a.adId);
        return ins == null || ins.spend === 0;
      });
    }

    return base;
  }, [metaAds, subTab, selectedCampaignIds, mediaFilter, activityFilter, adInsights, store]);

  const pageAds    = useMemo(() => filteredAds.slice(0, page * PAGE_SIZE), [filteredAds, page]);
  const hasMore    = pageAds.length < filteredAds.length;
  const starCount  = metaAds.filter((a) => store[a.adId]?.starred).length;

  // Rankings (by campaign metrics)
  const byCtr = useMemo(() =>
    [...campaigns].filter((c) => c.impressions > 500).sort((a, b) => b.ctr - a.ctr).slice(0, 8),
  [campaigns]);
  const byRoas = useMemo(() =>
    [...campaigns].filter((c) => c.investment > 0 && c.roas > 0).sort((a, b) => b.roas - a.roas).slice(0, 8),
  [campaigns]);
  const byConversion = useMemo(() =>
    [...campaigns].filter((c) => c.clicks > 50 && c.conversions > 0).sort((a, b) => b.conversionRate - a.conversionRate).slice(0, 8),
  [campaigns]);

  const firstAdByCampaign = useMemo(() => {
    const m = new Map<string, MetaCampaignCreative>();
    metaAds.forEach((a) => { if (!m.has(a.campaignName)) m.set(a.campaignName, a); });
    return m;
  }, [metaAds]);

  const hasAccountId = Array.isArray(adAccountId) ? adAccountId.length > 0 : Boolean(adAccountId);
  if (!hasAccountId && !campaigns.length) return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <ImageIcon size={32} style={{ color: "var(--dm-text-tertiary)" }} />
      <p className="text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>Nenhum criativo disponível</p>
      <p className="text-xs" style={{ color: "var(--dm-text-secondary)" }}>Conecte o Meta Ads para visualizar criativos.</p>
    </div>
  );

  return (
    <div className="space-y-4">

      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">

        {/* Sub-tabs */}
        {(["gallery", "rankings", "starred"] as const).map((id) => {
          const labels = { gallery: "Galeria", rankings: "Rankings", starred: "⭐ Destaques" };
          const counts = { gallery: metaAds.length, rankings: null, starred: starCount } as Record<string, number | null>;
          return (
            <button key={id} type="button" onClick={() => setSubTab(id)}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-all"
              style={subTab === id
                ? { backgroundColor: "var(--dm-brand-500)", color: "#fff" }
                : { backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)", border: "1px solid var(--dm-border-default)" }}>
              {labels[id]}
              {counts[id] !== null && (
                <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ backgroundColor: subTab === id ? "rgba(255,255,255,0.2)" : "var(--dm-bg-surface)" }}>
                  {counts[id]}
                </span>
              )}
            </button>
          );
        })}

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          {cacheAge !== null && !fetching && (
            <span className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
              {cacheAge < 60000 ? "Cache: agora" : `Cache: ${Math.floor(cacheAge / 60000)}min atrás`}
            </span>
          )}
          {fetching ? (
            <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
              <Loader2 size={12} className="animate-spin" /> Buscando…
            </span>
          ) : (
            <button type="button" onClick={() => doFetch(true)}
              className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium hover:opacity-80"
              style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)", backgroundColor: "var(--dm-bg-elevated)" }}>
              <RefreshCw size={11} /> Atualizar
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {fetchError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-400">
          {fetchError.toLowerCase().includes("too many") ? (
            <>Rate limit Meta atingido. Aguarde alguns minutos e <button type="button" onClick={() => doFetch(true)} className="underline font-semibold">Atualizar</button>.</>
          ) : (
            <><strong>Erro:</strong> {fetchError}</>
          )}
        </div>
      )}

      {/* Not loaded yet — show load button */}
      {!hasLoaded && !fetching && !fetchError && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border py-20"
          style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
          <ImageIcon size={32} style={{ color: "var(--dm-text-tertiary)" }} />
          <div className="text-center">
            <p className="text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>Criativos não carregados</p>
            <p className="mt-1 text-xs" style={{ color: "var(--dm-text-secondary)" }}>
              Clique para buscar anúncios ativos e pausados.
            </p>
          </div>
          <button
            type="button"
            onClick={() => doFetch(false)}
            className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: "var(--dm-brand-500)" }}
          >
            <RefreshCw size={14} /> Carregar criativos
          </button>
        </div>
      )}

      {/* ── Gallery / Starred ──────────────────────────────────────────────── */}
      {(subTab === "gallery" || subTab === "starred") && (
        <>
          {/* Filters row */}
          {subTab === "gallery" && metaAds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">

              {/* Active filter indicator (driven by right panel) */}
              {(selectedGroupName || (selectedCampaignIds && selectedCampaignIds.length > 0)) && (
                <div className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium"
                  style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)" }}>
                  <Filter size={10} style={{ color: "var(--dm-brand-500)" }} />
                  {selectedGroupName && <span style={{ color: "var(--dm-brand-500)", fontWeight: 600 }}>{selectedGroupName}</span>}
                  {selectedCampaignIds && selectedCampaignIds.length > 0 && (
                    <span>· {selectedCampaignIds.length} campanha{selectedCampaignIds.length > 1 ? "s" : ""}</span>
                  )}
                </div>
              )}

              {/* Activity filter */}
              <div className="flex items-center gap-1 rounded-lg border px-1.5 py-1"
                style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
                {(["all", "with_data", "no_data"] as const).map((k) => {
                  const lbl: Record<typeof k, string> = { all: "Todos", with_data: "Com gasto", no_data: "Sem gasto" };
                  return (
                    <button key={k} type="button"
                      onClick={() => { setActivityFilter(k); setPage(1); }}
                      className="rounded px-2 py-0.5 text-[10px] font-semibold transition-all"
                      style={activityFilter === k
                        ? { backgroundColor: "var(--dm-brand-500)", color: "#fff" }
                        : { color: "var(--dm-text-secondary)" }}>
                      {lbl[k]}
                    </button>
                  );
                })}
              </div>

              {/* Media type pills */}
              {(["all", "video", "image", "carousel"] as const).map((key) => {
                const labels = { all: "Todos", video: "🎬 Vídeo", image: "🖼 Imagem", carousel: "📎 Carrossel" };
                const count  = key === "all" ? filteredAds.length : filteredAds.filter((a) => a.mediaType === key).length;
                if (key !== "all" && count === 0) return null;
                return (
                  <button key={key} type="button"
                    onClick={() => { setMediaFilter(key); setPage(1); }}
                    className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-all"
                    style={mediaFilter === key
                      ? { backgroundColor: "var(--dm-brand-500)", color: "#fff", borderColor: "var(--dm-brand-500)" }
                      : { backgroundColor: "var(--dm-bg-surface)", color: "var(--dm-text-secondary)", borderColor: "var(--dm-border-default)" }}>
                    {labels[key]}
                    <span style={{ opacity: 0.7 }} className="text-[10px]">{count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Grid */}
          {pageAds.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border py-14"
              style={{ borderColor: "var(--dm-border-default)" }}>
              <ImageIcon size={28} style={{ color: "var(--dm-border-strong)" }} />
              <p className="text-sm font-semibold" style={{ color: "var(--dm-text-secondary)" }}>
                {subTab === "starred" ? "Nenhum criativo marcado como destaque" : "Nenhum criativo encontrado"}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {pageAds.map((ad) => (
                  <CreativeCard
                    key={ad.adId}
                    ad={ad}
                    insight={adInsights.get(ad.adId)}
                    starred={store[ad.adId]?.starred ?? false}
                    onPreview={() => setPreviewAd(ad)}
                    onToggleStar={() => toggleStar(ad)}
                  />
                ))}
              </div>

              {/* Load more */}
              {hasMore && (
                <div className="flex justify-center pt-2">
                  <button type="button" onClick={() => setPage((p) => p + 1)}
                    className="rounded-xl border px-6 py-2 text-sm font-medium transition-colors hover:opacity-80"
                    style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)", backgroundColor: "var(--dm-bg-elevated)" }}>
                    Carregar mais ({filteredAds.length - pageAds.length} restantes)
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Rankings ───────────────────────────────────────────────────────── */}
      {subTab === "rankings" && (
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { title: "Maior CTR",       subtitle: "Criativos que mais geram cliques", icon: MousePointerClick, color: "text-violet-500", data: byCtr,        highlight: "CTR",      fmt: (c: AggregatedCampaign) => formatPercent(c.ctr) },
            { title: "Melhor ROAS",     subtitle: "Maior retorno sobre investimento",  icon: Trophy,            color: "text-amber-500",  data: byRoas,       highlight: "ROAS",     fmt: (c: AggregatedCampaign) => `${c.roas.toFixed(2)}x` },
            { title: "Melhor Conversão",subtitle: "Maior taxa de conversão",           icon: ShoppingCart,      color: "text-emerald-500",data: byConversion, highlight: "Tx. Conv.",fmt: (c: AggregatedCampaign) => formatPercent(c.conversionRate) },
          ].map(({ title, subtitle, icon: Icon, color, data, highlight, fmt }) => (
            <article key={title} className="rounded-xl border p-4 shadow-sm"
              style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
              <div className="mb-3 flex items-center gap-2">
                <Icon size={15} className={color} />
                <div>
                  <h3 className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>{title}</h3>
                  <p className="text-[10px]" style={{ color: "var(--dm-text-secondary)" }}>{subtitle}</p>
                </div>
              </div>
              {data.length === 0
                ? <p className="text-xs" style={{ color: "var(--dm-text-tertiary)" }}>Dados insuficientes.</p>
                : (
                  <ol className="space-y-2">
                    {data.map((c, i) => {
                      const ad = firstAdByCampaign.get(c.campaignName);
                      return (
                        <RankingRow key={c.campaignName} rank={i + 1} ad={ad}
                          campaignName={c.campaignName}
                          highlight={highlight} highlightValue={fmt(c)}
                          onPreview={ad ? () => setPreviewAd(ad) : undefined} />
                      );
                    })}
                  </ol>
                )}
            </article>
          ))}
        </div>
      )}

      {/* ── Modal ──────────────────────────────────────────────────────────── */}
      {previewAd && (
        <PreviewModal
          ad={previewAd}
          insight={adInsights.get(previewAd.adId)}
          starred={store[previewAd.adId]?.starred ?? false}
          accessToken={accessToken}
          onClose={() => setPreviewAd(null)}
          onToggleStar={() => toggleStar(previewAd)}
          allAds={filteredAds}
          allInsights={adInsights}
          onNavigate={(next) => setPreviewAd(next)}
        />
      )}
    </div>
  );
}
