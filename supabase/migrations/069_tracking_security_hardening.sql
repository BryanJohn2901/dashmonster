-- ============================================================
-- DashMonster -- hardening de Tracking
-- Execute apos a 068. Idempotente.
--
-- Objetivos:
--   1) meta_capi_token nao pode ser lido direto pelo client Supabase.
--   2) no maximo 1 pixel default por empresa.
--   3) marcar default em uma unica transacao via RPC.
-- ============================================================

-- Se historicamente mais de um pixel ficou default, preserva o mais antigo.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY company_id ORDER BY created_at ASC, id ASC) AS rn
  FROM public.tracking_pixels
  WHERE is_default
)
UPDATE public.tracking_pixels tp
SET is_default = false
FROM ranked r
WHERE tp.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tracking_pixels_one_default
  ON public.tracking_pixels(company_id)
  WHERE is_default;

-- O app novo usa Route Handlers com service_role para listar/mutar pixels.
-- Authenticated ainda pode ler somente colunas nao secretas quando acessa a
-- tabela diretamente; meta_capi_token deixa de ter privilegio de SELECT.
REVOKE ALL ON public.tracking_pixels FROM anon, authenticated;
GRANT SELECT (
  id,
  company_id,
  slug,
  name,
  meta_pixel_id,
  dominio_autorizado,
  meta_test_event_code,
  is_default,
  created_at
) ON public.tracking_pixels TO authenticated;

CREATE OR REPLACE FUNCTION public.set_default_tracking_pixel(
  p_company_id UUID,
  p_pixel_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_write_company(p_company_id) AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'sem permissao para editar esta empresa';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tracking_pixels
    WHERE id = p_pixel_id
      AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'pixel nao encontrado nesta empresa';
  END IF;

  UPDATE public.tracking_pixels
  SET is_default = false
  WHERE company_id = p_company_id
    AND is_default = true;

  UPDATE public.tracking_pixels
  SET is_default = true
  WHERE id = p_pixel_id
    AND company_id = p_company_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_default_tracking_pixel(UUID, UUID) TO authenticated, service_role;

