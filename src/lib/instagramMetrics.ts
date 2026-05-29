import { GRAPH_BASE } from "./meta";

// ─── Camada única de chamadas de métricas ao Instagram Graph API ──────────────
// Centraliza parsing + fallbacks para que uma métrica indisponível (ex.:
// `impressions` descontinuada, ou `follows_and_unfollows` sem Advanced Access)
// NUNCA derrube a sincronização inteira.

export interface IGProfile {
  followersCount: number;
  followsCount:   number;
  mediaCount:     number;
  username:       string;
  name:           string;
  biography:      string;
  profilePictureUrl: string | null;
}

export interface IGDailyPoint {
  date:        string; // YYYY-MM-DD
  reach:       number;
  impressions: number;
  profileViews: number;
  followerCountDelta: number; // delta diário relatado pela API (pode ser 0)
}

export interface IGEngagement {
  avgLikes:       number;
  avgComments:    number;
  engagementRate: number; // %
}

export interface IGFollowsBreakdown {
  available: boolean;            // false quando #100 / sem Advanced Access
  byDate: Map<string, { follows: number; unfollows: number }>;
}

export class IGTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IGTokenError";
  }
}

interface GraphError { message?: string; code?: number; type?: string; error_subcode?: number }

function isTokenError(err: GraphError | undefined): boolean {
  if (!err) return false;
  // 190 = invalid/expired token; 102 = session; 463/467 expired
  return err.code === 190 || err.code === 102 || err.code === 463 || err.code === 467;
}

// ─── Perfil ───────────────────────────────────────────────────────────────────

export async function fetchProfile(ibaId: string, token: string): Promise<IGProfile> {
  const res = await fetch(
    `${GRAPH_BASE}/${ibaId}?` +
    new URLSearchParams({
      access_token: token,
      fields: "id,username,name,biography,profile_picture_url,followers_count,follows_count,media_count",
    }),
  );
  const json = await res.json() as Partial<IGProfileRaw> & { error?: GraphError };
  if (!res.ok || json.error) {
    if (isTokenError(json.error)) throw new IGTokenError(json.error?.message ?? "Token inválido/expirado.");
    throw new Error(json.error?.message ?? `Erro ao buscar perfil (${res.status}).`);
  }
  return {
    followersCount:    json.followers_count ?? 0,
    followsCount:      json.follows_count   ?? 0,
    mediaCount:        json.media_count      ?? 0,
    username:          json.username         ?? "",
    name:              json.name             ?? "",
    biography:         json.biography        ?? "",
    profilePictureUrl: json.profile_picture_url ?? null,
  };
}
interface IGProfileRaw {
  followers_count: number; follows_count: number; media_count: number;
  username: string; name: string; biography: string; profile_picture_url: string | null;
}

// ─── Insights diários (reach/impressions/profile_views) ───────────────────────
// `impressions` é opcional: em versões recentes da API pode ser recusada — nesse
// caso seguimos só com reach/profile_views, sem quebrar.

export async function fetchDailyInsights(
  ibaId: string,
  token: string,
  sinceUnix: number,
  untilUnix: number,
): Promise<IGDailyPoint[]> {
  const base = {
    access_token: token,
    period: "day",
    since: String(sinceUnix),
    until: String(untilUnix),
  };

  // Tentativa 1: conjunto completo. Se falhar por impressions, refaz sem ela.
  let data = await tryInsights(ibaId, { ...base, metric: "reach,impressions,profile_views,follower_count" });
  if (!data) {
    data = await tryInsights(ibaId, { ...base, metric: "reach,profile_views,follower_count" });
  }
  if (!data) return [];

  const series = (name: string) =>
    data!.find((d) => d.name === name)?.values ?? [];

  const dateOf = (endTime: string) => endTime.split("T")[0]!;
  const toMap = (vals: Array<{ value: number; end_time: string }>) =>
    new Map(vals.map((v) => [dateOf(v.end_time), Number(v.value) || 0]));

  // profile_views vs profile_visits (drift de nome entre versões)
  const pvVals = series("profile_views").length ? series("profile_views") : series("profile_visits");

  const reachMap   = toMap(series("reach"));
  const imprMap     = toMap(series("impressions"));
  const pvMap       = toMap(pvVals);
  const followerMap = toMap(series("follower_count"));

  const allDates = new Set<string>([
    ...reachMap.keys(), ...imprMap.keys(), ...pvMap.keys(), ...followerMap.keys(),
  ]);

  return Array.from(allDates).sort().map((date) => ({
    date,
    reach:              reachMap.get(date)   ?? 0,
    impressions:        imprMap.get(date)     ?? 0,
    profileViews:       pvMap.get(date)       ?? 0,
    followerCountDelta: followerMap.get(date) ?? 0,
  }));
}

