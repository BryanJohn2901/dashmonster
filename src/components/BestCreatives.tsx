"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  Download, ExternalLink, Film, ImageIcon, Layers, Loader2,
  MousePointerClick, Play, ShoppingCart, Star, Trophy, X,
} from "lucide-react";
import { AggregatedCampaign } from "@/types/campaign";
import { useCreativeStore } from "@/hooks/useCreativeStore";
import type { MetaCampaignCreative } from "@/utils/metaApi";
import { fetchMetaCreatives, loadMetaCredentials } from "@/utils/metaApi";
import { formatCurrency, formatPercent } from "@/utils/metrics";

interface BestCreativesProps {
  campaigns: AggregatedCampaign[];
  adAccountId?: string;
}

type CreativeSubTab  = "gallery" | "rankings" | "starred";
type MediaTypeFilter = "all" | "image" | "video" | "carousel";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function downloadBlob(url: string, filename: string) {
  fetch(url)
    .then((r) => r.blob())
    .then((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch(() => window.open(url, "_blank"));
}

const TYPE_LABEL: Record<MetaCampaignCreative["mediaType"], string> = {
  image:    "Imagem",
  video:    "Vídeo",
  carousel: "Carrossel",
  unknown:  "Anúncio",
};

const TYPE_COLOR: Record<MetaCampaignCreative["mediaType"], string> = {
  image:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  video:    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  carousel: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  unknown:  "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

const TYPE_ICON: Record<MetaCampaignCreative["mediaType"], React.ElementType> = {
  image:    ImageIcon,
  video:    Film,
  carousel: Layers,
  unknown:  ImageIcon,
};

// ─── Thumbnail ────────────────────────────────────────────────────────────────

function Thumbnail({
  ad,
  className = "",
  onClick,
}: {
  ad: MetaCampaignCreative;
  className?: string;
  onClick?: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const TypeIcon = TYPE_ICON[ad.mediaType];
  const hasThumb = Boolean(ad.thumbnailUrl) && !imgFailed;

  return (
    <div
      className={`relative overflow-hidden bg-slate-100 dark:bg-slate-800 ${onClick ? "cursor-pointer" : ""} ${className}`}
      onClick={onClick}
    >
      {hasThumb ? (
        <img
          src={ad.thumbnailUrl}
          alt={ad.adName}
          className="h-full w-full object-cover transition-transform duration-200 hover:scale-105"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
          <TypeIcon size={28} className="text-slate-300 dark:text-slate-600" />
          <span className="text-[10px] text-slate-400 dark:text-slate-500">
            {ad.mediaType === "video" ? "Vídeo" : "Sem preview"}
          </span>
        </div>
      )}

      {/* Video play overlay */}
      {ad.mediaType === "video" && hasThumb && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 shadow-lg backdrop-blur-sm transition-transform hover:scale-110">
            <Play size={16} fill="white" className="text-white ml-0.5" />
          </div>
        </div>
      )}

      {/* Type badge */}
      <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold shadow ${TYPE_COLOR[ad.mediaType]}`}>
        {TYPE_LABEL[ad.mediaType]}
      </span>
    </div>
  );
}

// ─── Creative Card ────────────────────────────────────────────────────────────

function CreativeCard({
  ad,
  metrics,
  starred,
  onPreview,
  onToggleStar,
}: {
  ad: MetaCampaignCreative;
  metrics?: AggregatedCampaign;
  starred: boolean;
  onPreview: () => void;
  onToggleStar: () => void;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border shadow-sm transition-shadow hover:shadow-md"
      style={{ borderColor: starred ? "#f59e0b" : "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}
    >
      {/* Thumbnail — clickable */}
      <Thumbnail ad={ad} className="aspect-video w-full" onClick={onPreview} />

      {/* Top-right actions overlay */}
      <div className="relative -mt-8 mr-2 flex justify-end gap-1 pr-0">
        <button type="button" onClick={onToggleStar} title={starred ? "Remover destaque" : "Marcar destaque"}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 shadow backdrop-blur-sm hover:bg-white dark:bg-slate-800/90">
          <Star size={13} fill={starred ? "#f59e0b" : "none"} stroke={starred ? "#f59e0b" : "currentColor"} className="text-slate-400" />
        </button>
        {ad.thumbnailUrl && (
          <button type="button" onClick={() => downloadBlob(ad.thumbnailUrl, `${ad.adId}.jpg`)} title="Baixar thumbnail"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 shadow backdrop-blur-sm hover:bg-white dark:bg-slate-800/90">
            <Download size={13} className="text-slate-500 dark:text-slate-400" />
          </button>
        )}
        <a href={ad.adLink} target="_blank" rel="noopener noreferrer" title="Ver anúncio no Meta"
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 shadow backdrop-blur-sm hover:bg-white dark:bg-slate-800/90">
          <ExternalLink size={13} className="text-blue-500" />
        </a>
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-1.5 px-3 pb-3 pt-1">
        <p className="line-clamp-2 text-xs font-semibold leading-snug" style={{ color: "var(--dm-text-primary)" }}
          title={ad.adName}>
          {ad.adName}
        </p>
        <p className="truncate text-[10px]" style={{ color: "var(--dm-text-tertiary)" }} title={ad.campaignName}>
          {ad.campaignName}
        </p>
        {/* Metrics */}
        {metrics && (
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px]" style={{ color: "var(--dm-text-secondary)" }}>
            <span>CTR {formatPercent(metrics.ctr)}</span>
            {metrics.roas > 0 && <span>ROAS {metrics.roas.toFixed(2)}x</span>}
          </div>
        )}
        {/* View button */}
        <button type="button" onClick={onPreview}
          className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: "var(--dm-brand-500)" }}>
          {ad.mediaType === "video" ? <Play size={11} /> : <ExternalLink size={11} />}
          {ad.mediaType === "video" ? "Assistir / Ver anúncio" : "Visualizar"}
        </button>
      </div>
    </div>
  );
}

// ─── Preview Modal ────────────────────────────────────────────────────────────

function PreviewModal({
  ad,
  metrics,
  starred,
  onClose,
  onToggleStar,
}: {
  ad: MetaCampaignCreative;
  metrics?: AggregatedCampaign;
  starred: boolean;
  onClose: () => void;
  onToggleStar: () => void;
}) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>

      <div className="relative flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl shadow-2xl md:flex-row"
        style={{ backgroundColor: "var(--dm-bg-card)", maxHeight: "90vh" }}>

        {/* Close button */}
        <button type="button" onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60">
          <X size={16} />
        </button>

        {/* Left — creative preview */}
        <div className="flex w-full items-center justify-center bg-black md:w-[55%]" style={{ minHeight: 280 }}>
          <Thumbnail ad={ad} className="h-full w-full" />
        </div>

        {/* Right — details */}
        <div className="flex w-full flex-col gap-4 overflow-y-auto p-5 md:w-[45%]">

          {/* Type + Star */}
          <div className="flex items-center justify-between">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${TYPE_COLOR[ad.mediaType]}`}>
              {TYPE_LABEL[ad.mediaType]}
            </span>
            <button type="button" onClick={onToggleStar}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors"
              style={{ color: starred ? "#f59e0b" : "var(--dm-text-secondary)", backgroundColor: starred ? "rgba(245,158,11,0.1)" : "var(--dm-bg-elevated)" }}>
              <Star size={13} fill={starred ? "#f59e0b" : "none"} stroke={starred ? "#f59e0b" : "currentColor"} />
              {starred ? "Destacado" : "Marcar"}
            </button>
          </div>

          {/* Ad info */}
          <div>
            <p className="text-sm font-bold leading-snug" style={{ color: "var(--dm-text-primary)" }}>{ad.adName}</p>
            <p className="mt-1 text-xs" style={{ color: "var(--dm-text-secondary)" }}>{ad.campaignName}</p>
            {ad.adsetName && (
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>{ad.adsetName}</p>
            )}
          </div>

          {/* Metrics */}
          {metrics && (
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "CTR",        value: formatPercent(metrics.ctr) },
                { label: "ROAS",       value: `${metrics.roas.toFixed(2)}x` },
                { label: "Cliques",    value: metrics.clicks.toLocaleString("pt-BR") },
                { label: "Impressões", value: metrics.impressions.toLocaleString("pt-BR") },
                ...(metrics.conversions > 0 ? [{ label: "CPA", value: formatCurrency(metrics.cpa) }] : []),
                ...(metrics.investment > 0   ? [{ label: "Investimento", value: formatCurrency(metrics.investment) }] : []),
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg p-2" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>{label}</p>
                  <p className="mt-0.5 text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>{value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-auto flex flex-col gap-2">
            <a href={ad.adLink} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--dm-brand-500)" }}>
              <ExternalLink size={15} />
              Ver anúncio no Meta
            </a>
            {ad.previewUrl && ad.previewUrl !== ad.adLink && (
              <a href={ad.previewUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition-colors hover:opacity-80"
                style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
                <Play size={14} />
                Preview do anúncio
              </a>
            )}
            {ad.thumbnailUrl && (
              <button type="button" onClick={() => downloadBlob(ad.thumbnailUrl, `${ad.adId}-thumb.jpg`)}
                className="flex items-center justify-center gap-2 rounded-xl border py-2 text-xs font-medium transition-colors hover:opacity-80"
                style={{ borderColor: "var(--dm-border-subtle)", color: "var(--dm-text-tertiary)" }}>
                <Download size={12} />
                Baixar thumbnail
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Ranking row ──────────────────────────────────────────────────────────────

function RankingRow({
  rank,
  ad,
  metrics,
  highlight,
  highlightValue,
  onPreview,
}: {
  rank: number;
  ad?: MetaCampaignCreative;
  metrics: AggregatedCampaign;
  highlight: string;
  highlightValue: string;
  onPreview?: () => void;
}) {
  return (
    <li className="flex items-center gap-2.5 rounded-lg border p-2.5 transition-colors hover:opacity-90"
      style={{ borderColor: "var(--dm-border-subtle)", backgroundColor: "var(--dm-bg-elevated)" }}>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
        style={rank === 1
          ? { backgroundColor: "var(--dm-brand-50)", color: "var(--dm-brand-500)" }
          : { backgroundColor: "var(--dm-bg-surface)", color: "var(--dm-text-tertiary)" }}>
        {rank}
      </span>

      {/* Thumbnail thumbnail */}
      {ad?.thumbnailUrl ? (
        <img src={ad.thumbnailUrl} alt="" className="h-9 w-9 shrink-0 rounded object-cover cursor-pointer"
          onClick={onPreview} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded" style={{ backgroundColor: "var(--dm-border-default)" }}>
          <ImageIcon size={14} style={{ color: "var(--dm-text-tertiary)" }} />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold" style={{ color: "var(--dm-text-primary)" }}>{metrics.campaignName}</p>
        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0 text-[10px]" style={{ color: "var(--dm-text-secondary)" }}>
          <span>CTR {formatPercent(metrics.ctr)}</span>
          <span>ROAS {metrics.roas.toFixed(2)}x</span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="rounded-md px-2 py-0.5 text-right" style={{ backgroundColor: "var(--dm-brand-50)" }}>
          <p className="text-[9px]" style={{ color: "var(--dm-brand-500)" }}>{highlight}</p>
          <p className="text-xs font-bold" style={{ color: "var(--dm-brand-700, var(--dm-brand-500))" }}>{highlightValue}</p>
        </div>
        {ad?.adLink && (
          <a href={ad.adLink} target="_blank" rel="noopener noreferrer" title="Ver anúncio"
            className="text-blue-400 hover:text-blue-500">
            <ExternalLink size={11} />
          </a>
        )}
      </div>
    </li>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function BestCreatives({ campaigns, adAccountId }: BestCreativesProps) {
  const [subTab, setSubTab]         = useState<CreativeSubTab>("gallery");
  const [typeFilter, setTypeFilter] = useState<MediaTypeFilter>("all");
  const [previewAd, setPreviewAd]   = useState<MetaCampaignCreative | null>(null);
  const [metaAds, setMetaAds]       = useState<MetaCampaignCreative[]>([]);
  const [fetching, setFetching]     = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const { store, saveCreative }     = useCreativeStore();
  const storeRef = useRef(store);
  storeRef.current = store;

  // Fetch all ads from Meta
  useEffect(() => {
    if (!adAccountId) return;
    const { accessToken } = loadMetaCredentials();
    if (!accessToken) return;
    setFetching(true);
    setFetchError(null);
    fetchMetaCreatives(adAccountId, accessToken)
      .then((ads) => setMetaAds(ads))
      .catch((err: unknown) => setFetchError(err instanceof Error ? err.message : "Erro ao buscar criativos"))
      .finally(() => setFetching(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adAccountId]);

  const toggleStar = useCallback((ad: MetaCampaignCreative) => {
    const existing = storeRef.current[ad.adId];
    const wasStarred = existing?.starred ?? false;
    saveCreative(ad.adId, {
      mediaUrl:  existing?.mediaUrl  ?? ad.thumbnailUrl,
      adLink:    existing?.adLink    ?? ad.adLink,
      notes:     existing?.notes     ?? "",
      starred:   !wasStarred,
      starredAt: !wasStarred ? new Date().toISOString() : undefined,
    });
  }, [saveCreative]);

  // Metrics lookup by campaign name
  const metricsMap = useMemo(
    () => new Map(campaigns.map((c) => [c.campaignName, c])),
    [campaigns],
  );

  // Filtered ads for gallery
  const galleryAds = useMemo(() => {
    const base = subTab === "starred"
      ? metaAds.filter((ad) => store[ad.adId]?.starred)
      : metaAds;
    return typeFilter === "all" ? base : base.filter((ad) => ad.mediaType === typeFilter);
  }, [metaAds, subTab, typeFilter, store]);

  // Rankings (by campaign metrics)
  const byCtr = useMemo(
    () => [...campaigns].filter((c) => c.impressions > 500).sort((a, b) => b.ctr - a.ctr).slice(0, 8),
    [campaigns],
  );
  const byConversion = useMemo(
    () => [...campaigns].filter((c) => c.clicks > 50 && c.conversions > 0).sort((a, b) => b.conversionRate - a.conversionRate).slice(0, 8),
    [campaigns],
  );
  const byRoas = useMemo(
    () => [...campaigns].filter((c) => c.investment > 0 && c.roas > 0).sort((a, b) => b.roas - a.roas).slice(0, 8),
    [campaigns],
  );

  // First ad per campaign (for ranking thumbnails)
  const firstAdByCampaign = useMemo(() => {
    const m = new Map<string, MetaCampaignCreative>();
    metaAds.forEach((ad) => { if (!m.has(ad.campaignName)) m.set(ad.campaignName, ad); });
    return m;
  }, [metaAds]);

  const starredCount = metaAds.filter((ad) => store[ad.adId]?.starred).length;

  const videoCount    = metaAds.filter((a) => a.mediaType === "video").length;
  const imageCount    = metaAds.filter((a) => a.mediaType === "image").length;
  const carouselCount = metaAds.filter((a) => a.mediaType === "carousel").length;

  if (!adAccountId && campaigns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl" style={{ backgroundColor: "var(--dm-brand-50)" }}>
          <ImageIcon size={26} style={{ color: "var(--dm-brand-500)" }} />
        </div>
        <p className="text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>Nenhum criativo disponível</p>
        <p className="text-xs" style={{ color: "var(--dm-text-secondary)" }}>Importe dados via Meta Ads para visualizar seus criativos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Sub-tabs ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { id: "gallery" as const,  label: "Galeria",         count: metaAds.length },
            { id: "rankings" as const, label: "Rankings",        count: null },
            { id: "starred" as const,  label: "⭐ Destaques",    count: starredCount },
          ] as const
        ).map(({ id, label, count }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubTab(id)}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-all"
            style={
              subTab === id
                ? { backgroundColor: "var(--dm-brand-500)", color: "#fff" }
                : { backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)", border: "1px solid var(--dm-border-default)" }
            }
          >
            {label}
            {count !== null && (
              <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                style={{ backgroundColor: subTab === id ? "rgba(255,255,255,0.2)" : "var(--dm-bg-surface)" }}>
                {count}
              </span>
            )}
          </button>
        ))}

        {fetching && (
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
            <Loader2 size={12} className="animate-spin" /> Buscando no Meta…
          </span>
        )}
      </div>

      {/* Error banner */}
      {fetchError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-400">
          <strong>Erro ao buscar criativos:</strong> {fetchError}
        </div>
      )}

      {/* ── Gallery & Starred ──────────────────────────────────────────────── */}
      {(subTab === "gallery" || subTab === "starred") && (
        <>
          {/* Type filter pills */}
          {subTab === "gallery" && (
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: "all" as const,      label: "Todos",      count: metaAds.length },
                  { key: "video" as const,     label: "🎬 Vídeo",   count: videoCount },
                  { key: "image" as const,     label: "🖼️ Imagem",  count: imageCount },
                  { key: "carousel" as const,  label: "📎 Carrossel", count: carouselCount },
                ] as const
              ).map(({ key, label, count }) => count > 0 || key === "all" ? (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTypeFilter(key)}
                  className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-all"
                  style={
                    typeFilter === key
                      ? { backgroundColor: "var(--dm-brand-500)", color: "#fff", borderColor: "var(--dm-brand-500)" }
                      : { backgroundColor: "var(--dm-bg-surface)", color: "var(--dm-text-secondary)", borderColor: "var(--dm-border-default)" }
                  }
                >
                  {label}
                  <span className="rounded-full px-1 text-[10px]"
                    style={{ opacity: 0.7 }}>
                    {count}
                  </span>
                </button>
              ) : null)}
            </div>
          )}

          {/* Grid */}
          {galleryAds.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border py-14 text-center"
              style={{ borderColor: "var(--dm-border-default)" }}>
              <ImageIcon size={32} style={{ color: "var(--dm-border-strong)" }} />
              <p className="text-sm font-semibold" style={{ color: "var(--dm-text-secondary)" }}>
                {subTab === "starred" ? "Nenhum criativo marcado como destaque" : "Nenhum criativo encontrado"}
              </p>
              {subTab === "starred" && (
                <p className="text-xs" style={{ color: "var(--dm-text-tertiary)" }}>
                  Clique na ⭐ em qualquer criativo para marcá-lo como destaque.
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {galleryAds.map((ad) => (
                <CreativeCard
                  key={ad.adId}
                  ad={ad}
                  metrics={metricsMap.get(ad.campaignName)}
                  starred={store[ad.adId]?.starred ?? false}
                  onPreview={() => setPreviewAd(ad)}
                  onToggleStar={() => toggleStar(ad)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Rankings ──────────────────────────────────────────────────────── */}
      {subTab === "rankings" && (
        <div className="grid gap-4 md:grid-cols-3">
          {/* CTR */}
          <article className="rounded-xl border p-5 shadow-sm"
            style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
            <div className="mb-4 flex items-center gap-2">
              <MousePointerClick size={16} style={{ color: "var(--dm-brand-500)" }} />
              <div>
                <h3 className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>Maior CTR</h3>
                <p className="text-[11px]" style={{ color: "var(--dm-text-secondary)" }}>Criativos que mais geram cliques</p>
              </div>
            </div>
            {byCtr.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--dm-text-tertiary)" }}>Dados insuficientes.</p>
            ) : (
              <ol className="space-y-2">
                {byCtr.map((c, idx) => {
                  const ad = firstAdByCampaign.get(c.campaignName);
                  return (
                    <RankingRow key={c.campaignName} rank={idx + 1} ad={ad} metrics={c}
                      highlight="CTR" highlightValue={formatPercent(c.ctr)}
                      onPreview={ad ? () => setPreviewAd(ad) : undefined} />
                  );
                })}
              </ol>
            )}
          </article>

          {/* ROAS */}
          <article className="rounded-xl border p-5 shadow-sm"
            style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
            <div className="mb-4 flex items-center gap-2">
              <Trophy size={16} className="text-amber-500" />
              <div>
                <h3 className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>Melhor ROAS</h3>
                <p className="text-[11px]" style={{ color: "var(--dm-text-secondary)" }}>Maior retorno sobre investimento</p>
              </div>
            </div>
            {byRoas.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--dm-text-tertiary)" }}>Dados insuficientes.</p>
            ) : (
              <ol className="space-y-2">
                {byRoas.map((c, idx) => {
                  const ad = firstAdByCampaign.get(c.campaignName);
                  return (
                    <RankingRow key={c.campaignName} rank={idx + 1} ad={ad} metrics={c}
                      highlight="ROAS" highlightValue={`${c.roas.toFixed(2)}x`}
                      onPreview={ad ? () => setPreviewAd(ad) : undefined} />
                  );
                })}
              </ol>
            )}
          </article>

          {/* Conversão */}
          <article className="rounded-xl border p-5 shadow-sm"
            style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
            <div className="mb-4 flex items-center gap-2">
              <ShoppingCart size={16} className="text-emerald-500" />
              <div>
                <h3 className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>Melhor Conversão</h3>
                <p className="text-[11px]" style={{ color: "var(--dm-text-secondary)" }}>Maior taxa de conversão em vendas</p>
              </div>
            </div>
            {byConversion.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--dm-text-tertiary)" }}>Dados insuficientes.</p>
            ) : (
              <ol className="space-y-2">
                {byConversion.map((c, idx) => {
                  const ad = firstAdByCampaign.get(c.campaignName);
                  return (
                    <RankingRow key={c.campaignName} rank={idx + 1} ad={ad} metrics={c}
                      highlight="Tx. Conv." highlightValue={formatPercent(c.conversionRate)}
                      onPreview={ad ? () => setPreviewAd(ad) : undefined} />
                  );
                })}
              </ol>
            )}
          </article>
        </div>
      )}

      {/* ── Preview Modal ──────────────────────────────────────────────────── */}
      {previewAd && (
        <PreviewModal
          ad={previewAd}
          metrics={metricsMap.get(previewAd.campaignName)}
          starred={store[previewAd.adId]?.starred ?? false}
          onClose={() => setPreviewAd(null)}
          onToggleStar={() => toggleStar(previewAd)}
        />
      )}
    </div>
  );
}
