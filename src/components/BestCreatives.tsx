"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  ChevronDown, ExternalLink, Film, ImageIcon, Layers, Loader2,
  MousePointerClick, Play, RefreshCw, ShoppingCart, Star, Trophy, X,
} from "lucide-react";

import { AggregatedCampaign } from "@/types/campaign";
import { useCreativeStore } from "@/hooks/useCreativeStore";
import type { MetaCampaignCreative, AdInsight } from "@/utils/metaApi";
import { fetchMetaCreatives, fetchAdInsights, loadMetaCredentials } from "@/utils/metaApi";
import { formatCurrency, formatPercent } from "@/utils/metrics";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE      = 24;
const CACHE_TTL_MS   = 6 * 60 * 60 * 1000; // 6h

// ─── Types ────────────────────────────────────────────────────────────────────

interface BestCreativesProps {
  campaigns:    AggregatedCampaign[];
  adAccountId?: string | string[];
  dateFrom?:    string;
  dateTo?:      string;
}

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
      scrolling="no"
      className="absolute inset-0 border-none"
      style={{ width: "118%", height: "118%", transform: "scale(0.847)", transformOrigin: "top left" }}
      sandbox="allow-scripts allow-same-origin"
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

      {/* Hover overlay actions */}
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 z-10">
        <button type="button" onClick={onToggleStar}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 backdrop-blur-sm hover:bg-black/80">
          <Star size={12} fill={starred ? "#f59e0b" : "none"} stroke={starred ? "#f59e0b" : "white"} />
        </button>
        <a href={ad.adLink} target="_blank" rel="noopener noreferrer"
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 backdrop-blur-sm hover:bg-black/80">
          <ExternalLink size={12} className="text-white" />
        </a>
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1.5 p-3">
        <p className="line-clamp-1 text-[11px] font-semibold leading-snug"
          style={{ color: "var(--dm-text-primary)" }} title={ad.adName}>
          {ad.adName}
        </p>
        <p className="truncate text-[10px]" style={{ color: "var(--dm-text-tertiary)" }} title={ad.campaignName}>
          {ad.campaignName}
        </p>

        {/* Metrics row */}
        {insight && (
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 pt-0.5 text-[10px]" style={{ color: "var(--dm-text-secondary)" }}>
            <span>CTR <strong>{formatPercent(insight.ctr)}</strong></span>
            {insight.spend > 0 && <span>Inv <strong>{formatCurrency(insight.spend)}</strong></span>}
            {insight.roas > 0 && <span>ROAS <strong>{insight.roas.toFixed(2)}x</strong></span>}
            {insight.leads > 0 && <span>Leads <strong>{insight.leads}</strong></span>}
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

// ─── Preview Modal ────────────────────────────────────────────────────────────

function PreviewModal({
  ad, insight, starred, accessToken, onClose, onToggleStar,
}: {
  ad: MetaCampaignCreative;
  insight?: AdInsight;
  starred: boolean;
  accessToken: string;
  onClose: () => void;
  onToggleStar: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const metrics = insight ? [
    { label: "CTR",          value: formatPercent(insight.ctr) },
    { label: "Investimento", value: formatCurrency(insight.spend) },
    { label: "Cliques",      value: insight.clicks.toLocaleString("pt-BR") },
    { label: "Impressões",   value: insight.impressions.toLocaleString("pt-BR") },
    ...(insight.roas > 0        ? [{ label: "ROAS",  value: `${insight.roas.toFixed(2)}x` }] : []),
    ...(insight.conversions > 0 ? [{ label: "CPA",   value: formatCurrency(insight.spend / insight.conversions) }] : []),
    ...(insight.leads > 0       ? [{ label: "Leads", value: String(insight.leads) }] : []),
    ...(insight.cpm > 0         ? [{ label: "CPM",   value: formatCurrency(insight.cpm) }] : []),
  ] : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>

      <div className="relative flex w-full max-w-3xl overflow-hidden rounded-2xl shadow-2xl md:flex-row"
        style={{ backgroundColor: "var(--dm-bg-card)", maxHeight: "90vh" }}>

        <button type="button" onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70">
          <X size={15} />
        </button>

        {/* Left — iframe preview */}
        <div className="relative w-full overflow-hidden bg-slate-950 md:w-[52%]" style={{ minHeight: 420 }}>
          <AdIframe ad={ad} accessToken={accessToken} />
        </div>

        {/* Right — details */}
        <div className="flex w-full flex-col gap-4 overflow-y-auto p-5 md:w-[48%]">

          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${TYPE_COLOR[ad.mediaType]}`}>
              {TYPE_LABEL[ad.mediaType]}
            </span>
            <button type="button" onClick={onToggleStar}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium"
              style={{ color: starred ? "#f59e0b" : "var(--dm-text-secondary)", backgroundColor: starred ? "rgba(245,158,11,0.1)" : "var(--dm-bg-elevated)" }}>
              <Star size={12} fill={starred ? "#f59e0b" : "none"} stroke={starred ? "#f59e0b" : "currentColor"} />
              {starred ? "Destacado" : "Marcar"}
            </button>
          </div>

          {/* Ad info */}
          <div>
            <p className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>{ad.adName}</p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--dm-text-secondary)" }}>{ad.campaignName}</p>
            {ad.adsetName && <p className="mt-0.5 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>{ad.adsetName}</p>}
          </div>

          {/* Metrics grid */}
          {metrics.length > 0 && (
            <div className="grid grid-cols-2 gap-1.5">
              {metrics.map(({ label, value }) => (
                <div key={label} className="rounded-lg p-2.5" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>{label}</p>
                  <p className="mt-0.5 text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>{value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="mt-auto flex flex-col gap-2">
            <a href={ad.adLink} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white"
              style={{ backgroundColor: "var(--dm-brand-500)" }}>
              <ExternalLink size={14} />
              Ver anúncio no Meta
            </a>
            {ad.previewUrl && ad.previewUrl !== ad.adLink && (
              <a href={ad.previewUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl border py-2 text-xs font-medium"
                style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
                <Play size={12} />
                Preview do anúncio
              </a>
            )}
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

export function BestCreatives({ campaigns, adAccountId, dateFrom, dateTo }: BestCreativesProps) {
  const [subTab,          setSubTab]          = useState<SubTab>("gallery");
  const [mediaFilter,     setMediaFilter]     = useState<MediaFilter>("all");
  const [campaignFilter,  setCampaignFilter]  = useState<string>("all");
  const [page,            setPage]            = useState(1);
  const [previewAd,       setPreviewAd]       = useState<MetaCampaignCreative | null>(null);
  const [metaAds,         setMetaAds]         = useState<MetaCampaignCreative[]>([]);
  const [adInsights,      setAdInsights]      = useState<Map<string, AdInsight>>(new Map());
  const [fetching,        setFetching]        = useState(false);
  const [fetchError,      setFetchError]      = useState<string | null>(null);
  const [cacheAge,        setCacheAge]        = useState<number | null>(null);

  const [accessToken] = useState(() => loadMetaCredentials().accessToken);
  const { store, saveCreative } = useCreativeStore();
  const storeRef = useRef(store);
  storeRef.current = store;

  const getIds = useCallback(() =>
    Array.isArray(adAccountId) ? adAccountId.filter(Boolean) : adAccountId ? [adAccountId] : []
  , [adAccountId]);

  // Load from cache on mount (no auto API call)
  const [hasLoaded, setHasLoaded] = useState(false);

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
        return;
      }
    }

    setFetching(true);
    setFetchError(null);
    setCacheAge(null);

    (async () => {
      // Sequential creatives fetch (ACTIVE + PAUSED only)
      const seen   = new Set<string>();
      const merged: MetaCampaignCreative[] = [];
      for (const id of ids) {
        const batch = await fetchMetaCreatives(id, accessToken);
        for (const ad of batch) {
          if (!seen.has(ad.adId)) { seen.add(ad.adId); merged.push(ad); }
        }
      }

      // Parallel ad-level insights
      if (dateFrom && dateTo) {
        const batches = await Promise.all(
          ids.map((id) => fetchAdInsights(id, accessToken, dateFrom, dateTo).catch(() => [] as AdInsight[]))
        );
        const map = new Map<string, AdInsight>();
        for (const b of batches) for (const r of b) map.set(r.ad_id, r);
        setAdInsights(map);
      }

      return merged;
    })()
      .then((merged) => { writeCache(cacheKey, merged); setMetaAds(merged); setCacheAge(0); setHasLoaded(true); })
      .catch((err: unknown) => setFetchError(err instanceof Error ? err.message : "Erro ao buscar criativos"))
      .finally(() => setFetching(false));
  }, [getIds, accessToken, dateFrom, dateTo]);

  // On mount: load from cache only (no auto API call)
  useEffect(() => {
    const ids = getIds();
    if (!ids.length || !accessToken) return;
    const cached = readCache(getCacheKey(ids));
    if (cached) {
      const raw = localStorage.getItem(getCacheKey(ids));
      const ts  = raw ? (JSON.parse(raw) as { ts: number }).ts : Date.now();
      setMetaAds(cached);
      setCacheAge(Date.now() - ts);
      setHasLoaded(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(adAccountId)]);

  // Reset page + campaign filter when ads change
  useEffect(() => { setPage(1); setCampaignFilter("all"); }, [metaAds]);

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

  // Unique campaigns for filter dropdown
  const campaignOptions = useMemo(() => {
    const names = [...new Set(metaAds.map((a) => a.campaignName))].filter(Boolean).sort();
    return names;
  }, [metaAds]);

  // Filtered + paginated ads
  const filteredAds = useMemo(() => {
    let base = subTab === "starred"
      ? metaAds.filter((a) => store[a.adId]?.starred)
      : metaAds;
    if (campaignFilter !== "all") base = base.filter((a) => a.campaignName === campaignFilter);
    if (mediaFilter !== "all")    base = base.filter((a) => a.mediaType === mediaFilter);
    return base;
  }, [metaAds, subTab, campaignFilter, mediaFilter, store]);

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

              {/* Campaign dropdown */}
              <div className="relative">
                <select
                  value={campaignFilter}
                  onChange={(e) => { setCampaignFilter(e.target.value); setPage(1); }}
                  className="appearance-none rounded-lg border py-1.5 pl-3 pr-7 text-[11px] font-medium focus:outline-none"
                  style={{
                    borderColor: "var(--dm-border-default)",
                    backgroundColor: campaignFilter !== "all" ? "var(--dm-brand-500)" : "var(--dm-bg-elevated)",
                    color: campaignFilter !== "all" ? "#fff" : "var(--dm-text-secondary)",
                  }}
                >
                  <option value="all">Todas as campanhas ({metaAds.length})</option>
                  {campaignOptions.map((name) => {
                    const count = metaAds.filter((a) => a.campaignName === name).length;
                    return <option key={name} value={name}>{name} ({count})</option>;
                  })}
                </select>
                <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
                  style={{ color: campaignFilter !== "all" ? "rgba(255,255,255,0.8)" : "var(--dm-text-tertiary)" }} />
              </div>

              {/* Media type pills */}
              {(["all", "video", "image", "carousel"] as const).map((key) => {
                const labels = { all: "Todos", video: "🎬 Vídeo", image: "🖼 Imagem", carousel: "📎 Carrossel" };
                const count  = key === "all"
                  ? filteredAds.length
                  : metaAds.filter((a) => a.mediaType === key && (campaignFilter === "all" || a.campaignName === campaignFilter)).length;
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
        />
      )}
    </div>
  );
}
