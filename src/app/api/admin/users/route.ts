import { type NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/trackingAuth";

// ─── /api/admin/users — gestão de usuários (SÓ super admin) ───────────────────
// GET   ?userId=…  → nome, e-mail, avatar e status de banimento do usuário
// PATCH { userId, name?, email?, avatarUrl?, ban? }
//   ban: "24h" | "168h" | "876000h" (permanente) | "none" (desbanir)
// Usa o client service-role (auth.admin) — RLS não se aplica; por isso o
// gate de super admin é obrigatório aqui.

const BAN_VALUES = new Set(["24h", "168h", "876000h", "none"]);

async function requireSuperAdmin(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth;
  const { data } = await auth.db
    .from("app_admins")
    .select("user_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (!data) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Apenas super admins." }, { status: 403 }),
    };
  }
  return auth;
}

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.ok) return auth.response;

  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId é obrigatório." }, { status: 400 });

  const { data, error } = await auth.db.auth.admin.getUserById(userId);
  if (error || !data.user) {
    return NextResponse.json({ error: error?.message ?? "Usuário não encontrado." }, { status: 404 });
  }
  const u = data.user;
  // banned_until existe no GoTrue mas não no tipo do SDK
  const bannedUntil = (u as unknown as { banned_until?: string | null }).banned_until ?? null;
  return NextResponse.json({
    id: u.id,
    email: u.email ?? "",
    name: String(u.user_metadata?.full_name ?? ""),
    avatarUrl: (u.user_metadata?.avatar_url as string | undefined) ?? null,
    bannedUntil,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.ok) return auth.response;

  let body: { userId?: string; name?: string; email?: string; avatarUrl?: string; ban?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const userId = body.userId;
  if (!userId) return NextResponse.json({ error: "userId é obrigatório." }, { status: 400 });
  if (userId === auth.userId && body.ban && body.ban !== "none") {
    return NextResponse.json({ error: "Você não pode banir a si mesmo." }, { status: 400 });
  }
  if (body.ban && !BAN_VALUES.has(body.ban)) {
    return NextResponse.json({ error: "Valor de ban inválido." }, { status: 400 });
  }

  const attrs: Record<string, unknown> = {};
  const meta: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) meta.full_name = body.name.trim().slice(0, 120);
  if (typeof body.avatarUrl === "string") meta.avatar_url = body.avatarUrl.trim().slice(0, 500) || null;
  if (Object.keys(meta).length > 0) attrs.user_metadata = meta;
  const newEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (newEmail) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail)) {
      return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
    }
    attrs.email = newEmail;
    attrs.email_confirm = true; // troca administrativa: sem fluxo de confirmação
  }
  if (body.ban) attrs.ban_duration = body.ban;

  if (Object.keys(attrs).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  const { error } = await auth.db.auth.admin.updateUserById(userId, attrs);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // company_members.email é desnormalizado — mantém em sincronia na troca.
  if (newEmail) {
    await auth.db.from("company_members").update({ email: newEmail }).eq("user_id", userId);
  }

  return NextResponse.json({ ok: true });
}
