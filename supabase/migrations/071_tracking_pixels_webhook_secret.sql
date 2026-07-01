-- Adiciona coluna webhook_secret à tabela tracking_pixels.
-- Armazena um segredo gerado pelo servidor que autentica requisições de
-- webhook externos (Typeform, JotForm, ActiveCampaign, etc.) para o endpoint
-- POST /api/tracking/webhook/{pixelSlug}. Nunca exposto ao browser — só
-- retornado uma única vez na resposta de "generate-webhook-secret".
ALTER TABLE tracking_pixels
  ADD COLUMN IF NOT EXISTS webhook_secret TEXT;
