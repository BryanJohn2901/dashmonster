import { createHash, timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/trackingAuth";

// ─── POST /api/admin/activate — vira super admin com a senha mestra ───────────
// A senha mora SÓ no servidor (env SUPER_ADMIN_ACTIVATION_PASSWORD). Acertou →
// o usuário logado entra em app_admins e o is_super_admin() do banco passa a
// valer pra ele em todas as RLS. Sem a env configurada a rota nem funciona.

const sha = (s: string) => createHash("sha256").update(s).digest();

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  const master = process.env.SUPER_ADMIN_ACTIVATION_PASSWORD;
  if (!master || master.length < 12) {
    return NextResponse.json(
      { error: "Ativação desabilitada: defina SUPER_ADMIN_ACTIVATION_PASSWORD (mín. 12 caracteres) no ambiente." },
      { status: 501 },
    );
  }

  let body: { password?: string } = {};
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  // hash dos dois lados → comparação em tempo constante sem vazar tamanho
  if (!body.password || !timingSafeEqual(sha(body.password), sha(master))) {
    return NextResponse.json({ error: "Senha incorreta." }, { status: 403 });
  }

  const { error } = await auth.db
    .from("app_admins")
    .upsert({ user_id: auth.userId }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
