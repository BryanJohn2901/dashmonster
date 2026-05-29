import { NextRequest, NextResponse } from "next/server";
import type { PerpetualDashboardData } from "@/types/perpetuo";

export async function GET(req: NextRequest) {
  const baseUrl = process.env.APPS_SCRIPT_URL;
  const apiKey  = process.env.APPS_SCRIPT_API_KEY;

  if (!baseUrl || !apiKey) {
    return NextResponse.json(
      { error: "APPS_SCRIPT_URL ou APPS_SCRIPT_API_KEY não configurados." },
      { status: 500 },
    );
  }

  // Suporte a ?resource=produto&produto=bm para produto específico
  const resource = req.nextUrl.searchParams.get("resource") ?? undefined;
  const produto  = req.nextUrl.searchParams.get("produto")  ?? undefined;

  const params = new URLSearchParams({ api_key: apiKey });
  if (resource) params.set("resource", resource);
  if (produto)  params.set("produto",  produto);

  try {
    const res = await fetch(`${baseUrl}?${params}`, {
      next: { revalidate: 300 }, // cache 5 min
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Apps Script retornou ${res.status}` },
        { status: 502 },
      );
    }

    const data = (await res.json()) as PerpetualDashboardData;
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao chamar Apps Script.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
