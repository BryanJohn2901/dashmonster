// ─── Auth da API pública do CRM (Bearer pf_...) ───────────────────────────────
// Onda 5 do port PipeFlow: tokens gerados em /crm/settings/developers
// (api_tokens.token_hash = sha256 do valor pf_... mostrado uma vez ao usuário).

import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type ApiTokenAuth = {
  companyId: string;
  tokenId: string;
  createdBy: string;
  scopes: string[];
  db: ReturnType<typeof supabaseAdmin>;
};

export async function requireApiToken(
  request: NextRequest,
): Promise<{ ok: true; auth: ApiTokenAuth } | { ok: false; response: NextResponse }> {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(pf_\S+)$/i);
  const token = match?.[1]?.trim();
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "Use Authorization: Bearer pf_..." }, { status: 401 }) };
  }

  const db = supabaseAdmin();
  const tokenHash = await sha256Hex(token);
  const { data, error } = await db
    .from("api_tokens")
    .select("id, company_id, created_by, scopes, revoked_at, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data) return { ok: false, response: NextResponse.json({ error: "Token inválido." }, { status: 401 }) };
  if (data.revoked_at) return { ok: false, response: NextResponse.json({ error: "Token revogado." }, { status: 401 }) };
  if (data.expires_at && new Date(data.expires_at as string) < new Date()) {
    return { ok: false, response: NextResponse.json({ error: "Token expirado." }, { status: 401 }) };
  }

  void db.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id as string).then(() => {});

  return {
    ok: true,
    auth: {
      companyId: data.company_id as string,
      tokenId: data.id as string,
      createdBy: data.created_by as string,
      scopes: (data.scopes as string[]) ?? [],
      db,
    },
  };
}

export function requireScope(scopes: string[], needed: "read" | "write"): NextResponse | null {
  if (!scopes.includes(needed)) {
    return NextResponse.json({ error: `Token sem escopo '${needed}'.` }, { status: 403 });
  }
  return null;
}
