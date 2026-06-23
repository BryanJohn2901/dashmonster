-- ============================================================
-- DashMonster — assinatura: manter só a 1ª cobrança por contrato
-- ============================================================
-- Complemento da 062. A 062 apagou Renewal/Installment/Purchase(installment>1),
-- mas sobraram cobranças de assinatura que tinham sido gravadas como "Purchase"
-- com installment_number = 1 (ou nulo) PORQUE, no momento da captura, o webhook
-- não tinha como saber que não eram a 1ª cobrança: não existia linha anterior
-- daquele contrato E não havia ficha (contract_created) pra dizer "essa é a 9
-- de 18". Resultado: várias cobranças do MESMO contrato (mesmo recurrence_key)
-- entraram como Purchase separadas, cada uma com o valor de uma cobrança só
-- (ex.: 18x R$279 aparecendo como vários "Compra R$279 · Assinatura").
--
-- Regra do usuário: assinatura/contrato mantém SÓ a 1ª cobrança. Aqui isso
-- vira: por (company_id, recurrence_key), manter a linha Purchase MAIS ANTIGA
-- (created_at; desempate por id) e apagar as demais.
--
-- NÃO TOCA: Purchase de compra ÚNICA (recurrence_key IS NULL — cartão/pix/
-- boleto à vista), Lead/PageView, nem contratos que já têm só 1 linha.
--
-- ATENÇÃO: IRREVERSÍVEL. Rode antes o SELECT de pré-visualização (ver
-- 062/conversa) pra conferir os contratos com COUNT(*) > 1. Faça snapshot se
-- quiser poder voltar.
--
-- Caveat: campaign_metrics (agregado) NÃO é recomputado — mesma limitação da 062.

DELETE FROM public.events_log e
WHERE e.recurrence_key IS NOT NULL
  AND e.event_name = 'Purchase'
  AND EXISTS (
    SELECT 1
    FROM public.events_log earlier
    WHERE earlier.company_id = e.company_id
      AND earlier.recurrence_key = e.recurrence_key
      AND earlier.event_name = 'Purchase'
      AND (
        earlier.created_at < e.created_at
        OR (earlier.created_at = e.created_at AND earlier.id < e.id)
      )
  );
