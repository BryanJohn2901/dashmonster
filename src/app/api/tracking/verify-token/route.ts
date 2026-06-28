import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/trackingAuth";

// Valida se um token da Conversions API realmente autoriza um Pixel ID antes
// de salvar — evita o problema silencioso de um token de OUTRO pixel ser
// aceito (a Meta responde events_received:1 mesmo com token errado, o evento
// é descartado do lado dela). A fonte de verdade é o debug_token: ele lista,
// em granular_scopes[].target_ids, os datasets que o token pode operar.
//
// Roda no servidor (não no navegador) só pra não montar a URL com o token na
// query string no client — o token vem do próprio usuário no body, então não
// há vazamento: a resposta só diz se o token bate com o pixel que ele digitou.

const META_API_VERSION = "v23.0";

type VerifyStatus = "match" | "mismatch" | "invalid" | "unknown" | "skipped";

interface DebugTokenResponse {
  error?: { message?: string };
  data?: {
    is_valid?: boolean;
    granular_scopes?: { scope?: string; target_ids?: string[] }[];
  };
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  let body: { pixelId?: string; token?: string };
  try {
    body = (await request.json()) as { pixelId?: string; token?: string };
  } catch {
    return NextResponse.json({ status: "skipped" as VerifyStatus });
  }

  const pixelId = body.pixelId?.trim();
  const token = body.token?.trim();
  // Sem os dois não há o que validar (pixel sem CAPI é caso válido).
  if (!pixelId || !token) return NextResponse.json({ status: "skipped" as VerifyStatus });

  try {
    const url = `https://graph.facebook.com/${META_API_VERSION}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`;
    // Timeout: sem isso, Meta lenta deixa o botão "Salvar" pendurado no
    // spinner sem fim. 8s e desiste como "unknown" (não bloqueia o save).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    const json = (await res.json()) as DebugTokenResponse;

    // Erro da Graph API (token malformado, app sem permissão de debug etc.) —
    // não dá pra afirmar nem negar, não bloqueia o save (status "unknown").
    if (json.error) return NextResponse.json({ status: "unknown" as VerifyStatus, reason: json.error.message });

    const data = json.data ?? {};
    if (!data.is_valid) return NextResponse.json({ status: "invalid" as VerifyStatus });

    const authorizedIds = new Set<string>();
    let hasAnyTarget = false;
    for (const scope of data.granular_scopes ?? []) {
      for (const id of scope.target_ids ?? []) {
        authorizedIds.add(id);
        hasAnyTarget = true;
      }
    }

    // Token sem restrição de dataset (granular_scopes sem target_ids) — não dá
    // pra provar mismatch, deixa passar como "unknown".
    if (!hasAnyTarget) return NextResponse.json({ status: "unknown" as VerifyStatus, reason: "token sem restrição de dataset" });

    return authorizedIds.has(pixelId)
      ? NextResponse.json({ status: "match" as VerifyStatus })
      : NextResponse.json({ status: "mismatch" as VerifyStatus, authorizedIds: [...authorizedIds] });
  } catch (err) {
    return NextResponse.json({ status: "unknown" as VerifyStatus, reason: err instanceof Error ? err.message : "erro de rede" });
  }
}
