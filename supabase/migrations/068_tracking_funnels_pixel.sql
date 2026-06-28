-- ============================================================
-- DashMonster — adiciona pixel_id aos funis de campanha
-- Execute no Supabase SQL Editor (após a 067). Idempotente.
--
-- Permite associar um funil a um pixel específico. Na atribuição,
-- eventos de outros pixels são ignorados quando o funil tem pixel_id.
-- NULL = funil se aplica a qualquer pixel da empresa.
-- ============================================================

ALTER TABLE public.tracking_funnels
  ADD COLUMN IF NOT EXISTS pixel_id UUID REFERENCES public.tracking_pixels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tracking_funnels_pixel
  ON public.tracking_funnels(pixel_id)
  WHERE pixel_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ensure_tracking_funnel_pixel_company()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.pixel_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.tracking_pixels tp
    WHERE tp.id = NEW.pixel_id
      AND tp.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'tracking_funnels.pixel_id precisa pertencer a mesma empresa do funil';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tracking_funnels_pixel_company ON public.tracking_funnels;
CREATE TRIGGER trg_tracking_funnels_pixel_company
BEFORE INSERT OR UPDATE OF company_id, pixel_id ON public.tracking_funnels
FOR EACH ROW EXECUTE FUNCTION public.ensure_tracking_funnel_pixel_company();
