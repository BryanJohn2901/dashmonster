import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/trackingAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { encryptToken } from "@/lib/crypto";
import { META_API_VERSION, daysAgoStr as daysAgo, todayStr, toUnix } from "@/lib/meta";

export const runtime = "nodejs";

/**
 * POST /api/instagram/accounts/register
 *
 * Registers an Instagram Business Account for tracking and backfills the
 * last 30 days of daily history into `instagram_account_history`.
 *
 * Body: { instagramBusinessAccountId: string; accessToken: string }
 *
 * Returns: { account: IGAccount; daysBackfilled: number }
 */
export async function POST(request: NextRequest) {
  let body: { instagramBusinessAccountId?: string; accessToken?: string; companyId?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  // Fecha + escopa: usuário com acesso de escrita à empresa; a conta IG nasce
  // com company_id (antes gravava sem empresa, virando registro órfão).
  const auth = await requireCompanyAccess(request, { companyId: body.companyId, write: true });
  if (!auth.ok) return auth.response;

  const { instagramBusinessAccountId: ibaId, accessToken } = body;
  if (!ibaId || !accessToken) {
    return NextResponse.json(
      { error: "instagramBusinessAccountId e accessToken são obrigatórios." },
      { status: 400 },
    );
  }

  // ── 1. Fetch current profile from Meta ──────────────────────────────────────
  const [profileRes, insightsRes] = await Promise.all([
    fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${ibaId}?` +
      new URLSearchParams({
        access_token: accessToken,
        fields: "id,username,name,biography,profile_picture_url,followers_count,follows_count,media_count",
      }),
    ),
    fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${ibaId}/insights?` +
      new URLSearchParams({
        access_token: accessToken,
        metric: "reach,impressions",
        period: "day",
        since: String(toUnix(daysAgo(30))),
        until: String(toUnix(todayStr()) + 86400),
      }),
    ),
  ]);

  const profileJson = await profileRes.json() as {
    id?: string;
    username?: string;
    name?: string;
    biography?: string;
    profile_picture_url?: string;
    followers_count?: number;
    follows_count?: number;
    media_count?: number;
    is_verified?: boolean;
    error?: { message?: string };
  };

  if (!profileRes.ok || profileJson.error) {
    return NextResponse.json(
      { error: profileJson.error?.message ?? "Erro ao buscar perfil no Meta." },
      { status: 502 },
    );
  }

  // ── 2. Upsert into instagram_accounts ───────────────────────────────────────
  const sb = supabaseAdmin();

  const { data: accountData, error: accountError } = await sb
    .from("instagram_accounts")
    .upsert(
      {
        instagram_business_account_id: ibaId,
        username:           profileJson.username   ?? "",
        name:               profileJson.name        ?? "",
        biography:          profileJson.biography   ?? "",
        profile_picture_url: profileJson.profile_picture_url ?? null,
        followers_count:    profileJson.followers_count ?? 0,
        follows_count:      profileJson.follows_count   ?? 0,
        media_count:        profileJson.media_count     ?? 0,
        is_verified:        false,
        engagement_rate:    0,
        access_token:       encryptToken(accessToken),
        connection_status:  "active",
        company_id:         auth.companyId,
        updated_at:         new Date().toISOString(),
      },
      { onConflict: "instagram_business_account_id" },
    )
    .select("id, username, name, followers_count")
    .single();

  if (accountError || !accountData) {
    return NextResponse.json(
      { error: `Erro ao salvar conta: ${accountError?.message ?? "desconhecido"}` },
      { status: 500 },
    );
  }

  const accountId = (accountData as { id: string }).id;

  // ── 3. Parse insights and build history rows ─────────────────────────────────
  const insightsJson = await insightsRes.json() as {
    data?: Array<{ name: string; values: Array<{ value: number; end_time: string }> }>;
    error?: { message?: string };
  };

  if (insightsJson.error) {
    console.warn("[IG register] insights error:", insightsJson.error.message);
  }
  const insightsData = insightsJson.error ? [] : (insightsJson.data ?? []);

  const byName = (metric: string) =>
    insightsData.find((d) => d.name === metric)?.values ?? [];

  // follows_and_unfollows returns { follows, unfollows } per day
  type FollowsVal = { follows?: number; unfollows?: number };
  const rawFollowsArr = insightsData.find((d) => d.name === "follows_and_unfollows")?.values ?? [];
  const followsGainedArr: Array<{ value: number; end_time: string }> = rawFollowsArr.map((v) => ({
    value: typeof v.value === "object" ? ((v.value as FollowsVal).follows ?? 0) : (v.value as number),
    end_time: v.end_time,
  }));
  const followsLostArr: Array<{ value: number; end_time: string }> = rawFollowsArr.map((v) => ({
    value: typeof v.value === "object" ? ((v.value as FollowsVal).unfollows ?? 0) : 0,
    end_time: v.end_time,
  }));

  const reachArr       = byName("reach");
  const impressionsArr = byName("impressions");
  const profileViewsArr = byName("profile_visits").length ? byName("profile_visits") : byName("profile_views");

  // Reconstruct absolute followers going backwards from current count
  const followersNow = profileJson.followers_count ?? 0;
  const followsNow   = profileJson.follows_count   ?? 0;
  const mediaNow     = profileJson.media_count      ?? 0;

  // Build a date-keyed map for each metric
  const toMap = (arr: Array<{ value: number; end_time: string }>) =>
    new Map(arr.map((v) => [v.end_time.split("T")[0]!, v.value]));

  const gainsMap        = toMap(followsGainedArr);
  const lossMap         = toMap(followsLostArr);
  const profileViewsMap = toMap(profileViewsArr);
  const reachMap        = toMap(reachArr);
  const impressionsMap  = toMap(impressionsArr);

  // Collect all dates present in any metric
  const allDates = new Set([
    ...gainsMap.keys(),
    ...profileViewsMap.keys(),
    ...reachMap.keys(),
    ...impressionsMap.keys(),
  ]);

  // If no history from API, insert at least today's snapshot
  if (allDates.size === 0) {
    allDates.add(new Date().toISOString().split("T")[0]!);
  }

  const historyRows = Array.from(allDates).map((date) => ({
    account_id:             accountId,
    date,
    followers_count:        followersNow,
    following_count:        followsNow,
    media_count:            mediaNow,
    daily_followers_gained: gainsMap.get(date)         ?? 0,
    daily_unfollows:        lossMap.get(date)           ?? 0,
    profile_views:          profileViewsMap.get(date)   ?? 0,
    reach:                  reachMap.get(date)          ?? 0,
    impressions:            impressionsMap.get(date)    ?? 0,
    engagement_rate:        0,
  }));

  let daysBackfilled = 0;
  if (historyRows.length > 0) {
    const { error: histError } = await sb
      .from("instagram_account_history")
      .upsert(historyRows, { onConflict: "account_id,date" });

    if (histError) {
      // Don't fail the whole request — account is registered, history is best-effort
      console.error("Backfill error:", histError.message);
    } else {
      daysBackfilled = historyRows.length;
    }
  }

  // Diagnostic: log what insights returned
  const insightsDiag = {
    hasError: Boolean(insightsJson.error),
    errorMsg: insightsJson.error?.message ?? null,
    metricsFound: insightsData.map(d => `${d.name}(${d.values?.length ?? 0}pts)`),
    totalRows: historyRows.length,
  };
  console.log("[IG register] insights diag:", JSON.stringify(insightsDiag));

  return NextResponse.json({
    account: {
      id:             accountId,
      username:       (accountData as { username: string }).username,
      name:           (accountData as { name: string }).name,
      followersCount: (accountData as { followers_count: number }).followers_count,
    },
    daysBackfilled,
    _diag: insightsDiag,
  });
}
