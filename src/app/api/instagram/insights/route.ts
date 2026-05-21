import { NextRequest, NextResponse } from "next/server";

const META_API_VERSION = "v21.0";

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
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const accessToken = searchParams.get("accessToken");
  const igUserId    = searchParams.get("igUserId");

  if (!accessToken || !igUserId) {
    return NextResponse.json(
      { error: "accessToken e igUserId são obrigatórios." },
      { status: 400 },
    );
  }

  const dateFrom = searchParams.get("dateFrom") ?? daysAgo(30);
  const dateTo   = searchParams.get("dateTo")   ?? todayStr();
  const since    = toUnix(dateFrom);
  // 'until' is exclusive in Meta API — add 1 day to include dateTo
  const until    = toUnix(dateTo) + 86400;

  // ── 1. Profile fields (parallel) ───────────────────────────────────────────
  const [profileRes, insightsRes, mediaRes] = await Promise.all([
    // Profile: followers + media count
    fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${igUserId}?` +
      new URLSearchParams({
        access_token: accessToken,
        fields: "followers_count,media_count,name,username,biography,website",
      }),
    ),
    // Daily insights for the period
    fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${igUserId}/insights?` +
      new URLSearchParams({
        access_token: accessToken,
        metric: "impressions,reach,profile_views,follower_count",
        period: "day",
        since: String(since),
        until: String(until),
      }),
    ),
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

  // insights may fail with 400 if account < 100 followers or missing permission
  const insightsData = insightsJson.error ? [] : (insightsJson.data ?? []);

  const sum = (name: string) =>
    insightsData.find((d) => d.name === name)?.values
      .reduce((acc, v) => acc + (v.value ?? 0), 0) ?? 0;

  // Daily follower_count series (values are deltas — daily change)
  const followerValues = insightsData.find((d) => d.name === "follower_count")?.values ?? [];

  // Build followers series data for chart: cumulative from current count going back
  const followersNow = profileJson.followers_count ?? 0;
  // Reconstruct absolute counts from deltas (reverse)
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
  // Based on ER + growth trend (similar to InsTrack scoring logic)
  let scoreValue = 0;
  if      (engagementRate >= 6)  scoreValue = 85 + Math.min(15, engagementRate - 6);
  else if (engagementRate >= 3)  scoreValue = 60 + ((engagementRate - 3) / 3) * 25;
  else if (engagementRate >= 1)  scoreValue = 30 + ((engagementRate - 1) / 2) * 30;
  else                           scoreValue = Math.max(0, engagementRate * 30);

  // Growth bonus: +5 if growing this week, -5 if declining
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
  });
}
