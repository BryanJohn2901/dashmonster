-- ============================================================
-- DashMonster — qualidade de evento Meta: dedup, fbp/fbc, test mode
-- Execute no Supabase SQL Editor (após a 035). Idempotente.
--
-- meta_test_event_code: código opcional do Events Manager → aba "Eventos
-- de teste". Quando preenchido, todo evento enviado à CAPI dessa empresa
-- inclui `test_event_code` no payload, aparecendo em tempo real na aba de
-- teste (sem isso, não dá pra validar dedup Pixel+CAPI pelo Events Manager).
-- Deve ser removido depois do teste (best practice da própria Meta).
-- ============================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS meta_test_event_code TEXT;

-- event_id: o mesmo ID que o pixel.js manda pro fbq('track', ..., {eventID})
-- no navegador E pro nosso /track-event — é a chave que a Meta usa pra
-- deduplicar Pixel (browser) + Conversions API (server) como 1 evento só.
-- Guardamos aqui também só pra dar visibilidade no nosso próprio dashboard
-- (cross-check manual com a aba "Diagnóstico"/"Eventos de teste" da Meta).
ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS event_id TEXT;

-- Manager também pode setar/limpar o código de teste (mesma régua de
-- permissão das outras 3 colunas de tracking — migration 035).
CREATE OR REPLACE FUNCTION public.check_companies_update_scope()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  allowed_keys TEXT[] := ARRAY['meta_pixel_id', 'meta_capi_token', 'dominio_autorizado', 'meta_test_event_code'];
  old_j JSONB;
  new_j JSONB;
  key TEXT;
BEGIN
  IF public.company_role(NEW.id) = 'owner' THEN
    RETURN NEW;
  END IF;

  IF public.company_role(NEW.id) <> 'manager' THEN
    RAISE EXCEPTION 'Sem permissão pra editar esta empresa.';
  END IF;

  old_j := to_jsonb(OLD);
  new_j := to_jsonb(NEW);
  FOR key IN SELECT jsonb_object_keys(new_j) LOOP
    CONTINUE WHEN key = ANY(allowed_keys);
    IF old_j -> key IS DISTINCT FROM new_j -> key THEN
      RAISE EXCEPTION 'Gestor de tráfego só pode editar as configurações de Tracking (Pixel ID, Token CAPI, domínio autorizado, código de teste).';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
