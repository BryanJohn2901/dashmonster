# Plano: Tracking Pixel Server-Side (MVP) — dashmonster

> **Status**: backend implementado e verificado por teste automatizado; frontend adicionado (seção 7, fora do PRD original) substituindo a página "Leads". Falta só validação manual ponta-a-ponta contra Meta CAPI real e visual da nova tela (seção 5, itens 1/3/6/8) — depende de credenciais locais que não foram compartilhadas com o agente.

## Contexto

PRD pede infra de rastreamento server-side (1 script JS) pra substituir GTM/Stape/VisitorAPI/GA4 em clientes da agência: script único captura form submit, clique WhatsApp e eventos dataLayer, hasheia PII no client, manda pro backend, backend gera fingerprint e repassa pra Meta Conversions API.

Repo `dashmonster` já é dashboard Next.js 16.2 + Supabase multi-tenant (tabela `companies`, RLS madura, `supabaseAdmin()` service-role, padrão de rotas `src/app/api/*`). Decisão: **não** criar stack nova (workspaces/Edge Functions separadas) — reaproveitar infra existente. Resultado: feature nasce integrada ao dashboard atual, sem deploy/infra extra, e pode futuramente virar painel visual reaproveitando `companies`/RLS já prontos (fora do escopo MVP, mas caminho fica aberto).

Decisões de arquitetura (confirmadas com usuário):
1. **Tabela**: estende `companies` (não cria `workspaces` nova) — `meta_pixel_id`, `meta_capi_token`, `dominio_autorizado`.
2. **Backend**: Next.js API route (`src/app/api/tracking/*`), não Supabase Edge Function.
3. **Script pixel.js**: servido via route handler Next.js, mesmo domínio do dashboard.

## 1. Migration — `supabase/migrations/029_tracking_pixel.sql` ✅ feito (rodado no Supabase)

> Renomeada de `028_tracking_pixel.sql` pra `029_` após rebase em `main`, que passou a usar `028_multi_source.sql` pra outra feature (tabela `leads`). Conteúdo idêntico, só o número mudou — o que você já rodou no Supabase SQL Editor continua válido, não precisa rodar de novo.

**A. Estende `companies`** (segue template de `022_company_meta_token.sql`):
```sql
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS meta_pixel_id      TEXT,
  ADD COLUMN IF NOT EXISTS meta_capi_token    TEXT,
  ADD COLUMN IF NOT EXISTS dominio_autorizado TEXT;
```
NULL é válido = "tracking não configurado pro cliente". `dominio_autorizado` guarda 1 hostname por empresa (MVP — multi-domínio fica pra depois).

**B. Nova tabela `events_log`** (modelo: `017_instagram_webhook_events.sql`):
```sql
CREATE TABLE IF NOT EXISTS public.events_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_name     TEXT NOT NULL,            -- Lead | Contact | PageView | Purchase | AddToCart
  fingerprint_id TEXT NOT NULL,
  event_url      TEXT,
  user_data      JSONB NOT NULL DEFAULT '{}',
  capi_status    TEXT NOT NULL DEFAULT 'pending',  -- pending|sent|failed
  capi_error     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_log_company_id  ON public.events_log(company_id);
CREATE INDEX IF NOT EXISTS idx_events_log_created_at  ON public.events_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_log_fingerprint ON public.events_log(fingerprint_id);

ALTER TABLE public.events_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_log_service_role_write" ON public.events_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "events_log_member_select" ON public.events_log
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));
```
`capi_status`/`capi_error` são adição além do PRD literal — quase grátis e tornam verificação/debug de entrega CAPI muito mais fácil (sem eles, único jeito de confirmar é abrir Events Manager). Browser nunca insere direto — sempre via `supabaseAdmin()` na rota.

## 2. Rotas — `src/app/api/tracking/` ✅ feito

### `track-event/route.ts`
Modelo: `instagram/webhook/route.ts` (ingestão de POST externo não confiável) + `meta/leads/route.ts` (convenção de fetch/erro pra Meta Graph).

Payload esperado (POST JSON do pixel.js):
```ts
interface TrackEventPayload {
  client_id: string;     // companies.slug
  event_name: string;    // Lead | Contact | PageView | Purchase | AddToCart
  event_url: string;
  user_data?: { em?: string; ph?: string };  // já hasheado SHA-256 no client
  custom_data?: Record<string, unknown>;     // value/currency etc (Purchase)
}
```

