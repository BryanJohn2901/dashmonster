import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const META_API_VERSION = "v21.0";
const CRON_SECRET = process.env.CRON_SECRET;

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

interface IGAccount {
  id: string;
  instagram_business_account_id: string;
  access_token: string;
  followers_count: number;
  follows_count: number;
  media_count: number;
}

async function syncAccount(sb: ReturnType<typeof supabase>, account: IGAccount): Promise<{
  accountId: string;
  success: boolean;
  error?: string;
}> {
  const { id: accountId, instagram_business_account_id: ibaId, access_token: accessToken } = account;
  const today = todayStr();
  const since = toUnix(today);

  try {
    const [profileRes, insightsRes] = await Promise.all([
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
          until: String(since + 86400),
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
      return { accountId, success: false, error: profileJson.error?.message ?? "Meta API error" };
    }

    const followersNow = profileJson.followers_count ?? account.followers_count;
    const followsNow   = profileJson.follows_count   ?? account.follows_count;
    const mediaNow     = profileJson.media_count      ?? account.media_count;

    const insightsJson = await insightsRes.json() as {
      data?: Array<{ name: string; values: Array<{ value: number }> }>;
    };
    const insightsData = insightsJson.data ?? [];
    const firstVal = (metric: string) =>
      insightsData.find((d) => d.name === metric)?.values[0]?.value ?? 0;

    await sb
      .from("instagram_account_history")
      .upsert(
        {
          account_id:             accountId,
          date:                   today,
          followers_count:        followersNow,
          following_count:        followsNow,
          media_count:            mediaNow,
          daily_followers_gained: firstVal("follower_count"),
          profile_views:          firstVal("profile_views"),
          reach:                  firstVal("reach"),
          impressions:            firstVal("impressions"),
          engagement_rate:        0,
        },
        { onConflict: "account_id,date" },
      );

    await sb
      .from("instagram_accounts")
      .update({ followers_count: followersNow, follows_count: followsNow, media_count: mediaNow, updated_at: new Date().toISOString() })
      .eq("id", accountId);

    return { accountId, success: true };
  } catch (e) {
    return { accountId, success: false, error: String(e) };
  }
}

/**
 * POST /api/instagram/accounts/sync-all
 *
 * Syncs all tracked Instagram accounts using stored access_tokens.
 * Intended for daily cron execution via Vercel Cron or external scheduler.
 *
 * Protected by CRON_SECRET env var when set.
 * Returns: { synced, failed, results[] }
 */
export async function POST(request: NextRequest) {
  if (CRON_SECRET) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const sb = supabase();

  const { data: accounts, error: loadErr } = await sb
    .from("instagram_accounts")
    .select("id, instagram_business_account_id, access_token, followers_count, follows_count, media_count");

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ synced: 0, failed: 0, results: [] });
  }

  const results = await Promise.all(
    (accounts as IGAccount[]).map((acc) => syncAccount(sb, acc)),
  );

  const synced = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return NextResponse.json({ synced, failed, results });
}

// Also support GET for simple cron triggers (e.g., Vercel Cron, UptimeRobot)
export async function GET(request: NextRequest) {
  return POST(request);
}
