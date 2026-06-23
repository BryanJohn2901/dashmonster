-- ============================================================
-- DashMonster — limpeza: manter só "compras reais" em events_log
-- ============================================================
-- Decisão do usuário (2026-06-23): de todos os eventos de COMPRA, manter
-- apenas venda única (cartão/pix/boleto à vista, ou parcela 1 de boleto) E a
-- 1ª cobrança REAL de uma assinatura/contrato. Renovação, parcela 2+ e
-- assinatura capturada tarde (1ª cobrança recebida já é "13 de 18") são
-- descartadas. O webhook já passou a NÃO gravar mais essas (ver
-- src/app/api/eduzz/webhook/route.ts) — esta migration limpa o HISTÓRICO que
-- já estava no banco antes da mudança.
--
-- O QUE APAGA (events_log):
--   1. event_name = 'Renewal'      -> renovação de assinatura
--   2. event_name = 'Installment'  -> parcela 2+ de boleto
--   3. event_name = 'Purchase' com installment_number > 1 -> assinatura cuja
--      1ª cobrança capturada já não era a nº 1 (contrato capturado tarde)
--
-- NÃO TOCA: Lead/PageView (eventos do pixel) nem Purchase com
-- installment_number 1/NULL (as compras que ficam). Filtra por event_name, então
-- é seguro mesmo que algum dia exista Purchase de outra origem que não Eduzz.
--
-- ATENÇÃO: IRREVERSÍVEL. Faça backup/snapshot antes se quiser poder voltar.
--
-- LIMITAÇÃO CONHECIDA (campaign_metrics): a receita recorrente que essas
-- renovações somaram no passado em `campaign_metrics` (agregado, não é
-- events_log) NÃO é desfeita por esta migration — recompor esse agregado é
-- outra operação, à parte. Daqui pra frente, renovação não soma mais receita
-- (webhook já não chama recordRenewal). Se quiser zerar o histórico de
-- `campaign_metrics` também, peça um script separado.

DELETE FROM public.events_log
WHERE event_name IN ('Renewal', 'Installment')
   OR (event_name = 'Purchase' AND COALESCE(installment_number, 1) > 1);
