-- ============================================================
-- DashMonster — confirmação de assinatura por contract_created
-- ============================================================
-- Lógica: quando uma assinatura chega via invoice_paid, só a
-- confirmamos como venda real quando o event contract_created
-- também for recebido (sinal de que é um contrato novo, não uma
-- renovação ou captura tardia).  Se o contract_created não chegar
-- em 24h, a linha é descartada automaticamente.
--
-- Fluxo:
--   invoice_paid chega antes de contract_created
--     → events_log gravada com sale_confirmed = false
--     → NÃO soma campaign_metrics, NÃO vai pra Meta
--   contract_created chega (até 24h depois)
--     → events_log.sale_confirmed = true
--     → soma campaign_metrics + dispara Meta CAPI
--   contract_created não chega em 24h
--     → linha deletada pelo pg_cron (ou no próximo contract_created da empresa)
--
--   invoice_paid chega DEPOIS de contract_created
--     → eduzz_contracts.created_received = true (já setado)
--     → recordSale() confirma direto, comportamento normal
--
-- Sem tocar em: venda única (recurrence_key IS NULL), boleto
-- parcelado, ou qualquer evento de assinatura já confirmado.

-- 1. Flag na ficha do contrato: contract_created foi recebido?
ALTER TABLE public.eduzz_contracts
  ADD COLUMN IF NOT EXISTS created_received BOOLEAN NOT NULL DEFAULT false;

-- 2. Flag na linha da venda: confirmada (true/null) ou aguardando
--    contract_created (false)?  Default true = não quebra linhas antigas.
ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS sale_confirmed BOOLEAN NOT NULL DEFAULT true;

-- Índice pra cleanup/confirmação: busca rápida por contrato + pendente
CREATE INDEX IF NOT EXISTS idx_events_log_pending_subscription
  ON public.events_log (company_id, recurrence_key)
  WHERE sale_confirmed = false;

-- 3. pg_cron — cleanup das linhas pendentes expiradas (>24h).
--    Só roda se o pg_cron estiver disponível (Supabase Pro+).
--    Em Supabase Free, o cleanup é feito de forma lazy em
--    confirmPendingSubscription() no webhook.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.schedule(
      'cleanup-expired-pending-subscriptions',
      '0 * * * *',
      $cron$
        DELETE FROM public.events_log
        WHERE sale_confirmed = false
          AND recurrence_key IS NOT NULL
          AND created_at < NOW() - INTERVAL '24 hours';
      $cron$
    );
  END IF;
END;
$$;