async function tryInsights(
  ibaId: string,
  params: Record<string, string>,
): Promise<Array<{ name: string; values: Array<{ value: number; end_time: string }> }> | null> {
  try {
    const res = await fetch(`${GRAPH_BASE}/${ibaId}/insights?` + new URLSearchParams(params));
    const json = await res.json() as {
      data?: Array<{ name: string; values: Array<{ value: number; end_time: string }> }>;
      error?: GraphError;
    };
    if (!res.ok || json.error) {
      if (isTokenError(json.error)) throw new IGTokenError(json.error?.message ?? "Token inválido/expirado.");
      return null; // métrica indisponível → caller tenta fallback
    }
    return json.data ?? [];
  } catch (e) {
    if (e instanceof IGTokenError) throw e;
    return null;
  }
}

// ─── follows_and_unfollows (Advanced Access — opcional) ────────────────────────

export async function fetchFollowsBreakdown(
  ibaId: string,
  token: string,
  sinceUnix: number,
  untilUnix: number,
): Promise<IGFollowsBreakdown> {
  const empty: IGFollowsBreakdown = { available: false, byDate: new Map() };
  try {
    const res = await fetch(
      `${GRAPH_BASE}/${ibaId}/insights?` +
      new URLSearchParams({
        access_token: token,
        metric: "follows_and_unfollows",
        period: "day",
        since: String(sinceUnix),
        until: String(untilUnix),
      }),
    );
    const json = await res.json() as {
      data?: Array<{ name: string; values: Array<{ value: unknown; end_time: string }> }>;
      error?: GraphError;
    };
    if (!res.ok || json.error) {
      if (isTokenError(json.error)) throw new IGTokenError(json.error?.message ?? "Token inválido/expirado.");
      return empty; // #100 / sem Advanced Access
    }
    const vals = json.data?.find((d) => d.name === "follows_and_unfollows")?.values ?? [];
    const byDate = new Map<string, { follows: number; unfollows: number }>();
    for (const v of vals) {
      const date = v.end_time.split("T")[0]!;
      const obj = typeof v.value === "object" && v.value !== null
        ? v.value as { follows?: number; unfollows?: number }
        : { follows: Number(v.value) || 0, unfollows: 0 };
      byDate.set(date, { follows: obj.follows ?? 0, unfollows: obj.unfollows ?? 0 });
    }
    return { available: byDate.size > 0, byDate };
  } catch (e) {
    if (e instanceof IGTokenError) throw e;
    return empty;
  }
}

// ─── Engajamento (likes/comentários dos últimos posts) ────────────────────────

export async function fetchEngagement(
  ibaId: string,
  token: string,
  followersCount: number,
  limit = 20,
): Promise<IGEngagement> {
  try {
    const res = await fetch(
      `${GRAPH_BASE}/${ibaId}/media?` +
      new URLSearchParams({
        access_token: token,
        fields: "like_count,comments_count,media_type,timestamp",
        limit: String(limit),
      }),
    );
    const json = await res.json() as {
      data?: Array<{ like_count?: number; comments_count?: number; media_type?: string }>;
      error?: GraphError;
    };
    if (!res.ok || json.error) {
      if (isTokenError(json.error)) throw new IGTokenError(json.error?.message ?? "Token inválido/expirado.");
      return { avgLikes: 0, avgComments: 0, engagementRate: 0 };
    }
    const posts = (json.data ?? []).filter((p) => p.media_type !== "VIDEO" || (p.like_count ?? 0) > 0);
    if (posts.length === 0) return { avgLikes: 0, avgComments: 0, engagementRate: 0 };
    const avgLikes    = posts.reduce((s, p) => s + (p.like_count    ?? 0), 0) / posts.length;
    const avgComments = posts.reduce((s, p) => s + (p.comments_count ?? 0), 0) / posts.length;
    const engagementRate = followersCount > 0
      ? parseFloat((((avgLikes + avgComments) / followersCount) * 100).toFixed(4))
      : 0;
    return { avgLikes: Math.round(avgLikes), avgComments: Math.round(avgComments), engagementRate };
  } catch (e) {
    if (e instanceof IGTokenError) throw e;
    return { avgLikes: 0, avgComments: 0, engagementRate: 0 };
  }
}
