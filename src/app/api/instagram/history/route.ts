import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase não configurado.");
  return createClient(url, key);
}

export interface IGHistoryPoint {
  date: string;
  followersCount: number;
  followingCount: number;
  mediaCount: number;
  dailyFollowersGained: number;
  dailyUnfollows: number;
  profileViews: number;
  reach: number;
  impressions: number;
  engagementRate: number;
}

export interface IGTrackedAccount {
  id: string;
  instagramBusinessAccountId: string;
  username: string;
  name: string;
  biography: string;
  profilePictureUrl: string | null;
  followersCount: number;
  followsCount: number;
  mediaCount: number;
  isVerified: boolean;
  engagementRate: number;
  isFavorite: boolean;
  groupId: string | null;
  updatedAt: string;
}

/**
 * GET /api/instagram/history
 *
 * Returns daily history snapshots for a tracked Instagram account.
 * Optionally filters by date range.
 *
 * Query params:
 *   accountId  — Supabase UUID from instagram_accounts (required)
 *   dateFrom   — YYYY-MM-DD (optional, default: 30 days ago)
 *   dateTo     — YYYY-MM-DD (optional, default: today)
 *
 * Returns: { account: IGTrackedAccount; history: IGHistoryPoint[] }
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const accountId = searchParams.get("accountId");

  if (!accountId) {
    return NextResponse.json({ error: "accountId é obrigatório." }, { status: 400 });
  }

  const today = new Date().toISOString().split("T")[0]!;
  const defaultFrom = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0]!;
  const dateFrom = searchParams.get("dateFrom") ?? defaultFrom;
  const dateTo   = searchParams.get("dateTo")   ?? today;

  const sb = supabase();

  const [accountResult, historyResult] = await Promise.all([
    sb
      .from("instagram_accounts")
      .select("id, instagram_business_account_id, username, name, biography, profile_picture_url, followers_count, follows_count, media_count, is_verified, engagement_rate, is_favorite, group_id, updated_at")
      .eq("id", accountId)
      .single(),
    sb
      .from("instagram_account_history")
      .select("date, followers_count, following_count, media_count, daily_followers_gained, daily_unfollows, profile_views, reach, impressions, engagement_rate")
      .eq("account_id", accountId)
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .order("date", { ascending: true }),
  ]);

  if (accountResult.error || !accountResult.data) {
    return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
  }

  const raw = accountResult.data as Record<string, unknown>;
  const account: IGTrackedAccount = {
    id:                         raw.id as string,
    instagramBusinessAccountId: raw.instagram_business_account_id as string,
    username:                   raw.username as string,
    name:                       raw.name as string,
    biography:                  raw.biography as string,
    profilePictureUrl:          raw.profile_picture_url as string | null,
    followersCount:             Number(raw.followers_count),
    followsCount:               Number(raw.follows_count),
    mediaCount:                 Number(raw.media_count),
    isVerified:                 Boolean(raw.is_verified),
    engagementRate:             Number(raw.engagement_rate),
    isFavorite:                 Boolean(raw.is_favorite),
    groupId:                    raw.group_id as string | null,
    updatedAt:                  raw.updated_at as string,
  };

  const history: IGHistoryPoint[] = (historyResult.data ?? []).map((r: Record<string, unknown>) => ({
    date:                 r.date as string,
    followersCount:       Number(r.followers_count),
    followingCount:       Number(r.following_count),
    mediaCount:           Number(r.media_count),
    dailyFollowersGained: Number(r.daily_followers_gained),
    dailyUnfollows:       Number(r.daily_unfollows),
    profileViews:         Number(r.profile_views),
    reach:                Number(r.reach),
    impressions:          Number(r.impressions),
    engagementRate:       Number(r.engagement_rate),
  }));

  return NextResponse.json({ account, history });
}

/**
 * GET /api/instagram/history/accounts
 * Lists all tracked accounts (summary, no history).
 */
export async function POST(request: NextRequest) {
  // POST = list all accounts (avoids cluttering URL with complex params)
  void request;
  const sb = supabase();
  const { data, error } = await sb
    .from("instagram_accounts")
    .select("id, instagram_business_account_id, username, name, profile_picture_url, followers_count, follows_count, media_count, is_verified, engagement_rate, is_favorite, group_id, updated_at")
    .order("followers_count", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Count history rows per account
  const accountIds = (data ?? []).map((r: Record<string, unknown>) => r.id as string);
  const historyCounts = new Map<string, number>();
  if (accountIds.length > 0) {
    const { data: histData } = await sb
      .from("instagram_account_history")
      .select("account_id")
      .in("account_id", accountIds);
    for (const row of (histData ?? []) as Array<{ account_id: string }>) {
      historyCounts.set(row.account_id, (historyCounts.get(row.account_id) ?? 0) + 1);
    }
  }

  const accounts = (data ?? []).map((raw: Record<string, unknown>) => ({
    id:                         raw.id as string,
    instagramBusinessAccountId: raw.instagram_business_account_id as string,
    username:                   raw.username as string,
    name:                       raw.name as string,
    biography:                  "",
    profilePictureUrl:          raw.profile_picture_url as string | null,
    followersCount:             Number(raw.followers_count),
    followsCount:               Number(raw.follows_count),
    mediaCount:                 Number(raw.media_count),
    isVerified:                 Boolean(raw.is_verified),
    engagementRate:             Number(raw.engagement_rate),
    isFavorite:                 Boolean(raw.is_favorite),
    groupId:                    raw.group_id as string | null,
    updatedAt:                  raw.updated_at as string,
    historyDays:                historyCounts.get(raw.id as string) ?? 0,
  }));

  return NextResponse.json(accounts);
}