Lógica, em ordem:
1. Parse JSON; 400 se malformado ou faltar `client_id`/`event_name`.
2. Lookup `companies` por `slug = client_id` via `supabaseAdmin()`. 404 se não existir, 400 se `meta_pixel_id`/`meta_capi_token` nulos.
3. Checagem Origin/Referer vs `dominio_autorizado`: extrai hostname, compara. **MVP trade-off**: se Origin ausente (alguns navegadores em modo privado omitem), logar warning e seguir — não bloquear hard, pra não quebrar tracking silenciosamente. Mismatch explícito → 403.
4. Fingerprint: `sha256(ip + "|" + userAgent)`, IP de `x-forwarded-for` (fallback `x-real-ip` → `"unknown"`), `crypto.createHash` Node (rota roda runtime Node, não precisa SubtleCrypto aqui). **Limitação documentada em comentário**: identificador fraco — sem cookie/localStorage, mesmo visitante gera fingerprint diferente entre redes; IPs compartilhados (NAT corporativo/CGNAT mobile) colidem usuários distintos. Aceitável pro MVP, não substitui `fbp`/`fbc` real — flag pra follow-up.
5. Insert em `events_log` via `supabaseAdmin()` (await, não fire-and-forget — precisa do row antes de atualizar `capi_status`).
6. POST server-to-server pra Meta CAPI:
```ts
const capiPayload = {
  data: [{
    event_name: payload.event_name,
    event_time: Math.floor(Date.now() / 1000),
    action_source: "website",
    event_source_url: payload.event_url,
    user_data: { em: payload.user_data?.em, ph: payload.user_data?.ph, client_ip_address: ip, client_user_agent: userAgent },
    custom_data: payload.custom_data ?? {},
  }],
};
// POST https://graph.facebook.com/v19.0/{meta_pixel_id}/events?access_token={meta_capi_token}
```
   Atualiza `capi_status`/`capi_error` conforme resposta. Try/catch — falha de CAPI NUNCA vira 500 pro pixel (pixel sempre recebe 200/204 rápido, form submit do cliente não pode travar esperando Meta).
7. Resposta rápida `{received: true}` 200. Header CORS dinâmico (ver seção CORS).
8. Handler `OPTIONS` pro preflight (browser preflighta por causa do `Content-Type: application/json`).

### `pixel.js/route.ts`
Route handler (não `public/pixel.js` estático) — permite injetar origem da API em runtime e setar cache curto (`Cache-Control: public, max-age=300`, TTL curto porque MVP itera rápido). Retorna `Content-Type: application/javascript; charset=utf-8`, `Access-Control-Allow-Origin: *` (servir o arquivo do script não é sensível — nenhum dado por cliente embutido; só `/track-event` precisa validar origem por empresa).

## 3. Lógica do `pixel.js` ✅ feito

```js
window.Tracker = {
  init(clientId) {
    attachFormListener(clientId);
    attachWhatsAppListener(clientId);
    attachDataLayerInterceptor(clientId);
  }
};
```

- **Form submit**: listener capture-phase (`addEventListener('submit', handler, true)`). `e.preventDefault()`, dispara `setTimeout(() => realSubmit(), 500)` como válvula de escape, escaneia `input[type=email],input[type=tel]`, hasheia cada valor com `crypto.subtle.digest('SHA-256', ...)` → hex, `fetch(trackEventUrl, {method:'POST', keepalive:true, body})`. No resolve do fetch OU no timeout (o que vier primeiro) — `clearTimeout` + submit real via `HTMLFormElement.prototype.submit.call(form)` (evita re-disparar o listener). `WeakSet` de forms em voo evita double-processing.
- **Clique WhatsApp**: listener capture-phase em `click`, checa `e.target.closest('a[href*="whatsapp"]')`. Mesmo padrão: preventDefault, fetch evento "Contact", depois `window.location.href = link.href` no resolve/timeout (300-500ms).
- **dataLayer interceptor**: salva `originalPush`, reassina `window.dataLayer.push` pra capturar `event === 'purchase'`/`item.ecommerce`, normaliza pra `custom_data` (suporta 1 shape documentado — GA4 ecommerce; mapeamento "AI semântico" de outros formatos é explicitamente fora do MVP per PRD).
- IIFE, try/catch interno em cada listener — erro no pixel nunca pode quebrar a página do cliente.
- `crypto.subtle` só funciona em HTTPS (ou localhost) — se indisponível, pula hash e manda evento sem `user_data` em vez de lançar erro. Documentar como requisito de deploy (landing pages do cliente precisam HTTPS).

## 4. CORS ✅ feito

`/track-event` faz `Access-Control-Allow-Origin` dinâmico (ecoa o `Origin` da request, não wildcard) tanto no `OPTIONS` quanto na resposta do `POST` — preflight sempre permite (não dá pra validar domínio sem ver o body), validação real de `dominio_autorizado` acontece na lógica de aplicação dentro do POST handler (passo 3 acima), não na camada CORS do browser. Isso é necessário porque `Access-Control-Allow-Origin` só aceita 1 valor estático ou `*` por resposta — não dá pra expressar "qualquer um dos N domínios de clientes" só com CORS.

## 5. Verificação (fluxo de teste manual, espelha o PRD) ⚠️ parcial

Não foi possível rodar o fluxo manual contra Supabase/Meta real porque o agente não tem (e não deve ter) credenciais de produção. Em vez disso, os passos 4-10 foram cobertos por teste automatizado equivalente em `__tests__/tracking.test.ts` (mock de Supabase + Meta CAPI, 7 casos, todos passando). Status item a item:

