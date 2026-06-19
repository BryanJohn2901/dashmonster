-- ============================================================
-- DashMonster — simplifica o mapeamento produto→pixel pra allowlist automática
-- Execute no Supabase SQL Editor (após a 048). Idempotente.
--
-- Mudança de design, ainda na mesma feature da 048 (nunca foi pra produção
-- com usuário real configurando, sem risco de migração de dado):
--
-- 1. `eduzz_parent_id` → `eduzz_product_key`: a coluna agora aceita TANTO
--    productId quanto parentId do item — o usuário cola o que tiver à mão
--    (o productId aparece no relatório/payload, o parentId não aparece em
--    lugar nenhum da própria Eduzz). O webhook testa contra os 2 candidatos
--    de cada venda (ver candidateProductKeys() em eduzz/webhook/route.ts).
--
-- 2. Política manual (`companies.eduzz_unmapped_purchase_action`) removida —
--    substituída por regra automática, sem precisar de uma 2ª escolha do
--    usuário: nenhum produto mapeado = manda tudo (comportamento de sempre);
--    1+ produto mapeado = SÓ esses produtos mandam pra Meta, o resto é
--    ignorado de propósito ("se eu configurar, envia só o que eu configurar",
--    pedido explícito do usuário).
--
-- 3. `events_log.product_item_id` — guarda items[0].productId (paralelo ao
--    product_parent_id da 048), pra alimentar a lista de "produtos detectados"
--    também por productId, já que é o ID que o usuário tem em mãos.
-- ============================================================

ALTER TABLE public.eduzz_product_pixel_map RENAME COLUMN eduzz_parent_id TO eduzz_product_key;

ALTER TABLE public.companies DROP COLUMN IF EXISTS eduzz_unmapped_purchase_action;

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS product_item_id TEXT;
