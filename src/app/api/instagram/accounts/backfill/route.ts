import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const META_API_VERSION = "v21.0";

function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase não configurado.");
  return createClient(url, key);
}

function toUnix(dateStr: string): number {
  return Math.floor(new Date(dateStr).getTime() / 1000);
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0]!;
}
function todayStr(): string {
  return new Date().toISOString().split("T")[0]!;
}

type InsightValue = { value: number; end_time: string };
type InsightsData = Array<{ name: string; values: InsightValue[] }>;

/**
 * POST /api/instagram/accounts/backfill
 * Body: { ibaId: string }
 *
 * Fetches up to 90 days of historical data from Meta API and upserts
 * into instagram_account_history. Run once per account to fill in missing history.
 *
 * Metrics fetched:
 *   - reach, impressions, profile_views  → up to 90 days back
 *   - follower_count (daily delta)        → up to 30 days back
 *
 * Returns: { daysInserted: number; daysUpdated: number; dateRange: [string, string] }
 */
export async function POST(request: NextRequest) {
  let body: { ibaId?: string };
  try {
    body = await request.json() as { ibaId?: string };
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const { ibaId } = body;
  if (!ibaId) {
    return NextResponse.json({ error: "ibaId é obrigatório." }, { status: 400 });
  }

  const sb = supabase();

  // ── 1. Load account + token from Supabase ────────────────────────────────────
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

  // ── 2. Fetch 90 days of metrics in parallel ───────────────────────────────────
  // Meta allows reach/impressions/profile_views up to ~90 days back.
  // follower_count is limited to 30 days.
  const since90 = toUnix(daysAgo(90));
  const since30 = toUnix(daysAgo(30));
  const until   = toUnix(todayStr()) + 86400; // exclusive end = tomorrow

  const baseParams = { access_token: acc.access_token, period: "day" };

  const [metricsRes, followersRes] = await Promise.allSettled([
    fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${ibaId}/insights?` +
      new URLSearchParams({
        ...baseParams,
        metric: "reach,impressions,profile_views",
        since:  String(since90),
        until:  String(until),
      }),
    ).then(r => r.json() as Promise<{ data?: InsightsData; error?: { message?: string } }>),

    fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${ibaId}/insights?` +
      new URLSearchParams({
        ...baseParams,
        metric: "follower_count",
        since:  String(since30),
        until:  String(until),
      }),
    ).then(r => r.json() as Promise<{ data?: InsightsData; error?: { message?: string } }>),
  ]);

  const metricsData: InsightsData =
    metricsRes.status === "fulfilled" && !metricsRes.value.error
      ? (metricsRes.value.data ?? [])
      : [];

  const followersData: InsightsData =
    followersRes.status === "fulfilled" && !followersRes.value.error
      ? (followersRes.value.data ?? [])
      : [];

  if (metricsRes.status === "fulfilled" && metricsRes.value.error) {
    console.warn("[backfill] metrics error:", metricsRes.value.error.message);
  }
  if (followersRes.status === "fulfilled" && followersRes.value.error) {
    console.warn("[backfill] follower_count error:", followersRes.value.error.message);
  }

  // ── 3. Build per-date maps ────────────────────────────────────────────────────
  const byName = (src: InsightsData, name: string) =>
    new Map(
      (src.find(d => d.name === name)?.values ?? []).map(v => [
        v.end_time.split("T")[0]!,
        v.value,
      ]),
    );

  const reachMap       = byName(metricsData, "reach");
  const impressionsMap = byName(metricsData, "impressions");
  const viewsMap       = byName(metricsData, "profile_views");
  const followerMap    = byName(followersData, "follower_count"); // daily delta

  // Union of all dates with any data
  const allDates = new Set([
    ...reachMap.keys(),
    ...impressionsMap.keys(),
    ...viewsMap.keys(),
    ...followerMap.keys(),
  ]);

  // Always include today
  allDates.add(todayStr());

  if (allDates.size === 0) {
    return NextResponse.json({
      error: "Meta API não retornou dados históricos. Verifique as permissões (instagram_manage_insights).",
    }, { status: 502 });
  }

  // ── 4. Reconstruct absolute follower count per day ────────────────────────────
  // Walk backwards from current followers_count using daily deltas.
  // For days beyond 30 (no delta), clamp to earliest known value.
  const sortedDates = Array.from(allDates).sort();
  const followersByDate = new Map<string, number>();
  let running = acc.followers_count;

  for (let i = sortedDates.length - 1; i >= 0; i--) {
    const date = sortedDates[i]!;
    followersByDate.set(date, Math.max(0, running));
    const delta = followerMap.get(date) ?? 0;
    running -= delta;
  }

  // ── 5. Build upsert rows ──────────────────────────────────────────────────────
  const rows = sortedDates.map(date => ({
    account_id:             acc.id,
    date,
    followers_count:        followersByDate.get(date) ?? acc.followers_count,
    following_count:        acc.follows_count,
    media_count:            acc.media_count,
    daily_followers_gained: followerMap.get(date) ?? 0,
    profile_views:          viewsMap.get(date)    ?? 0,
    reach:                  reachMap.get(date)    ?? 0,
    impressions:            impressionsMap.get(date) ?? 0,
    engagement_rate:        0,
  }));

  // ── 6. Upsert into Supabase ───────────────────────────────────────────────────
  const { error: upsertErr } = await sb
    .from("instagram_account_history")
    .upsert(rows, { onConflict: "account_id,date" });

  if (upsertErr) {
    console.error("[backfill] upsert error:", upsertErr.message);
    return NextResponse.json(
      { error: `Erro ao salvar histórico: ${upsertErr.message}` },
      { status: 500 },
    );
  }

  const dateRange: [string, string] = [sortedDates[0]!, sortedDates[sortedDates.length - 1]!];

  console.info(`[backfill] ${rows.length} rows upserted for account ${ibaId} (${dateRange[0]} → ${dateRange[1]})`);

  return NextResponse.json({
    ok:          true,
    daysInserted: rows.length,
    dateRange,
    metricsAvailable: {
      reach:        reachMap.size,
      impressions:  impressionsMap.size,
      profileViews: viewsMap.size,
      followerDelta: followerMap.size,
    },
  });
}
