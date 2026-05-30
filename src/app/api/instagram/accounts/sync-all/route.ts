import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decryptToken } from "@/lib/crypto";
import { todayStr, toUnix } from "@/lib/meta";
import {
  fetchProfile, fetchDailyInsights, fetchFollowsBreakdown, fetchEngagement, IGTokenError,
} from "@/lib/instagramMetrics";

export const runtime = "nodejs";

const CRON_SECRET = process.env.CRON_SECRET;

interface IGAccountRow {
  id: string;
  instagram_business_account_id: string;
  access_token: string;
  followers_count: number;
  follows_count: number;
  media_count: number;
}

async function syncAccount(
  sb: ReturnType<typeof supabaseAdmin>,
  account: IGAccountRow,
): Promise<{ accountId: string; success: boolean; error?: string }> {
  const { id: accountId, instagram_business_account_id: ibaId } = account;
  const today = todayStr();
  const since = toUnix(today);
  const until = since + 86400;

  let token: string;
  try {
    token = decryptToken(account.access_token);
  } catch (e) {
    return { accountId, success: false, error: `Token ilegível: ${String(e)}` };
  }

  try {
    const profile = await fetchProfile(ibaId, token);

    const [insights, follows, engagement] = await Promise.all([
      fetchDailyInsights(ibaId, token, since, until),
      fetchFollowsBreakdown(ibaId, token, since, until),
      fetchEngagement(ibaId, token, profile.followersCount),
    ]);

    const todayPoint = insights.find((p) => p.date === today) ?? insights[insights.length - 1];

    // Ganho/perda do dia: usa follows_and_unfollows se disponível; senão delta de seguidores
    const fu = follows.byDate.get(today);
    let dailyGained = fu ? fu.follows : (todayPoint?.followerCountDelta ?? 0);
    let dailyUnfollows = fu ? fu.unfollows : 0;

    if (!fu) {
      // Fallback: delta entre snapshot de hoje e o último histórico salvo
      const { data: lastRow } = await sb
        .from("instagram_account_history")
        .select("followers_count")
        .eq("account_id", accountId)
        .lt("date", today)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      const prev = lastRow ? Number((lastRow as { followers_count: number }).followers_count) : null;
      if (prev !== null) {
        const net = profile.followersCount - prev;
        dailyGained   = net > 0 ? net : 0;
        dailyUnfollows = net < 0 ? -net : 0;
      }
    }

    const { error: histErr } = await sb
      .from("instagram_account_history")
      .upsert(
        {
          account_id:             accountId,
          date:                   today,
          followers_count:        profile.followersCount,
          following_count:        profile.followsCount,
          media_count:            profile.mediaCount,
          daily_followers_gained: dailyGained,
          daily_unfollows:        dailyUnfollows,
          profile_views:          todayPoint?.profileViews ?? 0,
          reach:                  todayPoint?.reach         ?? 0,
          impressions:            todayPoint?.impressions   ?? 0,
          engagement_rate:        engagement.engagementRate,
        },
        { onConflict: "account_id,date" },
      );
    if (histErr) return { accountId, success: false, error: histErr.message };

    await sb
      .from("instagram_accounts")
      .update({
        followers_count:   profile.followersCount,
        follows_count:     profile.followsCount,
        media_count:       profile.mediaCount,
        engagement_rate:   engagement.engagementRate,
        connection_status: "active",
        updated_at:        new Date().toISOString(),
      })
      .eq("id", accountId);

    return { accountId, success: true };
  } catch (e) {
    if (e instanceof IGTokenError) {
      // Marca a conta para a UI pedir reconexão — não derruba o cron inteiro
      await sb
        .from("instagram_accounts")
        .update({ connection_status: "expired", updated_at: new Date().toISOString() })
        .eq("id", accountId);
      return { accountId, success: false, error: `token: ${e.message}` };
    }
    return { accountId, success: false, error: String(e) };
  }
}

/**
 * POST (ou GET) /api/instagram/accounts/sync-all
 * Sincroniza todas as contas rastreadas. Disparado pela Vercel Cron diária.
 * Protegido por CRON_SECRET ("Authorization: Bearer <CRON_SECRET>").
 */
export async function POST(request: NextRequest) {
  // A Vercel Cron envia "Authorization: Bearer <CRON_SECRET>". Quando há header,
  // ele precisa bater. Disparo manual pela UI (sem header) é permitido — assim
  // como /refresh, que também sincroniza dados públicos do próprio painel.
  const auth = request.headers.get("authorization");
  if (auth && CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const sb = supabaseAdmin();

  const { data: accounts, error: loadErr } = await sb
    .from("instagram_accounts")
    .select("id, instagram_business_account_id, access_token, followers_count, follows_count, media_count");

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ synced: 0, failed: 0, results: [] });
  }

  const results = await Promise.all(
    (accounts as IGAccountRow[]).map((acc) => syncAccount(sb, acc)),
  );

  const synced = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  console.log(`[IG sync-all] synced=${synced} failed=${failed}`);

  return NextResponse.json({ synced, failed, results });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
