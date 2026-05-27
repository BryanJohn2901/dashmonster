import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { IGHistoryPoint } from "@/app/api/instagram/history/route";

const META_API_VERSION = "v21.0";

function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase não configurado.");
  return createClient(url, key);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0]!;
}
function todayStr(): string {
  return new Date().toISOString().split("T")[0]!;
}
function toUnix(dateStr: string): number {
  return Math.floor(new Date(dateStr).getTime() / 1000);
}

type MetricValue = number | { follows?: number; unfollows?: number };
type InsightsData = Array<{
  name: string;
  values: Array<{ value: MetricValue; end_time: string }>;
}>;

/**
 * GET /api/instagram/accounts/live-history?ibaId={instagram_business_account_id}
 *
 * Returns last 30 days of daily Instagram data fetched LIVE from Meta API.
 * Reads the stored access_token from Supabase so no token is needed in the URL.
 * Used by PerfilAtivoPanel when Supabase history is sparse (< 7 days).
 *
 * Returns: { history: IGHistoryPoint[]; followersCount: number }
 */
export async function GET(request: NextRequest) {
  const ibaId = request.nextUrl.searchParams.get("ibaId");
  if (!ibaId) {
    return NextResponse.json({ error: "ibaId é obrigatório." }, { status: 400 });
  }

  // ── 1. Fetch stored account + token from Supabase ───────────────────────────
  const sb = supabase();
  const { data: accountRow, error: accountErr } = await sb
    .from("instagram_accounts")
    .select("id, access_token, followers_count, follows_count, media_count")
    .eq("instagram_business_account_id", ibaId)
    .single();

  if (accountErr || !accountRow) {
    return NextResponse.json({ error: "Conta não encontrada no Supabase." }, { status: 404 });
  }

  const acc = accountRow as {
    id: string;
    access_token: string;
    followers_count: number;
    follows_count: number;
    media_count: number;
  };

  // ── 1b. Quick token validation ───────────────────────────────────────────────
  const validateRes = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${ibaId}?` +
    new URLSearchParams({ access_token: acc.access_token, fields: "id,followers_count" }),
  );
  const validateJson = await validateRes.json() as { id?: string; error?: { message?: string; code?: number } };
  if (!validateRes.ok || validateJson.error) {
    console.warn("[live-history] token invalid:", validateJson.error?.message);
    return NextResponse.json({
      error:       "Token inválido ou sem permissão",
      tokenError:  validateJson.error?.message ?? "Token rejeitado pela Meta API",
      history:     [],
      _diag:       { tokenValid: false, tokenError: validateJson.error?.message ?? null },
    }, { status: 401 });
  }

  const since = toUnix(daysAgo(30));
  const until = toUnix(todayStr()) + 86400;

  // ── 2. Two independent Meta API calls (Promise.allSettled) ──────────────────
  // Call A: follows_and_unfollows (may fail for small accounts / limited permissions)
  // Call B: reach,impressions,profile_visits (standard business metrics)
  const [followsResult, metricsResult] = await Promise.allSettled([
    fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${ibaId}/insights?` +
      new URLSearchParams({
        access_token: acc.access_token,
        metric:       "follows_and_unfollows",
        period:       "day",
        since:        String(since),
        until:        String(until),
      }),
    ).then(r => r.json() as Promise<{ data?: InsightsData; error?: { message?: string } }>),
    fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${ibaId}/insights?` +
      new URLSearchParams({
        access_token: acc.access_token,
        metric:       "reach,impressions,profile_views",
        period:       "day",
        since:        String(since),
        until:        String(until),
      }),
    ).then(r => r.json() as Promise<{ data?: InsightsData; error?: { message?: string } }>),
  ]);

  const followsData: InsightsData = followsResult.status === "fulfilled" && !followsResult.value.error
    ? (followsResult.value.data ?? [])
    : [];
  const metricsData: InsightsData = metricsResult.status === "fulfilled" && !metricsResult.value.error
    ? (metricsResult.value.data ?? [])
    : [];

  // Log diagnostics
  const diag = {
    tokenValid:     true,
    followsStatus:  followsResult.status,
    followsError:   followsResult.status === "fulfilled" ? (followsResult.value.error?.message ?? null) : String((followsResult as PromiseRejectedResult).reason),
    metricsStatus:  metricsResult.status,
    metricsError:   metricsResult.status === "fulfilled" ? (metricsResult.value.error?.message ?? null) : String((metricsResult as PromiseRejectedResult).reason),
    followsMetrics: followsData.map(d => `${d.name}(${d.values?.length ?? 0}pts)`),
    otherMetrics:   metricsData.map(d => `${d.name}(${d.values?.length ?? 0}pts)`),
    // Per-metric point counts for UI display
    metricPts: {
      follows_and_unfollows: followsData.find(d => d.name === "follows_and_unfollows")?.values?.length ?? 0,
      reach:                 metricsData.find(d => d.name === "reach")?.values?.length ?? 0,
      impressions:           metricsData.find(d => d.name === "impressions")?.values?.length ?? 0,
      profile_views:         metricsData.find(d => d.name === "profile_views")?.values?.length ?? 0,
    },
  };
  console.log("[live-history] diag:", JSON.stringify(diag));

  // ── 3. Build per-date maps ───────────────────────────────────────────────────
  type Arr = Array<{ value: number; end_time: string }>;

  const toMap = (arr: Arr) =>
    new Map(arr.map(v => [v.end_time.split("T")[0]!, v.value]));

  // Parse follows_and_unfollows → two arrays
  type FollowsVal = { follows?: number; unfollows?: number };
  const rawFollows = followsData.find(d => d.name === "follows_and_unfollows")?.values ?? [];
  const gainsArr: Arr = rawFollows.map(v => ({
    value:    typeof v.value === "object" ? ((v.value as FollowsVal).follows    ?? 0) : (v.value as number),
    end_time: v.end_time,
  }));
  const lossArr: Arr = rawFollows.map(v => ({
    value:    typeof v.value === "object" ? ((v.value as FollowsVal).unfollows  ?? 0) : 0,
    end_time: v.end_time,
  }));

  const byName = (src: InsightsData, name: string): Arr =>
    (src.find(d => d.name === name)?.values ?? []).map(v => ({
      value: v.value as number, end_time: v.end_time,
    }));

  const reachArr        = byName(metricsData, "reach");
  const impressionsArr  = byName(metricsData, "impressions");
  const profileViewsArr = byName(metricsData, "profile_views");

  const gainsMap       = toMap(gainsArr);
  const lossMap        = toMap(lossArr);
  const reachMap       = toMap(reachArr);
  const impressionsMap = toMap(impressionsArr);
  const viewsMap       = toMap(profileViewsArr);

  // Collect all dates across all metrics
  const allDates = new Set([
    ...gainsMap.keys(),
    ...reachMap.keys(),
    ...impressionsMap.keys(),
    ...viewsMap.keys(),
  ]);

  // Ensure at least today is present
  allDates.add(todayStr());

  // ── 4. Reconstruct absolute follower count per day ───────────────────────────
  // Reconstruct backwards from current followers_count using daily net gains
  const sortedDates = Array.from(allDates).sort();
  const followersNow = acc.followers_count;
  const followsNow   = acc.follows_count;
  const mediaNow     = acc.media_count;

  // Walk backwards: followers[today] = followersNow, followers[day-1] = followers[day] - net[day]
  const followersByDate = new Map<string, number>();
  let running = followersNow;
  for (let i = sortedDates.length - 1; i >= 0; i--) {
    const date = sortedDates[i]!;
    followersByDate.set(date, Math.max(0, running));
    const net = (gainsMap.get(date) ?? 0) - (lossMap.get(date) ?? 0);
    running -= net;
  }

  // ── 5. Build IGHistoryPoint[] ────────────────────────────────────────────────
  const history: IGHistoryPoint[] = sortedDates.map(date => ({
    date,
    followersCount:       followersByDate.get(date) ?? followersNow,
    followingCount:       followsNow,
    mediaCount:           mediaNow,
    dailyFollowersGained: gainsMap.get(date)   ?? 0,
    dailyUnfollows:       lossMap.get(date)    ?? 0,
    profileViews:         viewsMap.get(date)   ?? 0,
    reach:                reachMap.get(date)   ?? 0,
    impressions:          impressionsMap.get(date) ?? 0,
    engagementRate:       0,
  }));

  return NextResponse.json({
    history,
    followersCount: followersNow,
    _diag: diag,
  });
}
