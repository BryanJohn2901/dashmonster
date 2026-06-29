"use client";

import { useEffect, useState } from "react";
import {
  Area, AreaChart, Bar, CartesianGrid, ComposedChart, Line,
  Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Activity, AtSign, BarChart2, ChevronLeft, ChevronRight, Eye, Heart, Image, Loader2,
  MessageCircle, TrendingDown, TrendingUp, Users, UserMinus, Zap,
} from "lucide-react";
import type { IGHistoryPoint, IGTrackedAccount } from "@/app/api/instagram/history/route";

// ─── Gradiente IG ────────────────────────────────────────────────────────────
const IG_GRADIENT = "linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("pt-BR");
}

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDay(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
}

function DeltaBadge({ value, suffix = "" }: { value: number; suffix?: string }) {
  if (value === 0) return <span className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>—</span>;
  const pos = value > 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
      style={{
        background: pos ? "rgba(5,205,153,0.15)" : "rgba(238,93,80,0.15)",
        color: pos ? "#05CD99" : "#EE5D50",
      }}
    >
      {pos ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {pos ? "+" : ""}{value.toLocaleString("pt-BR")}{suffix}
    </span>
  );
}

// ─── Score ring ──────────────────────────────────────────────────────────────
function ScoreBadge({ score }: { score: number }) {
  const color = score >= 75 ? "#05CD99" : score >= 50 ? "#F4A60D" : "#EE5D50";
  const label = score >= 75 ? "Ótimo" : score >= 50 ? "Regular" : "Fraco";
  return (
    <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5"
      style={{ background: `${color}18`, border: `1px solid ${color}40` }}>
      <Zap size={11} style={{ color }} />
      <span className="text-[12px] font-bold tabular-nums" style={{ color }}>
        {score.toFixed(1)}% · {label}
      </span>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiTile({
  icon: Icon, label, value, sub, color,
}: { icon: React.ElementType; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border p-4"
      style={{ backgroundColor: "var(--dm-bg-elevated)", borderColor: "var(--dm-border-subtle)" }}>
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ background: `${color}20` }}>
          <Icon size={14} style={{ color }} />
        </div>
        <span className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>{label}</span>
      </div>
      <p className="text-xl font-black tabular-nums leading-none" style={{ color: "var(--dm-text-primary)" }}>{value}</p>
      {sub && <p className="text-[11px]" style={{ color: "var(--dm-text-secondary)" }}>{sub}</p>}
    </div>
  );
}

// ─── Mini chart tooltip ───────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, suffix = "" }: {
  active?: boolean; payload?: { value: number }[]; label?: string; suffix?: string
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
      <p style={{ color: "var(--dm-text-secondary)" }}>{label}</p>
      <p className="font-bold tabular-nums" style={{ color: "var(--dm-text-primary)" }}>
        {typeof payload[0]?.value === "number"
          ? payload[0].value.toLocaleString("pt-BR") + suffix
          : "—"}
      </p>
    </div>
  );
}

// ─── Composed chart tooltip (ganhos/perdas/net) ───────────────────────────────
function GainsTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border px-3 py-2 text-xs shadow-lg space-y-1"
      style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
      <p className="font-semibold" style={{ color: "var(--dm-text-secondary)" }}>{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 tabular-nums">
          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: entry.color }} />
          <span style={{ color: "var(--dm-text-tertiary)" }}>{entry.name}:</span>
          <span className="font-bold" style={{ color: "var(--dm-text-primary)" }}>
            {entry.value.toLocaleString("pt-BR")}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
type LiveDiag = {
  tokenValid: boolean;
  tokenError?: string | null;
  followsError?: string | null;
  metricsError?: string | null;
  metricPts?: {
    follows_and_unfollows: number;
    reach: number;
    impressions: number;
    profile_visits: number;
  };
};

