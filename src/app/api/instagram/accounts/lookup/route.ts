import { NextRequest, NextResponse } from "next/server";

const META_API_VERSION = "v21.0";

/**
 * GET /api/instagram/accounts/lookup?username=xxx&accessToken=EAAxxxx
 *
 * Finds the Instagram Business Account ID for a given @username by scanning
 * all Facebook Pages accessible via the provided token.
 *
 * Returns: { id, username, name, followersCount, profilePictureUrl } | 404
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

  const url = `https://graph.facebook.com/${META_API_VERSION}/me/accounts?${new URLSearchParams({
    access_token: accessToken,
    fields: "id,name,instagram_business_account{id,name,username,followers_count,profile_picture_url,biography}",
    limit: "200",
  })}`;

  const res = await fetch(url);
  const json = await res.json() as {
    data?: Array<{
      id: string;
      name: string;
      instagram_business_account?: {
        id: string;
        name?: string;
        username?: string;
        followers_count?: number;
        profile_picture_url?: string;
        biography?: string;
      };
    }>;
    error?: { message?: string };
  };

  if (!res.ok || json.error) {
    return NextResponse.json(
      { error: json.error?.message ?? `Meta API error ${res.status}` },
      { status: 502 },
    );
  }

  const match = (json.data ?? []).find(
    (page) => page.instagram_business_account?.username?.toLowerCase() === username,
  );

  if (!match?.instagram_business_account) {
    return NextResponse.json(
      { error: `Conta @${username} não encontrada nos tokens conectados.` },
      { status: 404 },
    );
  }

  const ig = match.instagram_business_account;
  return NextResponse.json({
    id:                ig.id,
    username:          ig.username ?? username,
    name:              ig.name ?? match.name,
    followersCount:    ig.followers_count ?? 0,
    profilePictureUrl: ig.profile_picture_url,
    biography:         ig.biography ?? "",
  });
}
