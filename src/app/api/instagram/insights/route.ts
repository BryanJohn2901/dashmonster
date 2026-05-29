import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decryptToken } from "@/lib/crypto";
import { META_API_VERSION, daysAgoStr as daysAgo, todayStr, toUnix } from "@/lib/meta";

export const runtime = "nodejs";

type SeriesPoint = { x: number; y: number };

/**
 * GET /api/instagram/insights
 *  ?igUserId=xxx&accessToken=EAAxxxx&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
 *
 * Returns full Instagram profile analytics:
 *   - followers, media count, engagement rate, avg likes/comments
 *   - growth today / week / month (from daily follower_count series)
 *   - impressions, reach, profile views (sum over period)
 *   - followersSeriesData for chart [{x: timestamp_ms, y: count}]
 *   - score { value: 0-100, label }
 *
 * NOTE: follows_and_unfollows is fetched in a SEPARATE optional call so a
 * permission error (#100 — Advanced required) never blocks the main metrics.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  let accessToken = searchParams.get("accessToken");
  const igUserId  = searchParams.get("igUserId");

  if (!igUserId) {
    return NextResponse.json({ error: "igUserId é obrigatório." }, { status: 400 });
  }

  // Pós-OAuth o cliente não tem token: resolve o token cifrado guardado no banco.
  if (!accessToken) {
    try {
      const sb = supabaseAdmin();
      const { data } = await sb
        .from("instagram_accounts")
        .select("access_token")
        .eq("instagram_business_account_id", igUserId)
        .maybeSingle();
      if (data?.access_token) accessToken = decryptToken(data.access_token as string);
    } catch { /* segue para o erro abaixo */ }
  }

  if (!accessToken) {
    return NextResponse.json(
      { error: "Conta não conectada (sem token). Reconecte o Instagram." },
      { status: 401 },
    );
  }

  const dateFrom = searchParams.get("dateFrom") ?? daysAgo(30);
  const dateTo   = searchParams.get("dateTo")   ?? todayStr();
  const since    = toUnix(dateFrom);
  // 'until' is exclusive in Meta API — add 1 day to include dateTo
  const until    = toUnix(dateTo) + 86400;

  const insightsParams = new URLSearchParams({
    access_token: accessToken,
    period: "day",
    since: String(since),
    until: String(until),
  });

  // ── 1. Parallel fetches ─────────────────────────────────────────────────────
  const [profileRes, insightsRes, followsRes, mediaRes] = await Promise.all([
    // Profile: followers + media count
    fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${igUserId}?` +
      new URLSearchParams({
        access_token: accessToken,
        fields: "followers_count,media_count,name,username,biography,website",
      }),
    ),
    // Daily insights — basic metrics (always available with instagram_manage_insights)
    fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${igUserId}/insights?` +
      new URLSearchParams({
        ...Object.fromEntries(insightsParams),
        metric: "impressions,reach,profile_views,follower_count",
      }),
    ),
    // follows_and_unfollows — Advanced permission only; silently ignored on failure
    fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${igUserId}/insights?` +
      new URLSearchParams({
        ...Object.fromEntries(insightsParams),
        metric: "follows_and_unfollows",
      }),
    ).catch(() => null),
    // Recent media for engagement calculation (last 20 posts)
    fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${igUserId}/media?` +
      new URLSearchParams({
        access_token: accessToken,
        fields: "like_count,comments_count,media_type,timestamp",
        limit: "20",
      }),
    ),
  ]);

  // ── 2. Parse profile ────────────────────────────────────────────────────────
  const profileJson = await profileRes.json() as {
    followers_count?: number;
    media_count?: number;
    name?: string;
    username?: string;
    biography?: string;
    website?: string;
    error?: { message?: string };
  };
  if (!profileRes.ok || profileJson.error) {
    return NextResponse.json(
      { error: profileJson.error?.message ?? "Erro ao buscar perfil Instagram." },
      { status: 502 },
    );
  }

  // ── 3. Parse insights ───────────────────────────────────────────────────────
  const insightsJson = await insightsRes.json() as {
    data?: Array<{ name: string; values: Array<{ value: number; end_time: string }> }>;
    error?: { message?: string };
  };
  if (!insightsRes.ok || insightsJson.error) {
    return NextResponse.json(
      { error: insightsJson.error?.message ?? "Erro ao buscar insights Instagram." },
      { status: 502 },
    );
  }

  const insightsData = insightsJson.data ?? [];

  // Parse follows_and_unfollows (optional — Advanced permission)
  let followsData: Array<{ name: string; values: Array<{ value: unknown; end_time: string }> }> = [];
  if (followsRes && followsRes.ok) {
    const followsJson = await followsRes.json() as {
      data?: typeof followsData;
      error?: { message?: string };
    };
    if (!followsJson.error) followsData = followsJson.data ?? [];
  }

  const sum = (name: string) =>
    insightsData.find((d) => d.name === name)?.values
      .reduce((acc, v) => acc + (v.value ?? 0), 0) ?? 0;

  // Daily follower deltas — prefer follows_and_unfollows (net), fallback to follower_count
  const rawFollows = followsData.find((d) => d.name === "follows_and_unfollows");
  const followerValues: Array<{ value: number; end_time: string }> = rawFollows
    ? rawFollows.values.map((v) => {
        const val = typeof v.value === "object" && v.value !== null
          ? ((v.value as { follows?: number; unfollows?: number }).follows ?? 0)
            - ((v.value as { follows?: number; unfollows?: number }).unfollows ?? 0)
          : Number(v.value);
        return { value: val, end_time: v.end_time };
      })
    : (insightsData.find((d) => d.name === "follower_count")?.values ?? []);

  // Build followers series data for chart: cumulative from current count going back
  const followersNow = profileJson.followers_count ?? 0;
  const followersSeriesData: SeriesPoint[] = [];
  let running = followersNow;
  const reversed = [...followerValues].reverse();
  for (const v of reversed) {
    followersSeriesData.unshift({
      x: new Date(v.end_time).getTime(),
      y: Math.max(0, running),
    });
    running -= v.value;
  }

  // Growth stats from the series
  const followerDeltas = followerValues.map((v) => v.value);
  const growthToday = followerDeltas[followerDeltas.length - 1] ?? 0;
  const growthWeek  = followerDeltas.slice(-7).reduce((a, b) => a + b, 0);
  const growthMonth = followerDeltas.reduce((a, b) => a + b, 0); // full period

  // ── 4. Parse media (engagement) ─────────────────────────────────────────────
  const mediaJson = await mediaRes.json() as {
    data?: Array<{
      like_count?: number;
      comments_count?: number;
      media_type?: string;
      timestamp?: string;
    }>;
    error?: { message?: string };
  };

  const mediaPosts = (mediaJson.data ?? []).filter(
    (p) => p.media_type !== "VIDEO" || (p.like_count ?? 0) > 0
  );

  const avgLikes    = mediaPosts.length > 0
    ? Math.round(mediaPosts.reduce((s, p) => s + (p.like_count ?? 0), 0) / mediaPosts.length)
    : 0;
  const avgComments = mediaPosts.length > 0
    ? Math.round(mediaPosts.reduce((s, p) => s + (p.comments_count ?? 0), 0) / mediaPosts.length)
    : 0;

  const engagementRate = followersNow > 0
    ? parseFloat((((avgLikes + avgComments) / followersNow) * 100).toFixed(2))
    : 0;

  // ── 5. Score ────────────────────────────────────────────────────────────────
  let scoreValue = 0;
  if      (engagementRate >= 6)  scoreValue = 85 + Math.min(15, engagementRate - 6);
  else if (engagementRate >= 3)  scoreValue = 60 + ((engagementRate - 3) / 3) * 25;
  else if (engagementRate >= 1)  scoreValue = 30 + ((engagementRate - 1) / 2) * 30;
  else                           scoreValue = Math.max(0, engagementRate * 30);

  if (growthWeek > 0) scoreValue = Math.min(100, scoreValue + 5);
  if (growthWeek < 0) scoreValue = Math.max(0,   scoreValue - 5);

  const scoreRounded = Math.round(scoreValue);
  const scoreLabel   =
    scoreRounded >= 85 ? "Excelente" :
    scoreRounded >= 60 ? "Bom"       :
    scoreRounded >= 30 ? "Regular"   : "Fraco";

  return NextResponse.json({
    // Profile
    followersCount:    followersNow,
    mediaCount:        profileJson.media_count ?? 0,
    // Engagement
    engagementRate,
    avgLikes,
    avgComments,
    // Growth
    followersGrowthToday: growthToday,
    followersGrowthWeek:  growthWeek,
    followersGrowthMonth: growthMonth,
    followerGrowth:       growthMonth, // backwards compat
    // Aggregated insights
    impressionsTotal:  sum("impressions"),
    reachTotal:        sum("reach"),
    profileViewsTotal: sum("profile_views"),
    // Chart data
    followersSeriesData,
    // Score
    score: { value: scoreRounded, label: scoreLabel },
    // Indicates whether Advanced metrics are available
    hasAdvancedInsights: rawFollows !== undefined,
  });
}
