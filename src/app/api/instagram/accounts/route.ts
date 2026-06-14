import { NextRequest, NextResponse } from "next/server";
import { discoverInstagramAccounts } from "@/lib/instagramDiscovery";

export const runtime = "nodejs";

export interface InstagramAccount {
  id: string;
  name: string;
  username: string;
  followersCount: number;
  profilePictureUrl?: string;
}

/**
 * GET /api/instagram/accounts?accessToken=EAAxxxx
 *
 * Lista as contas IG Business acessíveis pelo token. Cobre o modelo de agência
 * (Business Manager asset sharing): páginas atribuídas + próprias do business +
 * páginas de cliente compartilhadas — ver lib/instagramDiscovery.
 */
export async function GET(request: NextRequest) {
  const accessToken = request.nextUrl.searchParams.get("accessToken");

  if (!accessToken) {
    return NextResponse.json({ error: "accessToken é obrigatório." }, { status: 400 });
  }

  const { accounts, warnings } = await discoverInstagramAccounts(accessToken);

  // Se nada foi descoberto E houve erro, propaga como falha real.
  if (accounts.length === 0 && warnings.length > 0) {
    return NextResponse.json(
      { error: warnings.join(" · ") },
      { status: 502 },
    );
  }

  if (warnings.length > 0) {
    console.warn("[IG accounts] avisos de descoberta:", warnings.join(" · "));
  }

  const result: InstagramAccount[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    username: a.username,
    followersCount: a.followersCount,
    profilePictureUrl: a.profilePictureUrl,
  }));

  return NextResponse.json(result);
}
