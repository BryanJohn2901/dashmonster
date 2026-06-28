import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type CompanyRole = "owner" | "manager" | "viewer";

let authClient: SupabaseClient | null = null;

function getAuthClient(): SupabaseClient {
  if (authClient) return authClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase auth nao configurado.");
  }
  authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return authClient;
}

export function bearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function authError(status: 401 | 403, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export async function requireAuth(request: NextRequest): Promise<
  | { ok: true; userId: string; db: ReturnType<typeof supabaseAdmin> }
  | { ok: false; response: NextResponse }
> {
  const token = bearerToken(request);
  if (!token) return { ok: false, response: authError(401, "Nao autenticado.") };

  const { data, error } = await getAuthClient().auth.getUser(token);
  if (error || !data.user) {
    return { ok: false, response: authError(401, "Sessao invalida.") };
  }

  return { ok: true, userId: data.user.id, db: supabaseAdmin() };
}

export async function requireCompanyAccess(
  request: NextRequest,
  input: { companyId?: string | null; companySlug?: string | null; write?: boolean },
): Promise<
  | { ok: true; userId: string; companyId: string; role: CompanyRole; db: ReturnType<typeof supabaseAdmin> }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth;

  let companyId = input.companyId?.trim() || null;
  if (!companyId && input.companySlug?.trim()) {
    const companyRes = await auth.db
      .from("companies")
      .select("id")
      .eq("slug", input.companySlug.trim())
      .maybeSingle();
    if (companyRes.error || !companyRes.data) {
      return { ok: false, response: authError(403, "Empresa nao encontrada ou sem acesso.") };
    }
    companyId = companyRes.data.id as string;
  }
  if (!companyId) return { ok: false, response: authError(403, "Empresa obrigatoria.") };

  const memberRes = await auth.db
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", auth.userId)
    .maybeSingle();

  const role = memberRes.data?.role as CompanyRole | undefined;
  const hasAccess = !memberRes.error && (role === "owner" || role === "manager" || role === "viewer");
  if (!hasAccess) {
    const adminRes = await auth.db
      .from("app_admins")
      .select("user_id")
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (!adminRes.error && adminRes.data) {
      return { ok: true, userId: auth.userId, companyId, role: "owner", db: auth.db };
    }
  }
  if (!hasAccess || !role) {
    return { ok: false, response: authError(403, "Sem acesso a esta empresa.") };
  }
  if (input.write && role !== "owner" && role !== "manager") {
    return { ok: false, response: authError(403, "Sem permissao para editar esta empresa.") };
  }

  return { ok: true, userId: auth.userId, companyId, role, db: auth.db };
}