export function PerfilAtivoPanel({
  igUserId, dateFrom, dateTo,
}: { igUserId: string; dateFrom: string; dateTo: string }) {
  const [account, setAccount]       = useState<IGTrackedAccount | null>(null);
  const [history, setHistory]       = useState<IGHistoryPoint[]>([]);
  const [loading, setLoading]       = useState(true);
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>("active");
  const [notFound, setNotFound]     = useState(false);
  const [liveDiag, setLiveDiag]     = useState<LiveDiag | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);
  const [tableStep, setTableStep]     = useState<number>(1); // 1=diário, 10=de 10 em 10
  const [tablePage, setTablePage]     = useState<number>(1);

  useEffect(() => {
    if (!igUserId) return;
    setLoading(true); setNotFound(false); setErrorMsg(null);

    fetch("/api/instagram/history", { method: "POST" })
      .then(r => r.json())
      .then(async (accounts: Array<IGTrackedAccount & { connectionStatus?: string }>) => {
        const match = accounts.find(a => a.instagramBusinessAccountId === igUserId);
        if (!match) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setConnectionStatus(match.connectionStatus ?? "active");

        // 1. Load stored Supabase history
        const params = new URLSearchParams({ accountId: match.id });
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo)   params.set("dateTo",   dateTo);
        const res = await fetch(`/api/instagram/history?${params}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
        }
        const data = await res.json() as { account: IGTrackedAccount; history: IGHistoryPoint[] };
        const storedAccount = data.account ?? null;
        let storedHistory: IGHistoryPoint[] = Array.isArray(data.history) ? data.history : [];

        // 2. If Supabase history is sparse (< 7 days), augment with live Meta API data
        if (storedHistory.length < 7) {
          try {
            const liveRes = await fetch(
              `/api/instagram/accounts/live-history?ibaId=${encodeURIComponent(igUserId)}`,
            );
            const liveData = await liveRes.json() as {
              history?: IGHistoryPoint[];
              _diag?: LiveDiag & { metricPts?: LiveDiag["metricPts"] };
              tokenError?: string;
            };
            // Capture diagnostic for UI display
            if (liveData._diag) {
              setLiveDiag(liveData._diag as LiveDiag);
            } else if (!liveRes.ok) {
              setLiveDiag({ tokenValid: false, tokenError: liveData.tokenError ?? `HTTP ${liveRes.status}` });
            }
            if (liveRes.ok) {
              const liveHistory = Array.isArray(liveData.history) ? liveData.history : [];
              if (liveHistory.length > 0) {
                // Merge: live data fills dates not yet in Supabase
                const storedDates = new Set(storedHistory.map(h => h.date));
                const merged = [
                  ...storedHistory,
                  ...liveHistory.filter(h => !storedDates.has(h.date)),
                ];
                storedHistory = merged.sort((a, b) => a.date.localeCompare(b.date));
              }
            }
          } catch {
            // Live fetch failed — proceed with whatever Supabase has
          }
        }

        setAccount(storedAccount);
        setHistory(storedHistory);
        setLoading(false);
      })
      .catch((e) => {
        setErrorMsg(e instanceof Error ? e.message : "Falha ao carregar dados.");
        setLoading(false);
      });
  }, [igUserId, dateFrom, dateTo]);

  // ── Backfill: busca até 90 dias retroativos da Meta API ──────────────────
  async function handleBackfill() {
    if (!igUserId || backfilling) return;
    setBackfilling(true);
    setBackfillMsg(null);
    try {
      const res = await fetch("/api/instagram/accounts/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ibaId: igUserId }),
      });
      const data = await res.json() as {
        ok?: boolean;
        daysInserted?: number;
        dateRange?: [string, string];
        error?: string;
      };
      if (!res.ok || data.error) {
        setBackfillMsg(`Erro: ${data.error ?? "falha desconhecida"}`);
      } else {
        setBackfillMsg(`✓ ${data.daysInserted ?? 0} dias importados (${data.dateRange?.[0]} → ${data.dateRange?.[1]})`);
        // Reload history
        setLoading(true);
        const r = await fetch("/api/instagram/history", { method: "POST" });
        const accounts = await r.json() as IGTrackedAccount[];
        const match = accounts.find(a => a.instagramBusinessAccountId === igUserId);
        if (match) setAccount(match);
        const params = new URLSearchParams({ ibaId: igUserId, dateFrom, dateTo });
        const hr = await fetch(`/api/instagram/history?${params}`);
        const hd = await hr.json() as { history?: IGHistoryPoint[] };
        if (hd.history) setHistory(hd.history);
        setLoading(false);
      }
    } catch (e) {
      setBackfillMsg(`Erro: ${String(e)}`);
    } finally {
      setBackfilling(false);
    }
  }

  // ── Derived stats ────────────────────────────────────────────────────────
  const sorted  = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const last7   = sorted.slice(-7);
  const last30  = sorted.slice(-30);
  const first   = sorted[0];
  const latest  = sorted[sorted.length - 1];

  const followersDelta30 = first && latest ? latest.followersCount - first.followersCount : 0;
  const followersDelta7  = last7.length >= 2
    ? (last7[last7.length - 1]?.followersCount ?? 0) - (last7[0]?.followersCount ?? 0) : 0;
  const growthRate30     = first && first.followersCount > 0
    ? ((followersDelta30 / first.followersCount) * 100).toFixed(2) : "0.00";
  const avgEngagement30  = last30.length
    ? (last30.reduce((s, p) => s + p.engagementRate, 0) / last30.length * 100).toFixed(2)
    : "0.00";

  const totalGained30    = last30.reduce((s, p) => s + p.dailyFollowersGained, 0);
  const totalLost30      = last30.reduce((s, p) => s + (p.dailyUnfollows ?? 0), 0);
  // A Meta só entrega unfollows com Advanced Access + conta elegível. Nenhum dia
  // com perda na janela = métrica não retornada (indisponível), não perda zero.
  const unfollowsAvailable = last30.some((p) => (p.dailyUnfollows ?? 0) > 0);
  const avgReachDay      = last30.length ? Math.round(last30.reduce((s, p) => s + p.reach, 0) / last30.length) : 0;
  const avgImpDay        = last30.length ? Math.round(last30.reduce((s, p) => s + p.impressions, 0) / last30.length) : 0;
  const totalViews       = last30.reduce((s, p) => s + p.profileViews, 0);

  const score = Math.min(100, parseFloat(growthRate30) * 4 + parseFloat(avgEngagement30) * 10);

  // Tabela: do mais recente p/ o mais antigo, amostrando no passo escolhido.
  const reversed     = [...sorted].reverse();
  const sampledRows  = tableStep <= 1
    ? reversed
    : reversed.filter((_, i) => i % tableStep === 0);

  // Paginação 10/página
  const TABLE_PAGE_SIZE = 10;
  const totalTablePages = Math.max(1, Math.ceil(sampledRows.length / TABLE_PAGE_SIZE));
  const currentTablePage = Math.min(tablePage, totalTablePages);
  const tableFirstIdx = sampledRows.length === 0 ? 0 : (currentTablePage - 1) * TABLE_PAGE_SIZE + 1;
  const tableLastIdx  = Math.min(currentTablePage * TABLE_PAGE_SIZE, sampledRows.length);
  const tableRows = sampledRows.slice((currentTablePage - 1) * TABLE_PAGE_SIZE, currentTablePage * TABLE_PAGE_SIZE);

  // Chart data
  const chartFollowers = sorted.map(p => ({
    date:  p.date.slice(5),
    value: p.followersCount,
  }));
  const chartEngagement = sorted.map(p => ({
    date:  p.date.slice(5),
    value: parseFloat((p.engagementRate * 100).toFixed(3)),
  }));
  const chartGains = sorted.map(p => ({
    date:    p.date.slice(5),
    Ganhos:  p.dailyFollowersGained,
    Perdas:  -(p.dailyUnfollows ?? 0),
    Saldo:   p.dailyFollowersGained - (p.dailyUnfollows ?? 0),
  }));

  const reconnect = () => { window.location.href = "/api/instagram/oauth/start"; };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} />
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (errorMsg) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: "rgba(238,93,80,0.15)" }}>
          <Zap size={22} style={{ color: "#EE5D50" }} />
        </div>
        <p className="text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>
          Não foi possível carregar os dados
        </p>
        <p className="max-w-xs text-xs" style={{ color: "var(--dm-text-tertiary)" }}>{errorMsg}</p>
      </div>
    );
  }

  // ── Not tracked ────────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: IG_GRADIENT }}>
          <AtSign size={22} className="text-white" />
        </div>
        <p className="text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>
          Conta não rastreada no Supabase
        </p>
        <p className="max-w-xs text-xs" style={{ color: "var(--dm-text-tertiary)" }}>
          ID <span className="font-mono">{igUserId}</span> não encontrado em{" "}
          <span className="font-mono">instagram_accounts</span>. Registre a conta primeiro em{" "}
          <strong>Minha Conta → Integrações</strong>.
        </p>
      </div>
    );
  }

  if (!account) return null;

  return (
    <div className="space-y-5 pt-3">

      {/* ── Reconnect banner (token expirado) ── */}
      {connectionStatus !== "active" && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5"
          style={{ background: "rgba(238,93,80,0.08)", borderColor: "rgba(238,93,80,0.25)" }}>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold" style={{ color: "#EE5D50" }}>
              Conexão expirada
            </p>
            <p className="text-[11px]" style={{ color: "var(--dm-text-secondary)" }}>
              O token desta conta deixou de funcionar. Reconecte para retomar a coleta diária.
            </p>
          </div>
          <button
            type="button"
            onClick={reconnect}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-opacity hover:opacity-80"
            style={{ background: "rgba(238,93,80,0.15)", color: "#EE5D50" }}>
            Reconectar Instagram
          </button>
        </div>
      )}

      {/* ── Sincronizando (sem histórico ainda) ── */}
      {history.length === 0 && (
        <div className="flex items-start gap-2 rounded-lg border px-3 py-2.5"
          style={{ background: "rgba(96,165,250,0.07)", borderColor: "rgba(96,165,250,0.2)" }}>
          <Loader2 size={14} className="mt-0.5 animate-spin" style={{ color: "#60A5FA" }} />
          <div className="space-y-0.5">
            <p className="text-[12px] font-semibold" style={{ color: "#60A5FA" }}>Sincronizando…</p>
            <p className="text-[11px]" style={{ color: "var(--dm-text-secondary)" }}>
              Ainda não há histórico salvo para esta conta. Os dados aparecem após o primeiro
              sync diário ou ao usar o botão de importar histórico abaixo.
            </p>
          </div>
        </div>
      )}

      {/* ── Live API diagnostic bar ── */}
      {liveDiag && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-[11px]"
          style={
            !liveDiag.tokenValid
              ? { background: "rgba(238,93,80,0.08)", borderColor: "rgba(238,93,80,0.25)" }
              : Object.values(liveDiag.metricPts ?? {}).some(v => v > 0)
                ? { background: "rgba(5,205,153,0.08)", borderColor: "rgba(5,205,153,0.25)" }
                : { background: "rgba(245,158,11,0.08)", borderColor: "rgba(245,158,11,0.25)" }
          }>
          {!liveDiag.tokenValid ? (
            <>
              <span style={{ color: "#EE5D50" }} className="font-semibold">⚠ Token inválido</span>
              <span style={{ color: "var(--dm-text-tertiary)" }}>{liveDiag.tokenError}</span>
            </>
          ) : (
            <>
              <span className="font-semibold" style={{ color: "var(--dm-text-secondary)" }}>Live API</span>
              {liveDiag.followsError && (
                <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(238,93,80,0.15)", color: "#EE5D50" }}>
                  follows: erro — {liveDiag.followsError.slice(0, 60)}
                </span>
              )}
              {liveDiag.metricsError && (
                <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(238,93,80,0.15)", color: "#EE5D50" }}>
                  metrics: erro — {liveDiag.metricsError.slice(0, 60)}
                </span>
              )}
              {liveDiag.metricPts && Object.entries(liveDiag.metricPts).map(([k, v]) => (
                <span key={k} className="rounded px-1.5 py-0.5 tabular-nums"
                  style={v > 0
                    ? { background: "rgba(5,205,153,0.15)", color: "#05CD99" }
                    : { background: "rgba(148,163,184,0.1)", color: "var(--dm-text-tertiary)" }}>
                  {k.replace("_and_", "/")}:{" "}<strong>{v}pt{v !== 1 ? "s" : ""}</strong>
                </span>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Scarcity banner when data accumulating ── */}
      {history.length < 7 && liveDiag && liveDiag.tokenValid &&
        liveDiag.metricPts && Object.values(liveDiag.metricPts).every(v => v <= 1) && (
        <div className="flex items-start gap-2 rounded-lg border px-3 py-2.5"
          style={{ background: "rgba(96,165,250,0.07)", borderColor: "rgba(96,165,250,0.2)" }}>
          <span className="mt-0.5 text-sm">📅</span>
          <div className="space-y-0.5">
            <p className="text-[12px] font-semibold" style={{ color: "#60A5FA" }}>
              Acumulando dados diariamente
            </p>
            <p className="text-[11px]" style={{ color: "var(--dm-text-secondary)" }}>
              A Meta API armazena insights a partir da data de conexão. Os gráficos ficarão completos
              em 30 dias de coleta automática via sync diário.
            </p>
            <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
              Se os campos ficam em 0, verifique se <strong>instagram_manage_insights</strong> tem
              acesso Advanced no Meta App e se o Usuário de Sistema tem papel de{" "}
              <strong>Administrador</strong> (não apenas Analista).
            </p>
          </div>
        </div>
      )}

      {/* ── Backfill histórico retroativo ── */}
      {(
        <div className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5"
          style={{ background: "rgba(168,85,247,0.06)", borderColor: "rgba(168,85,247,0.2)" }}>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold" style={{ color: "#A855F7" }}>Importar histórico retroativo</p>
            <p className="text-[11px]" style={{ color: "var(--dm-text-secondary)" }}>
              Busca até 90 dias de reach, impressões e views na Meta API e salva no banco.
            </p>
            {backfillMsg && (
              <p className="text-[11px] mt-0.5 font-medium"
                style={{ color: backfillMsg.startsWith("✓") ? "#05CD99" : "#F97316" }}>
                {backfillMsg}
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={backfilling}
            onClick={() => void handleBackfill()}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-opacity disabled:opacity-50"
            style={{ background: "rgba(168,85,247,0.15)", color: "#A855F7" }}>
            {backfilling
              ? <><Loader2 size={12} className="animate-spin" /> Importando...</>
              : "↩ Buscar 90 dias"}
          </button>
        </div>
      )}

      {/* ── Profile header ── */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border p-4"
        style={{ backgroundColor: "var(--dm-bg-elevated)", borderColor: "var(--dm-border-subtle)" }}>

        {account.profilePictureUrl ? (
          <img src={account.profilePictureUrl} alt={account.username}
            className="h-14 w-14 flex-shrink-0 rounded-full object-cover ring-2 ring-[var(--dm-border-default)]" />
        ) : (
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full text-white text-xl font-black"
            style={{ background: IG_GRADIENT }}>
            {account.username[0]?.toUpperCase()}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-black" style={{ color: "var(--dm-text-primary)" }}>
              @{account.username}
            </span>
            {account.isVerified && (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                style={{ background: "rgba(96,165,250,0.15)", color: "#60A5FA" }}>✓ verificado</span>
            )}
            <ScoreBadge score={Math.min(100, score)} />
          </div>
          {account.name && (
            <p className="text-xs mt-0.5 truncate" style={{ color: "var(--dm-text-secondary)" }}>{account.name}</p>
          )}
        </div>

        <div className="flex gap-5">
          {[
            { label: "Seguidores", value: fmtNum(account.followersCount), delta: followersDelta30 },
            { label: "Seguindo",   value: fmtNum(account.followsCount),   delta: 0 },
            { label: "Posts",      value: fmtNum(account.mediaCount),     delta: 0 },
          ].map(({ label, value, delta }) => (
            <div key={label} className="flex flex-col items-center gap-0.5">
              <span className="text-base font-black tabular-nums" style={{ color: "var(--dm-text-primary)" }}>{value}</span>
              {delta !== 0 && <DeltaBadge value={delta} />}
              <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--dm-text-tertiary)" }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── KPI grid ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <KpiTile icon={TrendingUp}   label="Crescimento 30d"    value={`${growthRate30}%`}          sub={`+${fmtNum(followersDelta30)} seg.`} color="#05CD99" />
        <KpiTile icon={Users}        label="Ganho semanal"      value={`+${fmtNum(followersDelta7)}`} sub="últimos 7 dias"                    color="#60A5FA" />
        <KpiTile icon={TrendingUp}   label="Ganhos 30d"         value={`+${fmtNum(totalGained30)}`} sub="seguidores ganhos"                   color="#34D399" />
        <KpiTile icon={UserMinus}    label="Perda 30d"
          value={unfollowsAvailable ? `-${fmtNum(totalLost30)}` : "—"}
          sub={unfollowsAvailable ? "seguidores perdidos" : "indisponível na Meta"}
          color="#EE5D50" />
        <KpiTile icon={Activity}     label="Engajamento"        value={`${avgEngagement30}%`}        sub="média 30 dias"                      color="#F59E0B" />
        <KpiTile icon={Eye}          label="Alcance médio/dia"  value={fmtNum(avgReachDay)}          sub="pessoas únicas"                     color="#4ADE80" />
        <KpiTile icon={BarChart2}    label="Impressões médio/d" value={fmtNum(avgImpDay)}            sub="média diária"                       color="#F97316" />
        <KpiTile icon={Image}        label="Views de perfil"    value={fmtNum(totalViews)}           sub="30 dias"                            color="#EC4899" />
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Followers chart */}
        <div className="rounded-xl border p-4"
          style={{ backgroundColor: "var(--dm-bg-elevated)", borderColor: "var(--dm-border-subtle)" }}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-secondary)" }}>
            Seguidores
          </p>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={chartFollowers} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gFollowers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#05CD99" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#05CD99" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--dm-border-subtle)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--dm-text-tertiary)" }} tickLine={false} interval="preserveStartEnd" />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--dm-text-tertiary)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => fmtNum(v as number)}
                width={46}
                domain={[
                  (min: number) => Math.floor(min - Math.max(50, min * 0.003)),
                  (max: number) => Math.ceil(max + Math.max(50, max * 0.003)),
                ]}
                allowDecimals={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="value" stroke="#05CD99" strokeWidth={2} fill="url(#gFollowers)" dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Engagement chart */}
        <div className="rounded-xl border p-4"
          style={{ backgroundColor: "var(--dm-bg-elevated)", borderColor: "var(--dm-border-subtle)" }}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-secondary)" }}>
            Taxa de Engajamento
          </p>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={chartEngagement} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gEngagement" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#F59E0B" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--dm-border-subtle)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--dm-text-tertiary)" }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: "var(--dm-text-tertiary)" }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} width={40} />
              <Tooltip content={<ChartTooltip suffix="%" />} />
              <Area type="monotone" dataKey="value" stroke="#F59E0B" strokeWidth={2} fill="url(#gEngagement)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Gains vs Losses chart */}
        <div className="rounded-xl border p-4"
          style={{ backgroundColor: "var(--dm-bg-elevated)", borderColor: "var(--dm-border-subtle)" }}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-secondary)" }}>
            Ganhos vs Perdas diários
          </p>
          {!unfollowsAvailable && (
            <p className="-mt-2 mb-3 text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
              Perdas indisponíveis nesta conta (a Meta só envia unfollows com Advanced Access e conta elegível).
            </p>
          )}
          <ResponsiveContainer width="100%" height={160}>
            <ComposedChart data={chartGains} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--dm-border-subtle)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--dm-text-tertiary)" }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: "var(--dm-text-tertiary)" }} tickLine={false} axisLine={false} width={36} />
              <Tooltip content={<GainsTooltip />} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: "var(--dm-text-tertiary)" }} />
              <Bar dataKey="Ganhos" fill="#34D399" radius={[2, 2, 0, 0]} maxBarSize={14} />
              <Bar dataKey="Perdas" fill="#EE5D50" radius={[2, 2, 0, 0]} maxBarSize={14} />
              <Line type="monotone" dataKey="Saldo" stroke="#60A5FA" strokeWidth={1.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Historical table ── */}
      {sampledRows.length > 0 && (
        <div className="rounded-xl border overflow-hidden"
          style={{ borderColor: "var(--dm-border-subtle)" }}>
          {/* Header: título + contador + filtro de intervalo + paginação */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            style={{ backgroundColor: "var(--dm-bg-elevated)", borderBottom: "1px solid var(--dm-border-subtle)" }}>
            <div>
              <h3 className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>
                Acompanhamento Diário de Seguidores
              </h3>
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
                {tableFirstIdx}–{tableLastIdx} de {sampledRows.length} registros
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Filtro de intervalo */}
              <div className="flex items-center gap-1">
                {([[1, "Diário"], [5, "5 em 5"], [10, "10 em 10"], [30, "Mensal"]] as [number, string][]).map(([step, label]) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => { setTableStep(step); setTablePage(1); }}
                    className="rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors"
                    style={tableStep === step
                      ? { background: "var(--dm-brand-500, #16A34A)", color: "#fff" }
                      : { backgroundColor: "var(--dm-bg-surface)", color: "var(--dm-text-tertiary)", border: "1px solid var(--dm-border-subtle)" }}>
                    {label}
                  </button>
                ))}
              </div>
              {/* Paginação */}
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setTablePage((p) => Math.max(1, p - 1))} disabled={currentTablePage === 1}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border transition disabled:opacity-30"
                  style={{ borderColor: "var(--dm-border-subtle)", color: "var(--dm-text-tertiary)" }}>
                  <ChevronLeft size={14} />
                </button>
                <span className="min-w-[48px] text-center text-[11px] font-semibold" style={{ color: "var(--dm-text-secondary)" }}>
                  {currentTablePage} / {totalTablePages}
                </span>
                <button type="button" onClick={() => setTablePage((p) => Math.min(totalTablePages, p + 1))} disabled={currentTablePage === totalTablePages}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border transition disabled:opacity-30"
                  style={{ borderColor: "var(--dm-border-subtle)", color: "var(--dm-text-tertiary)" }}>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ backgroundColor: "var(--dm-bg-elevated)", borderBottom: "1px solid var(--dm-border-subtle)" }}>
                {["Data", "Seguidores", "Seguindo", "Posts", "Ganhos", "Perdas", "Alcance", "Impressões", "Engajamento"].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider whitespace-nowrap"
                    style={{ color: "var(--dm-text-tertiary)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, idx) => {
                const prev   = tableRows[idx + 1];
                const fDelta = prev ? row.followersCount - prev.followersCount : 0;
                const mDelta = prev ? row.mediaCount     - prev.mediaCount     : 0;
                const eDelta = prev
                  ? parseFloat(((row.engagementRate - prev.engagementRate) * 100).toFixed(2))
                  : 0;

                return (
                  <tr key={row.date}
                    className="border-b transition-colors hover:bg-white/5"
                    style={{ borderColor: "var(--dm-border-subtle)" }}>
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap" style={{ color: "var(--dm-text-primary)" }}>
                      {fmtDate(row.date)}{" "}
                      <span className="capitalize text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                        {fmtDay(row.date)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="tabular-nums font-semibold" style={{ color: "var(--dm-text-primary)" }}>
                        {row.followersCount.toLocaleString("pt-BR")}
                      </span>{" "}
                      {fDelta !== 0 && <DeltaBadge value={fDelta} />}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums" style={{ color: "var(--dm-text-secondary)" }}>
                      {row.followingCount.toLocaleString("pt-BR")}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="tabular-nums" style={{ color: "var(--dm-text-secondary)" }}>
                        {row.mediaCount.toLocaleString("pt-BR")}
                      </span>{" "}
                      {mDelta !== 0 && <DeltaBadge value={mDelta} />}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums font-semibold" style={{ color: "#34D399" }}>
                      {row.dailyFollowersGained > 0 ? `+${row.dailyFollowersGained.toLocaleString("pt-BR")}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums font-semibold" style={{ color: (row.dailyUnfollows ?? 0) > 0 ? "#EE5D50" : "var(--dm-text-tertiary)" }}>
                      {(row.dailyUnfollows ?? 0) > 0 ? `-${(row.dailyUnfollows ?? 0).toLocaleString("pt-BR")}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums" style={{ color: "var(--dm-text-secondary)" }}>
                      {row.reach > 0 ? fmtNum(row.reach) : "—"}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums" style={{ color: "var(--dm-text-secondary)" }}>
                      {row.impressions > 0 ? fmtNum(row.impressions) : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="tabular-nums" style={{ color: "var(--dm-text-secondary)" }}>
                        {(row.engagementRate * 100).toFixed(2)}%
                      </span>{" "}
                      {eDelta !== 0 && <DeltaBadge value={eDelta} suffix="%" />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          {/* Footer total — sobre o conjunto filtrado inteiro */}
          <div className="flex flex-col items-start justify-between gap-2 px-4 py-3 sm:flex-row sm:items-center"
            style={{ backgroundColor: "var(--dm-bg-elevated)", borderTop: "1px solid var(--dm-border-subtle)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
              Total ({sampledRows.length} registros)
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
              <span style={{ color: "var(--dm-text-tertiary)" }}>
                Ganhos: <span className="font-bold" style={{ color: "#34D399" }}>
                  +{fmtNum(sampledRows.reduce((s, r) => s + r.dailyFollowersGained, 0))}
                </span>
              </span>
              <span style={{ color: "var(--dm-text-tertiary)" }}>
                Perdas: <span className="font-bold" style={{ color: "#EE5D50" }}>
                  -{fmtNum(sampledRows.reduce((s, r) => s + (r.dailyUnfollows ?? 0), 0))}
                </span>
              </span>
              <span style={{ color: "var(--dm-text-tertiary)" }}>
                Alcance: <span className="font-bold" style={{ color: "var(--dm-text-primary)" }}>
                  {fmtNum(sampledRows.reduce((s, r) => s + r.reach, 0))}
                </span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
