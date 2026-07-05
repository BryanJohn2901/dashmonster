import { type NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/trackingAuth";

// ─── POST /api/auth/login-event ────────────────────────────────────────────────
// Grava 1 evento de login do usuário autenticado, com IP, user-agent e a
// geolocalização que o edge já entrega de graça (headers x-vercel-ip-*).
// Chamado 1x por sessão pelo client (page.tsx) logo após autenticar.

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  const h = request.headers;
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    null;

  let body: { email?: string; timezone?: string } = {};
  try { body = await request.json(); } catch { /* corpo opcional */ }

  const { error } = await auth.db.from("login_events").insert({
    user_id: auth.userId,
    email: (body.email ?? "").slice(0, 200) || "desconhecido",
    ip,
    user_agent: h.get("user-agent")?.slice(0, 400) ?? null,
    city: h.get("x-vercel-ip-city") ? decodeURIComponent(h.get("x-vercel-ip-city")!) : null,
    region: h.get("x-vercel-ip-country-region"),
    country: h.get("x-vercel-ip-country"),
    // timezone do browser é mais confiável que o do edge quando presente
    timezone: (body.timezone ?? h.get("x-vercel-ip-timezone") ?? "").slice(0, 80) || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
