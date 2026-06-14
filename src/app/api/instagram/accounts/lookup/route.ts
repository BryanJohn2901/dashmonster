import { NextRequest, NextResponse } from "next/server";
import { discoverInstagramAccounts } from "@/lib/instagramDiscovery";

export const runtime = "nodejs";

/**
 * GET /api/instagram/accounts/lookup?username=xxx&accessToken=EAAxxxx
 *
 * Acha a conta IG Business pelo @username, varrendo tudo que o token enxerga
 * (páginas atribuídas + business owned/client — ver lib/instagramDiscovery).
 *
 * Retorna: { id, username, name, followersCount, profilePictureUrl } | 404
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const accessToken = searchParams.get("accessToken");
  const username    = searchParams.get("username")?.replace(/^@/, "").toLowerCase().trim();

  if (!accessToken || !username) {
    return NextResponse.json(
      { error: "accessToken e username são obrigatórios." },
      { status: 400 },
    );
  }

  const { accounts, warnings } = await discoverInstagramAccounts(accessToken);

  if (accounts.length === 0 && warnings.length > 0) {
    return NextResponse.json({ error: warnings.join(" · ") }, { status: 502 });
  }

  const match = accounts.find((a) => a.username.toLowerCase() === username);

  if (!match) {
    return NextResponse.json(
      { error: `Conta @${username} não encontrada nos tokens conectados.` },
      { status: 404 },
    );
  }

  return NextResponse.json({
    id:                match.id,
    username:          match.username || username,
    name:              match.name,
    followersCount:    match.followersCount,
    profilePictureUrl: match.profilePictureUrl,
    biography:         match.biography ?? "",
  });
}
