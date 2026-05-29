import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decryptToken } from "@/lib/crypto";
import { todayStr, toUnix } from "@/lib/meta";
import {
  fetchProfile, fetchDailyInsights, fetchFollowsBreakdown, fetchEngagement, IGTokenError,
} from "@/lib/instagramMetrics";

export const runtime = "nodejs";

/**
 * POST /api/instagram/accounts/refresh
 * Body: { accountId: string }
 * Sincroniza imediatamente uma conta (snapshot de hoje). Usa token cifrado
 * guardado no banco; nunca recebe token na requisição.
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

  const sb = supabaseAdmin();

  const { data: account, error: loadErr } = await sb
    .from("instagram_accounts")
    .select("id, instagram_business_account_id, access_token, followers_count")
    .eq("id", accountId)
    .single();

  if (loadErr || !account) {
    return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
  }

  const ibaId = (account as { instagram_business_account_id: string }).instagram_business_account_id;
  let token: string;
  try {
    token = decryptToken((account as { access_token: string }).access_token);
  } catch (e) {
    return NextResponse.json({ error: `Token ilegível: ${String(e)}` }, { status: 500 });
  }

  const today = todayStr();
  const since = toUnix(today);
  const until = since + 86400;

  try {
    const profile = await fetchProfile(ibaId, token);
    const [insights, follows, engagement] = await Promise.all([
      fetchDailyInsights(ibaId, token, since, until),
      fetchFollowsBreakdown(ibaId, token, since, until),
      fetchEngagement(ibaId, token, profile.followersCount),
    ]);

    const todayPoint = insights.find((p) => p.date === today) ?? insights[insights.length - 1];
    const fu = follows.byDate.get(today);
    let dailyGained = fu ? fu.follows : (todayPoint?.followerCountDelta ?? 0);
    let dailyUnfollows = fu ? fu.unfollows : 0;

    if (!fu) {
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
        dailyGained    = net > 0 ? net : 0;
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
    if (histErr) {
      return NextResponse.json({ error: `Erro ao salvar histórico: ${histErr.message}` }, { status: 500 });
    }

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

    return NextResponse.json({
      date:           today,
      followersCount: profile.followersCount,
      dailyGained,
      engagementRate: engagement.engagementRate,
    });
  } catch (e) {
    if (e instanceof IGTokenError) {
      await sb
        .from("instagram_accounts")
        .update({ connection_status: "expired", updated_at: new Date().toISOString() })
        .eq("id", accountId);
      return NextResponse.json(
        { error: "Token expirado — reconecte a conta.", tokenError: true },
        { status: 401 },
      );
    }
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
