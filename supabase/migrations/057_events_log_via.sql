-- ============================================================
-- DashMonster — guarda se o evento do pixel chegou via instalação DIRETA ou
-- via o proxy reverso (dm-proxy.php) que o cliente hospeda no próprio domínio
-- pra contornar o cap de 7 dias do Safari/iOS em cookie gravado via JS.
--
-- Por quê: pedido do usuário pra mostrar isso na tabela "Eventos de
-- Tracking" — sem essa coluna não tinha como saber, depois do fato, se um
-- visitante específico foi capturado em modo proxy (cookie 1ª parte, sem o
-- cap de 7 dias) ou direto (sujeito ao cap no Safari).
--
-- `via` é mandado pelo PRÓPRIO pixel.js em todo evento (`PROXY_MODE` já é
-- decidido no servidor, ver pixel.js/route.ts) — nunca null pra evento de
-- pixel novo; fica null pra eventos antigos (antes desta coluna existir) e
-- pra vendas da Eduzz (não passam por aqui, inserção direta em events_log).
--
-- Execute no Supabase SQL Editor. Idempotente.
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS via TEXT;
