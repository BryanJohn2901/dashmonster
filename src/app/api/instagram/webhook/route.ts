import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Instagram Graph API Webhook
 * ─────────────────────────────────────────────────────────────────────────────
 * Configure in Meta Developer → App → Instagram → Configuração da API com
 * login do Instagram → Webhooks:
 *
 *   Callback URL : https://<seu-dominio>/api/instagram/webhook
 *   Verify Token : valor de INSTAGRAM_WEBHOOK_VERIFY_TOKEN no .env
 *
 * Campos sugeridos para assinar:
 *   comments, mentions, story_insights, feed, follows
 *
 * GET  → verificação do endpoint (Meta chama uma vez ao configurar)
 * POST → eventos em tempo real (novos comentários, seguidores, etc.)
 */

const VERIFY_TOKEN = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? "dashmonster_ig_webhook_v1";

// Admin client usa a Service Role key (nunca exposta ao browser)
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Tipos dos payloads Meta ───────────────────────────────────────────────────

interface WebhookChange {
  field: string;
  value: Record<string, unknown>;
}

interface WebhookEntry {
  id: string;          // Instagram Business Account ID
  time: number;        // Unix timestamp
  changes: WebhookChange[];
}

interface WebhookPayload {
  object: string;      // "instagram"
  entry:  WebhookEntry[];
}

// ── GET — verificação do webhook ──────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const sp        = request.nextUrl.searchParams;
  const mode      = sp.get("hub.mode");
  const token     = sp.get("hub.verify_token");
  const challenge = sp.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
    // Responde com o challenge em texto puro — Meta exige isso
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "Token inválido ou parâmetros ausentes." }, { status: 403 });
}

// ── POST — eventos em tempo real ──────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: WebhookPayload;

  try {
    body = await request.json() as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  if (body.object !== "instagram") {
    // Ignorar eventos de outros produtos (WhatsApp, Messenger, etc.)
    return NextResponse.json({ received: true });
  }

  const db = adminClient();

  for (const entry of body.entry ?? []) {
    const igAccountId = entry.id;

    for (const change of entry.changes ?? []) {
      // Persistir evento bruto para auditoria / reprocessamento futuro
      if (db) {
        await db
          .from("instagram_webhook_events")
          .insert({
            ig_account_id: igAccountId,
            field:         change.field,
            payload:       change.value,
            received_at:   new Date(entry.time * 1000).toISOString(),
          })
          .then(({ error }) => {
            if (error) console.error("[webhook] insert error:", error.message);
          });
      }

      // Lógica por tipo de evento
      switch (change.field) {
        case "follows":
        case "followers":
          // Novo seguidor — agendamos um re-sync do perfil
          await triggerProfileSync(igAccountId, db);
          break;

        case "comments":
        case "mentions":
          // Novo comentário ou menção — útil para alertas futuros
          console.info(`[webhook] ${change.field} em conta ${igAccountId}`);
          break;

        case "story_insights":
          // Meta envia métricas finais quando um Story expira
          await handleStoryInsights(igAccountId, change.value, db);
          break;

        case "feed":
          // Nova publicação — podemos buscar dados do post
          console.info(`[webhook] nova publicação em conta ${igAccountId}`);
          break;

        default:
          console.info(`[webhook] campo não tratado: ${change.field}`);
      }
    }
  }

  // Meta exige 200 em até 20s — sempre responder rápido
  return NextResponse.json({ received: true });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Busca o access_token da conta no Supabase e chama o endpoint de sync
 * para atualizar followers_count + inserir ponto no histórico.
 */
async function triggerProfileSync(
  igAccountId: string,
  db: ReturnType<typeof adminClient>,
) {
  if (!db) return;

  const { data: account, error } = await db
    .from("instagram_accounts")
    .select("id, access_token")
    .eq("instagram_business_account_id", igAccountId)
    .single();

  if (error || !account) {
    console.warn(`[webhook] conta ${igAccountId} não encontrada no banco.`);
    return;
  }

  // Chama o endpoint de refresh interno (reutiliza lógica existente)
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    await fetch(`${baseUrl}/api/instagram/accounts/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId:   account.id,
        accessToken: account.access_token,
      }),
    });
    console.info(`[webhook] sync disparado para conta ${igAccountId}`);
  } catch (err) {
    console.error("[webhook] falha ao disparar sync:", err);
  }
}

/**
 * Processa métricas finais de Stories (enviadas quando o story expira).
 * Atualiza ou insere na tabela de histórico diário se as colunas existirem.
 */
async function handleStoryInsights(
  igAccountId: string,
  value: Record<string, unknown>,
  db: ReturnType<typeof adminClient>,
) {
  if (!db) return;

  const impressions = Number(value.impressions ?? 0);
  const reach       = Number(value.reach ?? 0);
  const today       = new Date().toISOString().split("T")[0]!;

  const { data: account } = await db
    .from("instagram_accounts")
    .select("id")
    .eq("instagram_business_account_id", igAccountId)
    .single();

  if (!account) return;

  // Atualiza o ponto de hoje no histórico — upsert por (account_id, date)
  await db
    .from("instagram_account_history")
    .upsert(
      {
        account_id:  account.id,
        date:        today,
        impressions: impressions,
        reach:       reach,
      },
      { onConflict: "account_id,date", ignoreDuplicates: false },
    );

  console.info(`[webhook] story_insights para ${igAccountId}: reach=${reach}, impressions=${impressions}`);
}
