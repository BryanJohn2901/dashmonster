import type { AppsScriptResponse, PerpetualDashboardData } from "@/types/perpetuo";

export async function fetchPerpetualData(produto?: string): Promise<PerpetualDashboardData> {
  const params = new URLSearchParams();
  if (produto) {
    params.set("resource", "produto");
    params.set("produto", produto);
  }

  const url = `/api/perpetuo${params.size > 0 ? `?${params}` : ""}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Erro ${res.status}`);
  }

  const json = (await res.json()) as AppsScriptResponse;
  // Apps Script wraps response in { status, timestamp, data }
  return json.data ?? (json as unknown as PerpetualDashboardData);
}

export async function healthCheckAppsScript(): Promise<boolean> {
  try {
    const res = await fetch("/api/perpetuo?resource=health", { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}
