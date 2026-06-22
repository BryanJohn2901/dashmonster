import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { syncCompany } from "@/lib/eduzzSync";

export const runtime = "nodejs";

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * POST (ou GET) /api/eduzz/sync-all
 * Sincroniza todas as empresas conectadas via OAuth Eduzz. Disparado pela
 * Vercel Cron a cada 6h — o webhook continua sendo o caminho rápido, isso
 * é só a rede de segurança pras lacunas documentadas em CLAUDE.md.
 * Protegido por CRON_SECRET, mesmo padrão de instagram/accounts/sync-all.
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth && CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const { data: connections, error } = await sb
    .from("eduzz_oauth_connections")
    .select("company_id, access_token, last_synced_at")
    .eq("status", "connected");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!connections || connections.length === 0) {
    return NextResponse.json({ synced: 0, results: [] });
  }

  const results = await Promise.all(
    connections.map(async (connection) => {
      await syncCompany(sb, connection as { company_id: string; access_token: string; last_synced_at: string | null });
      return connection.company_id as string;
    }),
  );

  console.log(`[eduzz sync-all] synced=${results.length}`);
  return NextResponse.json({ synced: results.length, results });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
