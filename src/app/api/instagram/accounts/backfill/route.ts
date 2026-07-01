import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/trackingAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decryptToken } from "@/lib/crypto";
import { META_API_VERSION, daysAgoStr as daysAgo, todayStr, toUnix } from "@/lib/meta";

export const runtime = "nodejs";

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
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;
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

  const sb = supabaseAdmin();

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

  // ── 2. Fetch métricas em janelas de ≤30 dias (limite da Graph API) ────────────
  // A API recusa janelas > 30 dias (2592000 s). Buscamos em blocos e mesclamos.
  const since90 = toUnix(daysAgo(90));
  const since30 = toUnix(daysAgo(29)); // 30 dias exatos até amanhã
  const until   = toUnix(todayStr()) + 86400; // exclusive end = tomorrow
  const CHUNK   = 30 * 86400;

  const token = decryptToken(acc.access_token);

  async function fetchMetricMap(metric: string, sinceU: number, untilU: number): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    for (let s = sinceU; s < untilU; s += CHUNK) {
      const u = Math.min(s + CHUNK, untilU);
      try {
        const res = await fetch(
          `https://graph.facebook.com/${META_API_VERSION}/${ibaId}/insights?` +
          new URLSearchParams({ access_token: token, period: "day", metric, since: String(s), until: String(u) }),
        );
        const json = await res.json() as { data?: InsightsData; error?: { message?: string } };
        if (json.error) { console.warn(`[backfill] ${metric} ${s}-${u}:`, json.error.message); continue; }
        const vals = json.data?.find(d => d.name === metric)?.values ?? [];
        for (const v of vals) map.set(v.end_time.split("T")[0]!, v.value);
      } catch (e) {
        console.warn(`[backfill] ${metric} chunk falhou:`, String(e));
      }
    }
    return map;
  }

  const [reachMap, viewsMap, followerMap] = await Promise.all([
    fetchMetricMap("reach",          since90, until),
    fetchMetricMap("profile_views",  since90, until),
    fetchMetricMap("follower_count", since30, until), // delta diário, máx 30 dias
  ]);
  const impressionsMap = new Map<string, number>(); // descontinuada

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
