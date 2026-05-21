const LS_KEY = "pta_instagram_creds_v1";

export interface InstagramCredentials {
  accessToken: string;
}

export interface InstagramAccount {
  id: string;
  name: string;
  username: string;
  followersCount: number;
  profilePictureUrl?: string;
}

export interface InstagramGrowthStats {
  followersGrowthToday: number;
  followersGrowthWeek:  number;
  followersGrowthMonth: number;
}

export interface InstagramSeriesPoint {
  x: number; // timestamp ms
  y: number; // followers count
}

export interface InstagramScore {
  value: number; // 0–100
  label: string; // "Excelente" | "Bom" | "Regular" | "Fraco"
}

export interface InstagramProfileInsights {
  // Profile
  followersCount:    number;
  mediaCount:        number;
  // Engagement
  engagementRate:    number;   // percentage, e.g. 3.24
  avgLikes:          number;
  avgComments:       number;
  // Growth
  followersGrowthToday:  number;
  followersGrowthWeek:   number;
  followersGrowthMonth:  number;
  followerGrowth:        number; // alias for month (backwards compat)
  // Aggregated insights
  impressionsTotal:  number;
  reachTotal:        number;
  profileViewsTotal: number;
  // Chart
  followersSeriesData: InstagramSeriesPoint[];
  // Score
  score: InstagramScore;
}

export function loadInstagramCredentials(): InstagramCredentials {
  if (typeof window === "undefined") return { accessToken: "" };
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}") as InstagramCredentials;
  } catch {
    return { accessToken: "" };
  }
}

export function saveInstagramCredentials(creds: InstagramCredentials): void {
  localStorage.setItem(LS_KEY, JSON.stringify(creds));
}

export async function fetchInstagramAccounts(accessToken: string): Promise<InstagramAccount[]> {
  const res = await fetch(`/api/instagram/accounts?accessToken=${encodeURIComponent(accessToken)}`);
  const json = await res.json() as InstagramAccount[] | { error: string };
  if (!res.ok || "error" in json) {
    throw new Error(("error" in json ? json.error : null) ?? "Erro ao buscar contas Instagram.");
  }
  return json as InstagramAccount[];
}

export async function fetchInstagramInsights(
  igUserId: string,
  accessToken: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<InstagramProfileInsights> {
  const params = new URLSearchParams({ igUserId, accessToken });
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  const res = await fetch(`/api/instagram/insights?${params.toString()}`);
  const json = await res.json() as InstagramProfileInsights | { error: string };
  if (!res.ok || "error" in json) {
    throw new Error(("error" in json ? json.error : null) ?? "Erro ao buscar insights Instagram.");
  }
  return json as InstagramProfileInsights;
}