1. ⬜ Provisionar empresa de teste via SQL direto — depende de você rodar local:
```sql
UPDATE public.companies
SET meta_pixel_id = '<Pixel ID teste>', meta_capi_token = '<CAPI token teste>', dominio_autorizado = 'localhost'
WHERE slug = '<slug-teste>';
```
2. ✅ Página de teste criada em `public/tracking-test.html` (`<script src="/api/tracking/pixel.js">` + `Tracker.init('<slug>')`, form email/tel, link `wa.me`, botão de purchase).
3. ⬜ `npm run dev` + DevTools Network — depende de você (precisa do `.env.local` com credenciais reais).
4. ✅ (via teste automatizado) Submit do form → `em`/`ph` chegam hasheados, `events_log` recebe `event_name='Lead'`. ⬜ Validação visual real do submit nativo/fallback 500ms no browser — pendente.
5. ✅ (via teste automatizado) Evento `Contact` é gravado corretamente. ⬜ Validação visual do delay de navegação no clique WhatsApp — pendente.
6. ⬜ Teste do `dataLayer.push` no console do browser — pendente (lógica do interceptor não foi exercida automaticamente, só revisada).
7. ✅ (via teste automatizado) Insert em `events_log` com os campos certos confirmado via mock de `supabaseAdmin()`.
8. ⬜ Meta Events Manager / Test Events tab — **não dá pra automatizar, só você pode confirmar contra a Meta real.**
9. ✅ (via teste automatizado) Domínio errado → 403, sem insert. **Bug achado e corrigido nesse processo**: `dominio_autorizado` deve ser hostname puro (ex: `localhost`), sem porta — `new URL(origin).hostname` nunca inclui porta.
10. ✅ (via teste automatizado) Empresa sem `meta_pixel_id` → 400 limpo, sem chamada à Meta CAPI.

## Arquivos críticos
- `supabase/migrations/029_tracking_pixel.sql` (novo)
- `src/app/api/tracking/track-event/route.ts` (novo)
- `src/app/api/tracking/pixel.js/route.ts` (novo)
- `src/components/TrackingEventsView.tsx` (novo, seção 7)
- `__tests__/tracking.test.ts` (novo, cobre `track-event` sem precisar de Supabase real)
- `src/lib/supabaseAdmin.ts` (reaproveitado, sem alteração)
- `src/lib/supabase.ts` / `src/hooks/useCompany.ts` (reaproveitados pelo frontend, sem alteração)
- `src/app/api/instagram/webhook/route.ts` (referência de padrão, não modificado)

## 6. `src/app/api/tracking/CLAUDE.md` (novo) ✅ feito

Documenta, pra próximos agentes que mexerem nessa pasta, as decisões/trade-offs não óbvios do código:
- Fingerprint é fraco por design (IP+UA hash, sem cookie) — não "consertar" virando algo mais robusto sem entender o motivo (PRD MVP, ver seção 2 acima).
- CORS é dinâmico (Origin ecoado) porque `dominio_autorizado` é por empresa — validação real é na lógica da rota, não na camada CORS do browser.
- `meta_capi_token` é distinto de `companies.meta_access_token` (este último é o token de gestão de anúncios já existente, não serve pra CAPI).
- Falha de CAPI nunca pode virar 500 pro pixel — pixel sempre recebe resposta rápida independente do resultado do POST pra Meta.
- Não mexe no `CLAUDE.md` raiz (que só referencia `AGENTS.md`) — este é um arquivo novo, escopado à pasta.
- `dominio_autorizado` guarda só hostname, sem porta (ver seção 5).

## 7. Frontend — `src/components/TrackingEventsView.tsx` (novo, fora do escopo original do PRD) ✅ feito

**Decisão revisada após rebase em `main`**: a ideia original era substituir a página "Leads" por esta view (main estava com `LeadsView` quebrado, sem token Meta). Só que, em paralelo, `main` reescreveu `LeadsView.tsx` num dashboard de leads multi-fonte de verdade (Meta + planilha + Eduzz, tabela `leads` nova via `028_multi_source.sql`) — não estava abandonado. Pra não apagar esse trabalho, a decisão final foi: **Tracking vira aba nova e separada**, "Leads" volta a apontar pro `LeadsView` (versão da `main`).

- `MainTab` ganhou o valor `"tracking"` (`Dashboard.tsx`), com `MAIN_TABS` tendo as duas entradas: `{ id: "leads", ..., icon: UserCheck }` (inalterado) e `{ id: "tracking", label: "Tracking", icon: Radar }` (novo).
- `showRightPanel` e `needsCategory` passaram a excluir `"tracking"` também (mesmo padrão de `"leads"`/`"profiles"`/`"products"`).
- Render: `{mainTab === "leads" && <LeadsView />}` e `{mainTab === "tracking" && <TrackingEventsView />}`, lado a lado.

Funcionalidades da view nova:
- Filtro de data (mesmo padrão visual do `LeadsView`), busca por URL/fingerprint, chips por `event_name`.
- Badge de `capi_status` (enviado/pendente/falhou) com `capi_error` no `title` da linha.
- Aviso quando a empresa ativa não tem `meta_pixel_id` configurado (consulta leve em `companies`).
- Não inclui export CSV próprio (fora de escopo desta rodada — o botão "Exportar CSV" do header global é específico de campanhas, não de `events_log`).
