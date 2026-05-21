import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const META_API_VERSION = "v21.0";

function todayStr(): string {
  return new Date().toISOString().split("T")[0]!;
}
function toUnix(dateStr: string): number {
  return Math.floor(new Date(dateStr).getTime() / 1000);
}

function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase não configurado.");
  return createClient(url, key);
}

/**
 * POST /api/instagram/accounts/refresh
 *
 * Forces an immediate sync of a tracked Instagram account.
 * Reads the stored access_token from `instagram_accounts`, fetches today's
 * metrics from Meta, and upserts a row in `instagram_account_history`.
 *
 * Body: { accountId: string }  (Supabase UUID from instagram_accounts)
 *
 * Returns: { date, followersCount, dailyGained }
 */
export async function POST(request: NextRequest) {
  let body: { accountId?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const { accountId } = body;
  if (!accountId) {
    return NextResponse.json({ error: "accountId é obrigatório." }, { status: 400 });
  }

  const sb = supabase();

  // ── 1. Load account + stored token ─────────────────────────────────────────
  const { data: account, error: loadErr } = await sb
    .from("instagram_accounts")
    .select("id, instagram_business_account_id, access_token, followers_count, follows_count, media_count")
    .eq("id", accountId)
    .single();

  if (loadErr || !account) {
    return NextResponse.json(
      { error: "Conta não encontrada." },
      { status: 404 },
    );
  }

  const { instagram_business_account_id: ibaId, access_token: accessToken } = account as {
    instagram_business_account_id: string;
    access_token: string;
    followers_count: number;
    follows_count: number;
    media_count: number;
  };

  const today = todayStr();
  const since = toUnix(today);
  const until = since + 86400;

  // ── 2. Fetch today's data from Meta ────────────────────────────────────────
  const [profileRes, insightsRes, mediaRes] = await Promise.all([
    fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${ibaId}?` +
      new URLSearchParams({
        access_token: accessToken,
        fields: "followers_count,follows_count,media_count",
      }),
    ),
    fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${ibaId}/insights?` +
      new URLSearchParams({
        access_token: accessToken,
        metric: "follower_count,profile_views,reach,impressions",
        period: "day",
        since: String(since),
        until: String(until),
      }),
    ),
    fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${ibaId}/media?` +
      new URLSearchParams({
        access_token: accessToken,
        fields: "like_count,comments_count,media_type",
        limit: "20",
      }),
    ),
  ]);

  const profileJson = await profileRes.json() as {
    followers_count?: number;
    follows_count?: number;
    media_count?: number;
    error?: { message?: string };
  };

  if (!profileRes.ok || profileJson.error) {
    return NextResponse.json(
      { error: profileJson.error?.message ?? "Erro ao buscar perfil." },
      { status: 502 },
    );
  }

  const followersNow = profileJson.followers_count ?? (account as { followers_count: number }).followers_count;
  const followsNow   = profileJson.follows_count   ?? (account as { follows_count: number }).follows_count;
  const mediaNow     = profileJson.media_count      ?? (account as { media_count: number }).media_count;

  // ── 3. Parse insights ───────────────────────────────────────────────────────
  const insightsJson = await insightsRes.json() as {
    data?: Array<{ name: string; values: Array<{ value: number }> }>;
    error?: { message?: string };
  };

  const insightsData = insightsJson.error ? [] : (insightsJson.data ?? []);
  const firstVal = (metric: string) =>
    insightsData.find((d) => d.name === metric)?.values[0]?.value ?? 0;

  const dailyFollowersGained = firstVal("follower_count");
  const profileViews         = firstVal("profile_views");
  const reach                = firstVal("reach");
  const impressions          = firstVal("impressions");

  // ── 4. Compute engagement rate ─────────────────────────────────────────────
  const mediaJson = await mediaRes.json() as {
    data?: Array<{ like_count?: number; comments_count?: number; media_type?: string }>;
  };
  const posts = (mediaJson.data ?? []).filter((p) => p.media_type !== "VIDEO" || (p.like_count ?? 0) > 0);
  const avgLikes    = posts.length > 0 ? posts.reduce((s, p) => s + (p.like_count    ?? 0), 0) / posts.length : 0;
  const avgComments = posts.length > 0 ? posts.reduce((s, p) => s + (p.comments_count ?? 0), 0) / posts.length : 0;
  const engagementRate = followersNow > 0
    ? parseFloat((((avgLikes + avgComments) / followersNow) * 100).toFixed(4))
    : 0;

  // ── 5. Upsert history row ───────────────────────────────────────────────────
  const { error: histErr } = await sb
    .from("instagram_account_history")
    .upsert(
      {
        account_id:             accountId,
        date:                   today,
        followers_count:        followersNow,
        following_count:        followsNow,
        media_count:            mediaNow,
        daily_followers_gained: dailyFollowersGained,
        profile_views:          profileViews,
        reach,
        impressions,
        engagement_rate:        engagementRate,
      },
      { onConflict: "account_id,date" },
    );

  if (histErr) {
    return NextResponse.json(
      { error: `Erro ao salvar histórico: ${histErr.message}` },
      { status: 500 },
    );
  }

  // ── 6. Update account snapshot ─────────────────────────────────────────────
  await sb
    .from("instagram_accounts")
    .update({
      followers_count: followersNow,
      follows_count:   followsNow,
      media_count:     mediaNow,
      engagement_rate: engagementRate,
      updated_at:      new Date().toISOString(),
    })
    .eq("id", accountId);

  return NextResponse.json({
    date:           today,
    followersCount: followersNow,
    dailyGained:    dailyFollowersGained,
    engagementRate,
  });
}
