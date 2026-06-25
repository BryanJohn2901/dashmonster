# Plano: Tracking Pixel Server-Side (MVP) — dashmonster

> **Status**: backend implementado e verificado por teste automatizado; frontend adicionado (seção 7, fora do PRD original) substituindo a página "Leads". Falta só validação manual ponta-a-ponta contra Meta CAPI real e visual da nova tela (seção 5, itens 1/3/6/8) — depende de credenciais locais que não foram compartilhadas com o agente.

## Contexto

PRD pede infra de rastreamento server-side (1 script JS) pra substituir GTM/Stape/VisitorAPI/GA4 em clientes da agência: script único captura form submit, clique WhatsApp e eventos dataLayer, hasheia PII no client, manda pro backend, backend gera fingerprint e repassa pra Meta Conversions API.

Repo `dashmonster` já é dashboard Next.js 16.2 + Supabase multi-tenant (tabela `companies`, RLS madura, `supabaseAdmin()` service-role, padrão de rotas `src/app/api/*`). Decisão: **não** criar stack nova (workspaces/Edge Functions separadas) — reaproveitar infra existente. Resultado: feature nasce integrada ao dashboard atual, sem deploy/infra extra, e pode futuramente virar painel visual reaproveitando `companies`/RLS já prontos (fora do escopo MVP, mas caminho fica aberto).

Decisões de arquitetura (confirmadas com usuário):
1. **Tabela**: estende `companies` (não cria `workspaces` nova) — `meta_pixel_id`, `meta_capi_token`, `dominio_autorizado`.
2. **Backend**: Next.js API route (`src/app/api/tracking/*`), não Supabase Edge Function.
3. **Script pixel.js**: servido via route handler Next.js, mesmo domínio do dashboard.

## [x] 1. Migration — `supabase/migrations/029_tracking_pixel.sql` (rodado no Supabase)

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

## [x] 2. Rotas — `src/app/api/tracking/`

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

## [x] 3. Lógica do `pixel.js`

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

## [x] 4. CORS

`/track-event` faz `Access-Control-Allow-Origin` dinâmico (ecoa o `Origin` da request, não wildcard) tanto no `OPTIONS` quanto na resposta do `POST` — preflight sempre permite (não dá pra validar domínio sem ver o body), validação real de `dominio_autorizado` acontece na lógica de aplicação dentro do POST handler (passo 3 acima), não na camada CORS do browser. Isso é necessário porque `Access-Control-Allow-Origin` só aceita 1 valor estático ou `*` por resposta — não dá pra expressar "qualquer um dos N domínios de clientes" só com CORS.

## [~] 5. Verificação (fluxo de teste manual, espelha o PRD) parcial

Não foi possível rodar o fluxo manual contra Supabase/Meta real porque o agente não tem (e não deve ter) credenciais de produção. Em vez disso, os passos 4-10 foram cobertos por teste automatizado equivalente em `__tests__/tracking.test.ts` (mock de Supabase + Meta CAPI, 7 casos, todos passando). Status item a item:

1. [ ] Provisionar empresa de teste via SQL direto — depende de você rodar local:
```sql
UPDATE public.companies
SET meta_pixel_id = '<Pixel ID teste>', meta_capi_token = '<CAPI token teste>', dominio_autorizado = 'localhost'
WHERE slug = '<slug-teste>';
```
2. [x] Página de teste criada em `public/tracking-test.html` (`<script src="/api/tracking/pixel.js">` + `Tracker.init('<slug>')`, form email/tel, link `wa.me`, botão de purchase).
3. [ ] `npm run dev` + DevTools Network — depende de você (precisa do `.env.local` com credenciais reais).
4. [x] (via teste automatizado) Submit do form → `em`/`ph` chegam hasheados, `events_log` recebe `event_name='Lead'`. [ ] Validação visual real do submit nativo/fallback 500ms no browser — pendente.
5. [x] (via teste automatizado) Evento `Contact` é gravado corretamente. [ ] Validação visual do delay de navegação no clique WhatsApp — pendente.
6. [ ] Teste do `dataLayer.push` no console do browser — pendente (lógica do interceptor não foi exercida automaticamente, só revisada).
7. [x] (via teste automatizado) Insert em `events_log` com os campos certos confirmado via mock de `supabaseAdmin()`.
8. [ ] Meta Events Manager / Test Events tab — **não dá pra automatizar, só você pode confirmar contra a Meta real.**
9. [x] (via teste automatizado) Domínio errado → 403, sem insert. **Bug achado e corrigido nesse processo**: `dominio_autorizado` deve ser hostname puro (ex: `localhost`), sem porta — `new URL(origin).hostname` nunca inclui porta.
10. [x] (via teste automatizado) Empresa sem `meta_pixel_id` → 400 limpo, sem chamada à Meta CAPI.

## Arquivos críticos
- `supabase/migrations/029_tracking_pixel.sql` (novo)
- `src/app/api/tracking/track-event/route.ts` (novo)
- `src/app/api/tracking/pixel.js/route.ts` (novo)
- `src/components/TrackingEventsView.tsx` (novo, seção 7)
- `__tests__/tracking.test.ts` (novo, cobre `track-event` sem precisar de Supabase real)
- `src/lib/supabaseAdmin.ts` (reaproveitado, sem alteração)
- `src/lib/supabase.ts` / `src/hooks/useCompany.ts` (reaproveitados pelo frontend, sem alteração)
- `src/app/api/instagram/webhook/route.ts` (referência de padrão, não modificado)

## [x] 6. `src/app/api/tracking/CLAUDE.md` (novo)

Documenta, pra próximos agentes que mexerem nessa pasta, as decisões/trade-offs não óbvios do código:
- Fingerprint é fraco por design (IP+UA hash, sem cookie) — não "consertar" virando algo mais robusto sem entender o motivo (PRD MVP, ver seção 2 acima).
- CORS é dinâmico (Origin ecoado) porque `dominio_autorizado` é por empresa — validação real é na lógica da rota, não na camada CORS do browser.
- `meta_capi_token` é distinto de `companies.meta_access_token` (este último é o token de gestão de anúncios já existente, não serve pra CAPI).
- Falha de CAPI nunca pode virar 500 pro pixel — pixel sempre recebe resposta rápida independente do resultado do POST pra Meta.
- Não mexe no `CLAUDE.md` raiz (que só referencia `AGENTS.md`) — este é um arquivo novo, escopado à pasta.
- `dominio_autorizado` guarda só hostname, sem porta (ver seção 5).

## [x] 7. Frontend — `src/components/TrackingEventsView.tsx` (novo, fora do escopo original do PRD)

**Decisão revisada após rebase em `main`**: a ideia original era substituir a página "Leads" por esta view (main estava com `LeadsView` quebrado, sem token Meta). Só que, em paralelo, `main` reescreveu `LeadsView.tsx` num dashboard de leads multi-fonte de verdade (Meta + planilha + Eduzz, tabela `leads` nova via `028_multi_source.sql`) — não estava abandonado. Pra não apagar esse trabalho, a decisão final foi: **Tracking vira aba nova e separada**, "Leads" volta a apontar pro `LeadsView` (versão da `main`).

- `MainTab` ganhou o valor `"tracking"` (`Dashboard.tsx`), com `MAIN_TABS` tendo as duas entradas: `{ id: "leads", ..., icon: UserCheck }` (inalterado) e `{ id: "tracking", label: "Tracking", icon: Radar }` (novo).
- `showRightPanel` e `needsCategory` passaram a excluir `"tracking"` também (mesmo padrão de `"leads"`/`"profiles"`/`"products"`).
- Render: `{mainTab === "leads" && <LeadsView />}` e `{mainTab === "tracking" && <TrackingEventsView />}`, lado a lado.

Funcionalidades da view nova:
- Filtro de data (mesmo padrão visual do `LeadsView`), busca por URL/fingerprint, chips por `event_name`.
- Badge de `capi_status` (enviado/pendente/falhou) com `capi_error` no `title` da linha.
- Aviso quando a empresa ativa não tem `meta_pixel_id` configurado (consulta leve em `companies`).
- Não inclui export CSV próprio (fora de escopo desta rodada — o botão "Exportar CSV" do header global é específico de campanhas, não de `events_log`).

## [x] 8. Settings UI — seção "Tracking Pixel" em `CompanyStudio.tsx`

Faltava como o usuário de fato configura `meta_pixel_id`/`meta_capi_token`/`dominio_autorizado` sem rodar SQL manual — a única forma até aqui. Adicionado seguindo o padrão exato da seção "Conexão Meta" já existente (`ConexaoSection`/`setCompanyToken`):
- `src/hooks/useCompany.ts`: `fetchCompanyTracking(companyId)` / `setCompanyTracking(companyId, config)` — mesmo padrão de `fetchCompanyToken`/`setCompanyToken` (`supabaseClient.from("companies").update(...)`, RLS faz a autorização de owner).
- `src/components/CompanyStudio.tsx`: nova seção `TrackingSection` no Estúdio da Empresa (accordion, gated por `canEdit={isOwner}`), com os 3 campos + texto explicando a diferença entre `meta_capi_token` e o token de Conexão Meta, e o aviso de que `dominio_autorizado` é só hostname (sem protocolo/porta).
- Acessível em **Minha conta → Estúdio da Empresa → Tracking Pixel**.

## [x] 9. Fluxo de configuração guiado (feedback do usuário: "fluxo confuso")

Antes, ir de "vejo a aba Tracking vazia" até "sei o que fazer" exigia adivinhar onde configurar e copiar/colar manualmente o slug no snippet do pixel. Fechado o loop:
- **Botão "Configurar agora →"** no aviso de "tracking não configurado" (`TrackingEventsView.tsx`) — chama `onConfigure` (prop nova), que em `Dashboard.tsx` troca pra aba "Minha conta", sub-aba "Empresa" e sinaliza qual seção abrir.
- **`CompanyStudio.tsx`** ganhou prop `focusSection` — abre e rola automaticamente até a seção certa do accordion (`id="studio-section-<id>"` + `scrollIntoView`). Repassado via `MyAccount.tsx` (`focusStudioSection`), espelhando o padrão já existente de `activeTab`/`onTabChange` controlado por `Dashboard.tsx`.
- **Snippet de instalação pronto pra copiar** dentro da seção "Tracking Pixel": depois de salvar o Pixel ID, aparece o `<script>` exato (com o slug real da empresa e a origem do app) com botão "Copiar" — sem precisar montar a tag manualmente.

## [x] 10. Desacoplar captura de Meta (feedback do usuário: "quero testar nosso pixel, não o da Meta")

Até aqui o `track-event/route.ts` retornava 400 e **nem gravava no `events_log`** se `meta_pixel_id`/`meta_capi_token` estivessem vazios — impossível testar o pixel próprio sem credenciais Meta reais primeiro. Mudança:
- Removido o gate 400. Captura grava em `events_log` sempre que a empresa existe e o domínio bate (igual antes).
- Repasse pra Meta CAPI vira **best-effort**: só roda se `meta_pixel_id` E `meta_capi_token` estiverem preenchidos. Quando não estão, `capi_status` nasce `"skipped"` (novo valor, sem migration — coluna é `TEXT` livre, sem `CHECK`) em vez de tentar e falhar.
- `CompanyStudio.tsx`: seção "Tracking Pixel" reorganizada — snippet de instalação e campo de domínio aparecem sempre (não dependem mais de Pixel ID preenchido); Pixel ID/Token CAPI viram visualmente "opcional", numa subseção separada ("Enviar também pra Meta Conversions API").
- `TrackingEventsView.tsx`: aviso de Meta não configurada virou informativo (cinza, "Eventos sendo capturados normalmente...") em vez de bloqueante (âmbar, "Tracking não configurado"). Badge de status ganhou `skipped` (cinza, "Capturado (sem Meta)").
- `__tests__/tracking.test.ts`: teste antigo "400 quando tracking não configurado" virou "200 + grava sem chamar Meta CAPI quando empresa não tem pixel configurado".

## [x] 11. Pixel v2 — PageView automático + ID persistente via cookie (feedback do usuário: "instalei e nenhum evento chegou, nem cookie de histórico")

Diagnóstico ao vivo com o usuário revelou duas coisas:
1. O pixel original **nunca disparava nada sozinho** — só capturava em ação explícita (submit/clique/dataLayer.push). Sem PageView automático, "instalar e não ver nada" era esperado se a página só foi carregada/recarregada sem interação.
2. Fingerprint era só `sha256(ip+UA)`, sem persistência — não dava pra reconhecer o mesmo visitante em visitas diferentes (sem `_fbp`-like).

Reescrita do `pixel.js` (`src/app/api/tracking/pixel.js/route.ts`), escopo reduzido a propósito pra simplificar:
- **Cookie 1ª parte `_dm_uid`** (400 dias, `SameSite=Lax`): gerado via `crypto.randomUUID()` (fallback manual pra browsers sem suporte) na primeira visita, lido nas seguintes. Mandado em todo evento como `user_id`.
- **PageView automático** no `Tracker.init()` — não depende de nenhuma ação do visitante.
- **Lead** continua no submit do form (`input[type=email]`/`input[type=tel]`), sem mudança de comportamento.
- **Removidos**: clique WhatsApp (`Contact`) e interceptor de `dataLayer` (`Purchase`) — fora de escopo por enquanto, podem voltar depois reaproveitando o `send()` que já existe.
- `send()` agora loga erro no console em vez de engolir silenciosamente (`catch` vazio) — facilita debug igual ao que aconteceu aqui (não dava pra saber que a chamada tinha falhado sem abrir Network manualmente).

Backend (`track-event/route.ts`):
- `TrackEventPayload` ganhou `user_id?: string` opcional.
- `fingerprintId = payload.user_id?.trim() || sha256(ip+UA)` — cookie é fonte de verdade quando existe, hash IP+UA vira só fallback (cliente com cache de pixel.js antigo, cookies bloqueados).
- `public/tracking-test.html` atualizado: removidos os controles de WhatsApp/Purchase que não fazem mais nada; texto explica que PageView dispara sozinho.

## [x] 12. Visão por visitante + dados reais do Lead (feedback do usuário: "pixel funcionando, agora vamos melhorar")

Pixel confirmado funcionando (PageView + Lead chegando em `events_log`). Pedido: linhas clicáveis, sem duplicar visitante por ação, histórico organizado de páginas/UTMs por clique, e dados reais do lead (não só hash) quando ele se cadastra. Decisão confirmada com usuário: capturar email/telefone **em texto puro** além do hash (trade-off de privacidade explícito — aumenta responsabilidade sobre esse dado, mas sem isso não dá pra contatar o lead de verdade).

**Migration `031_events_log_lead_pii.sql`**: `events_log.lead_email`/`lead_phone` (TEXT, nullable) — mesmo padrão de `public.leads` (texto puro, só RLS, sem encriptação extra, consistente com o resto do repo).

**`pixel.js`**: form listener agora manda `pii: { email, phone }` (texto puro) **além** de `user_data: { em, ph }` (hash, inalterado). `pii` nunca é referenciado na montagem do `capiPayload` da Meta — só hash vai pra lá, por design, não tocar nisso sem entender o motivo.

**`track-event/route.ts`**: aceita `payload.pii`, grava em `lead_email`/`lead_phone` no insert. Meta CAPI continua recebendo só `user_data.em`/`ph`.

**`TrackingEventsView.tsx`** — reescrito de "1 linha por evento" pra "1 linha por visitante" (`groupByVisitor()`, agrupa por `fingerprint_id`):
- Tabela: Visitante (fingerprint curto) · **Última ação** (tempo relativo: "há 5 min", "há 2h"; tooltip com data/hora absoluta) · Eventos (contagem) · Origem/UTM (chips dos parâmetros `utm_*` da última URL, parseados via `parseUtm()`) · Lead (badge "✓ converteu" se algum evento tem `lead_email`/`lead_phone`).
- Linha clicável → abre **drawer lateral** (`VisitorDrawer`, padrão `createPortal` + overlay, mesmo shape do `GoalsPanel` em `Dashboard.tsx` — não existe componente de modal genérico no repo, cada feature replica o padrão local) com:
  - Card de "Dados capturados" no topo (email/telefone reais) quando o visitante converteu.
  - Timeline cronológica (mais antigo → mais recente, como uma jornada) de todos os eventos: horário, tipo, caminho da URL (sem os `utm_*`, que já aparecem como chips), chips de UTM, e status CAPI nos eventos Lead.
- Filtros de data/chip/busca continuam filtrando os eventos antes de agrupar; busca agora também procura em email/telefone do lead, não só URL/fingerprint.

## [x] 13. Bugs fora do escopo de tracking, achados/corrigidos no caminho

Não fazem parte do PRD original, mas surgiram testando o resto do app na mesma sessão:

**Migration `032_user_tags_company_id.sql`** — `addUserTag()` (`src/utils/supabaseProducts.ts`) tentava inserir `company_id` numa coluna que não existia em `user_tags`. Causa raiz: a migration `021_companies_multi_tenant.sql` adiciona `company_id`+RLS por empresa numa lista de tabelas, mas só se a tabela **já existir** naquele momento (checa `information_schema.tables`). Como `user_tags` (migration `011`) nunca tinha rodado neste projeto até o usuário rodar agora (ver seção de Histórico mais acima), a 021 pulou ela silenciosamente — sem `company_id`, com as policies antigas só-por-usuário da 011. A 032 replica manualmente o que a 021 teria feito. Esse tipo de gap (migration condicional que silenciosamente pula tabela ainda não criada) pode se repetir com outras tabelas que historicamente ficaram pra trás — vale desconfiar se aparecer outro erro de "column does not exist" parecido.

Também corrigido: `addUserTag`/`deleteUserTag` lançavam o objeto de erro bruto do Supabase (`throw error`), que não é `instanceof Error` — por isso o toast de erro (corrigido na seção do Histórico) sempre mostrava "erro desconhecido" em vez da mensagem real. Agora fazem `throw new Error(error.message)`.

## [x] 14. Título da página, todos os campos do form, UTM legível (feedback do usuário após ver o drawer funcionando)

Pedido: (1) mostrar nome/título da página em vez de só a URL/slug no histórico do visitante; (2) capturar todos os campos do formulário, não só email/telefone; (3) UTMs vinham com `+`/`%XX` literais no drawer (ex.: `%5BAo+Vivo%5D...`) — decodificar pra texto legível.

**Migration `033_events_log_title_fields.sql`**: `events_log.page_title` (TEXT) + `events_log.extra_fields` (JSONB, default `{}`).

**`pixel.js`**: `send()` agora manda `page_title: document.title` em todo evento (não só Lead). `attachFormListener` varre `input/select/textarea` do form (não só `email`/`tel`), excluindo `submit/button/hidden/password/file/reset/image`; email/telefone continuam indo pra `pii.email`/`pii.phone` (+ hash), os demais campos nomeados vão pra `pii.fields: {name: value}` — limite de 25 campos, valor truncado em 500 chars (proteção contra forms gigantes/abuso).

**`track-event/route.ts`**: aceita `payload.page_title` e `payload.pii.fields`, grava em `events_log.page_title`/`extra_fields`. Mesma regra de sempre: nada disso é repassado à Meta CAPI, só pra exibição no dashboard.

**`TrackingEventsView.tsx`**:
- Timeline do drawer mostra `page_title` em destaque acima do caminho da URL (quando disponível); tabela usa `page_title` como fallback quando não há UTM pra mostrar.
- Card "Dados capturados" agora lista todos os `extra_fields` do evento de Lead, além de email/telefone.
- `parseUtm()` ganhou `decodeUtmValue()` — decodifica `+`→espaço e `%XX` em loop (até 4 passadas) até estabilizar, corrige o caso de UTM vinda com encoding duplicado (comum em parâmetros dinâmicos de anúncio tipo `{{ad.name}}` que a plataforma já encoda antes de virar query string).

Sem nova credencial/config necessária — tudo retrocompatível (campos novos são opcionais, eventos antigos sem `page_title`/`extra_fields` continuam funcionando normalmente).

**`mainTab` sem persistência (`Dashboard.tsx`)** — recarregar qualquer página sempre voltava pra aba "Dashboard" (Visão Geral), porque `mainTab` era só `useState` em memória, sem salvar em lugar nenhum — diferente de outros estados da sidebar que já usam `localStorage` (ex: `dm_sidebar_collapsed`). Não é regressão de nada feito nesta sessão, gap pré-existente. Corrigido: `mainTab` agora persiste em `localStorage` (`dm_main_tab`), mesmo padrão (lazy initializer + try/catch pra SSR-safety).

## [x] 15. Resiliência a migration atrasada + drawer multi-cadastro + rótulo de campo

Depois do deploy da seção 14, a tela de Tracking quebrou ("column events_log.page_title does not exist") porque a migration 033 ainda não tinha rodado no Supabase — deploy de código é automático (`git push`), migration é manual. Corrigido nas duas pontas:
- **Leitura** (`TrackingEventsView.tsx`): `EVENTS_SELECT`/`EVENTS_SELECT_FALLBACK` — se o select com as colunas novas falhar citando uma delas, refaz sem elas em vez de quebrar a tela.
- **Escrita** (`track-event/route.ts`): `insertEvent()` com `OPTIONAL_COLUMN_GROUPS` — generaliza o fallback por grupo de colunas (1 grupo por migration), tentando de novo sem o grupo que faltar. Sem isso o evento era perdido silenciosamente até a migration rodar.
- `pixel.js` também perdeu o cache de 5min (`Cache-Control: no-store`) — o cache fazia o cliente rodar a versão antiga do script por até 5min após cada deploy, gerando falso-negativo ("não captura X") que na real era só script desatualizado.

Depois, feedback de uso: "achei que tava mostrando só o primeiro cadastro" + "quero a URL completa" — `VisitorDrawer` ganhou estado local pra trocar qual cadastro o card "Dados capturados" exibe (clicar num evento "Lead" na jornada troca o card, default = mais recente) e a jornada passou a mostrar a URL completa em vez de só o path.

Por fim: builders tipo Elementor nomeiam o input do form como `form_fields[name]` — `humanizeFieldKey()` extrai o nome de dentro dos colchetes e formata como rótulo (`form_fields[name]` → "Nome:"), com o mesmo ícone/estilo de email/telefone.

## [x] 16. Geolocalização por evento (substitui VisitorAPI)

Pedido: capturar País/Estado/Cidade em todo evento, "lógica inteligente, moderna e prática" — sem reintroduzir um serviço externo tipo VisitorAPI.

**Decisão de arquitetura**: app roda na Vercel (`vercel.json` na raiz), que já resolve geo-IP e injeta nos headers (`x-vercel-ip-country`, `x-vercel-ip-country-region`, `x-vercel-ip-city`) em **toda** requisição, de graça — sem chamada a API externa, sem custo, sem latência extra, sem mandar o IP do visitante pra um terceiro. Lido via `@vercel/functions` (`geolocation(request)`), pacote oficial da Vercel — é a forma documentada de acessar isso desde o Next 15, que removeu `request.geo`/`request.ip`. Só funciona em produção na Vercel; em dev local os 3 campos vêm `null` (não dá pra simular sem deployar, comportamento esperado).

**Migration `034_events_log_geo.sql`**: `events_log.country` (TEXT, código ISO alpha-2 ex. "BR"), `country_region` (TEXT, código do estado ex. "SP"), `city` (TEXT).

**`track-event/route.ts`**: `geolocation(request)` lido uma vez por request, gravado junto no insert. Entra no novo grupo `["country", "country_region", "city"]` de `OPTIONAL_COLUMN_GROUPS` — mesma resiliência da seção 15 se a 034 ainda não tiver rodado.

**`TrackingEventsView.tsx`**: nova coluna "Local" na tabela (1 por visitante, última localização conhecida) e linha de localização em cada evento da jornada no drawer. `flagEmoji()` calcula a bandeira a partir do código ISO no client (sem guardar emoji no banco) e `formatLocation()` monta "🇧🇷 São Paulo, SP · BR".

## [x] 17. Config do pixel direto na aba Tracking + Gestor de tráfego pode editar

Pedido 1: "quero que essa tela/configurações esteja na página tracking" — o formulário de config (antes só em Estúdio da Empresa) virou um componente compartilhado, `TrackingConfigPanel` (`src/components/TrackingConfigPanel.tsx`), usado tanto lá quanto num painel colapsável "Configuração" direto na aba Tracking (botão no header, e o aviso "Meta não configurada" agora abre esse painel local em vez de navegar pra outra aba). Limpou a navegação cruzada `focusStudioSection` que ficou morta depois disso (estava em `Dashboard.tsx`/`MyAccount.tsx`).

Pedido 2: usuário reportou campos travados sem explicação — `canEdit` era `isOwner` (só dono), sem nenhum aviso visual do motivo. Adicionei um aviso quando `!canEdit`. Veio então o pedido seguinte: "quero que o Gestor de tráfego também consiga editar".

**Migration `035_tracking_manager_write.sql`**: a policy de UPDATE em `companies` (`companies_owner_update`, de `021_companies_multi_tenant.sql`) era owner-only pra **toda** a tabela — não dava pra abrir só as 3 colunas de tracking pra manager sem reescrever a RLS. Solução: policy passa a aceitar `can_write_company` (owner OU manager), e um trigger `BEFORE UPDATE` (`check_companies_update_scope`) restringe manager a só alterar `meta_pixel_id`/`meta_capi_token`/`dominio_autorizado` — qualquer outra coluna alterada por um manager aborta a transação. **Whitelist proposital** (lista o que manager *pode* mexer, não o que não pode): colunas novas de migrations futuras ficam owner-only por padrão, sem precisar lembrar de atualizar este trigger toda vez que `companies` ganhar uma coluna nova.

`canEdit` nos dois lugares (`CompanyStudio.tsx`'s `TrackingSection`, `TrackingEventsView.tsx`) passou de `isOwner` pra `canWrite` (owner ou manager) — só pra essa seção, as outras (Identidade, Equipe etc.) continuam `isOwner`-only.

## [x] 18. Deduplicação Pixel + Conversions API, qualidade de evento à la Meta

Pedido: "quero fazer um evento teste, entro na página testo os eventos e vejo se estão chegando pra Meta Ads via web e server e sendo desduplicados da maneira certa. Leia tudo sobre as boas práticas que a Meta pede". Pesquisei a documentação oficial da Meta (`developers.facebook.com`) e best practices de 2026 antes de implementar — ver fontes na resposta original. Decisão confirmada com o usuário antes de mexer: o site dele só tem o nosso `pixel.js`, **nenhum** Meta Pixel manual instalado em paralelo — então o próprio `pixel.js` passou a carregar o fbq da Meta no navegador também (não um 2º script separado pro cliente colar).

**O que a Meta exige pra deduplicar Pixel (browser) + CAPI (server) como 1 evento**:
- Mesmo `event_name` E mesmo `event_id` nos dois lados (string idêntica, sem variar formatação/caixa).
- `event_id` deve ser único por evento (nunca reusar pra ações diferentes).
- `fbp`/`fbc` (cookies 1ª parte da Meta) no `user_data` da CAPI melhoram muito o Event Match Quality — mas nunca inventar `fbc` sem um `fbclid` real.
- `test_event_code` (campo top-level no payload da CAPI, ao lado de `data`) é como validar tudo isso em tempo real na aba "Eventos de teste" do Events Manager — e deve ser removido depois do teste (orientação da própria Meta).

**Migration `036_tracking_capi_quality.sql`**: `companies.meta_test_event_code` (TEXT) + `events_log.event_id` (TEXT) + adiciona `meta_test_event_code` na whitelist do trigger de manager (seção 17).

**`src/app/api/tracking/config/route.ts`** (novo, GET, CORS aberto, sem auth) — endpoint público que devolve só `{ metaPixelId }` dado um `client_id` (slug). Nunca devolve token/domínio/código de teste. É assim que `pixel.js` descobre em runtime se a empresa tem Pixel ID configurado, sem expor nada sensível (Pixel IDs já são públicos em qualquer site que usa Meta Pixel).

**`pixel.js`** — mudanças:
- `send()` agora gera um `event_id` (UUID) por evento, manda pro `/track-event` E pro `fbq('track', eventName, {}, {eventID})` — mesmo ID nos dois lados, é a chave da dedup.
- `Tracker.init()` chama `initMetaConfig(clientId)` (fetch assíncrono em `/api/tracking/config`); se a empresa tem `metaPixelId`, carrega o snippet oficial do fbq (`loadFbq()`, o mesmo código-padrão que qualquer site com Meta Pixel já tem) e dá `fbq('init', pixelId)`.
- Como o fetch de config é assíncrono mas o PageView dispara imediato no load, eventos disparados antes do config resolver ficam numa fila (`pendingFbqCalls`) e são repassados pro fbq assim que ele carrega — sem isso, o PageView (o evento de maior valor pra medir landing page) perderia o lado "browser" da dedup.
- `getFbp()`/`getFbc()` leem os cookies `_fbp`/`_fbc` da própria Meta; `getFbc()` reconstrói a partir de `?fbclid=` na URL se o cookie ainda não existir (formato `fb.1.<timestamp>.<fbclid>`), salva o cookie pra persistir.

**`track-event/route.ts`** — mudanças:
- Aceita `event_id`/`fbp`/`fbc` no payload, repassa pro `capiPayload.data[].event_id`/`user_data.fbp`/`user_data.fbc` (fbp/fbc não são hasheados, vão como string crua — não são PII).
- Inclui `test_event_code` top-level no payload da CAPI quando `company.meta_test_event_code` está preenchido.
- `selectCompany()` (novo helper) aplica a mesma resiliência de migration-pendente do `insertEvent()` — se a coluna `meta_test_event_code` ainda não existir no banco, cai pro select sem ela em vez de derrubar TODO evento daquela empresa.
- `event_id` também é gravado em `events_log` (grupo novo em `OPTIONAL_COLUMN_GROUPS`) — só pra dar visibilidade no nosso dashboard, não tem nenhuma lógica de dedup do nosso lado (a dedup é 100% feita pela Meta).

**`TrackingConfigPanel.tsx`**: novo campo "Código de teste (opcional)" — cola o código da aba Eventos de teste do Events Manager, salva em `meta_test_event_code`, com aviso pra apagar depois de validar.

**`TrackingEventsView.tsx`**: cada evento na jornada do drawer agora mostra o `event_id` (8 primeiros chars) ao lado do status CAPI, pra cross-check manual contra o Diagnóstico da Meta. Status CAPI passou a aparecer em todo evento (antes só aparecia em Lead, mas PageView também é mandado pra CAPI quando configurado).

**Fluxo de teste pro usuário**: Events Manager → Eventos de teste → copiar código → colar em Configuração (aba Tracking) → salvar → navegar na própria página de teste → ver "1 evento de 2 fontes" (Navegador + Servidor) aparecendo em tempo real, já deduplicado.

## [x] 19. Inventário completo do user_data — fn/ln, geo, external_id, normalização de telefone

Pedido: "estamos enviando tudo conforme eles pedem? Cite tudo que estamos enviando" — auditoria do que ia pra Meta CAPI. Antes da seção 18 já mandávamos `em`/`ph`/`fbp`/`fbc`/`client_ip_address`/`client_user_agent`. Faltava: `fn`/`ln` (nome), `country`/`st`/`ct`/`zp` (já capturávamos via geo-IP pro nosso dashboard, mas não repassávamos pra Meta) e `external_id`.

**`pixel.js`**: `attachFormListener` agora detecta campos de nome por `name`/`id` (`first_name`/`fname`/`nome`, `last_name`/`lname`/`sobrenome`) ou `autocomplete` (`given-name`/`family-name`/`name`) — um campo único "nome completo" é separado no primeiro espaço em `fn`+`ln`. Não substitui a captura genérica em `extra_fields` (dashboard continua mostrando o nome em texto puro), só *adiciona* o hash pro `user_data`.

**Bug encontrado e corrigido na mesma auditoria**: telefone só passava por `sha256Hex` (trim+lowercase) sem normalização própria — um telefone com máscara tipo `(11) 99999-9999` gerava um hash que a Meta não reconhece (ela espera só dígitos, com DDI, sem `+`/`-`/espaço/parênteses). Adicionado `normalizePhone()` antes do hash.

**`track-event/route.ts`**: novo helper `hashLower()` (trim+lowercase+SHA-256, mesma normalização do template GTM oficial da Meta) usado pra hashear `country`/`st`/`ct`/`zp` a partir do `geo` (geo-IP da Vercel, mesmo que já alimenta `events_log.country/country_region/city` desde a seção 16) e `external_id` a partir do `_dm_uid` persistente. `fn`/`ln` chegam já hasheados do pixel, servidor só repassa (mesmo padrão de `em`/`ph`).

Pesquisei a normalização oficial no template GTM da própria Meta (`facebookincubator/ConversionsAPI-Tag-for-GoogleTagManager`) antes de implementar, em vez de adivinhar — trim+lowercase pra tudo, exceto telefone (só dígitos).

**`user_data` completo hoje**: `em`, `ph`, `fn`, `ln`, `country`, `st`, `ct`, `zp`, `external_id` (hasheados) + `fbp`, `fbc`, `client_ip_address`, `client_user_agent` (crus, não são PII) + `event_id` (chave de dedup, fora do `user_data`).

## [x] 20. "Event enhancement" — reaproveita dados do Lead em todos os eventos seguintes

Pedido: "tem um hackzinho que toda vez que capturamos os dados do lead, enviamos novamente quando ele faz outros eventos que não seja no formulário, pra aumentar a nota de atribuição na Meta e otimizar mais a campanha". Pesquisei antes de implementar — é uma técnica real e documentada, ferramentas de CAPI gateway (Stape, no GTM oficial da Meta) chamam isso de **"Event Enhancement"**/"Customer Information cache": depois que você captura email/telefone/nome num Lead, guarda (hasheado) e anexa automaticamente em todo evento seguinte do mesmo visitante — não só no próprio Lead.

**`pixel.js`**: cookie novo `_dm_lead` (400 dias, mesmo padrão do `_dm_uid`) guarda só os **hashes** de `em`/`ph`/`fn`/`ln` (nunca o valor cru — bom pra privacidade também, já que não precisa manter PII em claro no browser por mais tempo do que o necessário pra montar o request).
- `mergeLeadCache(userData)` é chamado no fim do handler de Lead, depois de já ter os hashes da submissão — atualiza o cookie (merge, não substitui, então um Lead posterior com campo novo soma ao que já tinha).
- `send()` agora monta o `user_data` de **todo** evento como `Object.assign({}, getLeadCache(), extra.user_data || {})` — o cache vira a base, o que o evento atual já tiver sobrescreve. Na prática: um `PageView` disparado depois do Lead já leva `em`/`ph`/`fn`/`ln` junto, mesmo sem ter passado por nenhum formulário naquela página.
- Bônus: quando o cache muda, re-chama `fbq('init', pixelId, cache)` — atualiza o Advanced Matching do **navegador** também (a Meta aceita valor já hasheado nesse parâmetro), não só da CAPI.

Antes dessa mudança, eventos fora do Lead (ex.: `PageView`) já mandavam `country`/`st`/`ct`/`zp`/`external_id`/`fbp`/`fbc`/IP/UA (8 identificadores, geo-IP + Meta cookies são sempre conhecidos), mas nunca `em`/`ph`/`fn`/`ln`. Depois de um Lead converter, esses mesmos eventos passam a levar até 12 identificadores — segundo a própria Meta, EMQ "ótimo" começa em 8+ identificadores por evento, então isso empurra todo evento pós-conversão pro topo da faixa.

Outras boas práticas já cobertas nas seções 16/18/19 (não repetir aqui, só lembrar que fazem parte do mesmo pacote de "EMQ alto em todo evento"): dedup por `event_id` compartilhado Pixel+CAPI, `fbp`/`fbc` reais (nunca inventados), `event_time` sempre em tempo real (sem batching), `action_source: "website"` consistente, normalização oficial (trim+lowercase, telefone só dígitos) antes de hashear.

## [x] 21. Múltiplos pixels nomeados por empresa (1 por landing page/produto)

Pedido: "em Configurações, eu gostaria de criar pixels e nomeá-los". Esclareci antes de implementar (motivo do múltiplos pixels: "Páginas/produtos diferentes" — cada landing page/produto da empresa tem seu próprio Pixel ID da Meta) — isso muda a arquitetura: até aqui era 1 config de tracking por empresa (4 colunas direto em `companies`); agora é 1-pra-N.

**Migration `037_tracking_pixels_table.sql`**: tabela `tracking_pixels` (`company_id`, `slug`, `name`, `meta_pixel_id`, `meta_capi_token`, `dominio_autorizado`, `meta_test_event_code`, `is_default`). RLS: CRUD completo pra owner+manager (`can_write_company`) — sem precisar do trigger de whitelist que `companies` tem, porque essa tabela só guarda campo de tracking, nada sensível. Migration já copia a config existente de cada empresa pra um pixel "Pixel principal" (`is_default = true`), pra **nenhuma instalação já feita parar de funcionar**. `events_log.pixel_id` (mesma migration) registra qual pixel recebeu cada evento. Colunas legadas de `companies` ficam deprecadas, não dropadas (zero risco).

**Decisão de design — `slug` opaco e estável**: cada pixel tem um slug aleatório (não derivado do nome) que entra no snippet (`Tracker.init(empresa, pixelSlug)`) — renomear o pixel na UI (`name`) **nunca** quebra uma instalação já feita, porque o identificador no snippet não muda. `is_default` existe só pra suportar snippets **antigos** (`Tracker.init(empresa)`, sem 2º argumento, instalados antes dessa feature) — pixels novos sempre têm o slug explícito no próprio snippet, não dependem de qual é o default.

**Resiliência**: `resolveCompanyAndPixel()` (`track-event/route.ts`) e a lógica equivalente em `config/route.ts` resolvem o pixel por `pixel_slug` (ou `is_default` se omitido); se a tabela `tracking_pixels` inteira ainda não existir (migration 037 pendente), caem pra ler as 4 colunas legadas de `companies` direto — mesmo padrão de resiliência já estabelecido nas seções 15/16/18 pra qualquer migration nova.

**`pixel.js`**: `Tracker.init(clientId, pixelSlug)` — 2º argumento opcional, manda `pixel_slug` em todo evento e na chamada de `/api/tracking/config`. Omitido = comportamento de sempre (usa o pixel padrão).

**`TrackingConfigPanel.tsx`**: reescrito de "1 formulário" pra "lista de cards", 1 por pixel — cada card tem nome (editável), snippet próprio (com o slug daquele pixel), domínio, Pixel ID/Token CAPI/código de teste, botão salvar, botão "marcar como padrão" (exceto no já-padrão) e remover (bloqueado se for o último pixel da empresa). Botão "+ Novo pixel" no final. Usado tanto no Estúdio da Empresa quanto na aba Tracking — `useCompany.ts` ganhou `fetchTrackingPixels`/`createTrackingPixel`/`updateTrackingPixel`/`deleteTrackingPixel`/`setDefaultTrackingPixel`, substituindo o antigo `fetchCompanyTracking`/`setCompanyTracking` (1 pixel só).

**Banner "Meta não configurada"** (`TrackingEventsView.tsx`) passou de "a empresa tem `meta_pixel_id`?" pra "**algum** pixel da empresa tem `meta_pixel_id`?" — consulta `tracking_pixels` em vez de `companies`, com o mesmo fallback de migration pendente.

## [x] 22. UTM em coluna própria + campos extras pra relatórios futuros

Antes a UTM só existia escondida dentro de `events_log.event_url` — o dashboard reprocessava a URL no browser a cada render. Agora o servidor extrai a UTM 1x na captura (`parseUtmColumns()` em `track-event/route.ts`) e grava em coluna (`utm_source`/`medium`/`campaign`/`content`/`term`/`placement`/`campaign_id`/`adset_id`/`ad_id`), pronta pra `GROUP BY`/filtro em SQL sem reprocessar nada. `utm_campaign_id`/`adset_id`/`ad_id` são as mesmas IDs que a Meta Marketing API usa — permite no futuro `JOIN` com custo/ROAS por campanha/anúncio (nome de campanha repete, ID nunca repete).

Também adiciona campos que já passavam pela rota mas não ficavam em coluna própria: `lead_name` (nome em texto puro do Lead, mesmo padrão de `lead_email`/`lead_phone`), `postal_code`/`latitude`/`longitude` (geolocalização completa, mesma fonte grátis da Vercel que já alimentava `country`/`city`) e `device_type` (mobile/tablet/desktop, classificado a partir do User-Agent). Nenhum desses 5 vai pra Meta CAPI — só uso interno.

**Migrations `038`/`039`** — resiliência de sempre: `OPTIONAL_COLUMN_GROUPS` detecta coluna ausente e regrava sem ela; dashboard cai pro parse da URL (`resolveUtm()`) pra eventos antigos ou enquanto a migration não roda.

## [x] 23. Eduzz vira fonte de Purchase pra Meta Ads (Pixel+CAPI)

Pedido: vendas da Eduzz (webhook próprio, já existente para `campaign_metrics`) passam a também gerar evento `Purchase` no mesmo pipeline do tracking pixel. Aceita os 2 formatos de webhook da Eduzz na mesma URL, detectados automaticamente: postback antigo (MyEduzz) e moderno (Orbita, "Fatura paga", manda telefone do comprador e `tracker.code1/2/3`).

Toda venda paga faz 2 coisas, sempre as 2: continua acumulando revenue/conversions em `campaign_metrics` (como já fazia) e também grava um evento `Purchase` em `events_log` + manda pra Meta CAPI, igual Lead/PageView do pixel próprio. `action_source: "system_generated"` (categoria correta da Meta pra evento gerado pelo backend a partir de notificação de pagamento, sem `client_user_agent` disponível).

**Correlação com a visita original** (pra mandar com `fbp`/`fbc`/`event_source_url` reais em vez de evento solto): tracker code → email → telefone, nessa ordem. Sem match, usa fingerprint sintético (hash do email) e manda só com `em`/`ph`/`external_id`.

**Migration `040`**: `external_transaction_id` (idempotência de retry + `event_id` na CAPI) e `fbp`/`fbc` em `events_log`.

Refatoração: `hashLower`/`hashPhone`/`insertEventsLogRow`/`sendMetaCapiEvent`/`resolvePixel` extraídos pra `src/lib/`, compartilhados entre `tracking/track-event` e `eduzz/webhook` — evita 2 cópias da mesma lógica divergindo com o tempo.

## [x] 24. Config Eduzz move pra aba Tracking + Purchase exibida bonita

Move a config do webhook de vendas Eduzz de Configurações pra **Tracking → Configuração**, em abas (Pixel / Vendas) — novo `EduzzConfigPanel.tsx` espelha o visual do `TrackingConfigPanel.tsx`.

Corrige confusão no drawer do visitante: `Purchase` (venda Eduzz) também grava `lead_email`/`lead_phone` do comprador, e por isso entrava junto no seletor "Dados capturados" do Lead — `Lead` e `Purchase` agora são tratados como eventos distintos.

Exibe a venda de forma rica (igual já era feito pro Lead): resumo de "Compra" no topo do drawer, card por evento na timeline com valor/produto/forma de pagamento/id da transação/comprador, badge de valor na tabela principal (coluna "Lead" renomeada pra "Conversão"). Produto vem de `extra_fields.produto`.

## [x] 25. Eduzz — recorrência, parcela, order bump e dados pra relatórios futuros

Vários ajustes em sequência na integração Eduzz, todos consumidos pelo tracking via `events_log`/Purchase:

- **Ignora renovação/parcela, valor cheio do produto**: `value` sempre usa `data.price.value` (valor cheio), nunca `data.paid.value` (só da fatura/parcela); `installmentNumber > 1` ou `recurrenceKey` já visto → ignora (já contado), responde 200 sem tocar `campaign_metrics`/`events_log`. `installments` (migration `043`) gravado só pra exibição ("Boleto · 3x").
- **Order bump**: `orderBump.has/isMainSale/mainSaleId` → marcado (`is_order_bump`) e linkado de volta (`main_sale_transaction_id`).
- **Dados pra relatórios futuros**: `product_name` promovido a coluna própria (migration `044`, antes só em `extra_fields`); `status` em `events_log` (migration `045`, default `'paid'`) — `handleReversal()` trata `invoice_refunded`/`invoice_chargeback` (só formato moderno) e atualiza a linha já gravada; renovação de assinatura passa a ser registrada como `event_name="Renewal"` (conta receita em `campaign_metrics`, não conta como conversão Meta, `capi_status` fixo `"skipped"`).
- **Numeração de parcela/cobrança + correção de fingerprint**: assinatura/PSL numera a cobrança atual ("3ª de 12") contando linhas já existentes daquele `recurrence_key` (a Eduzz não manda esse número). `installment_value` (migration `054`) separa valor cheio da venda do valor pago só naquela parcela/cobrança. **Bug corrigido**: `recordRenewal()`/`recordInstallment()` calculavam fingerprint com `recurrenceKey`/`transactionId` em vez do email/telefone do comprador — renovação/parcela aparecia como visitante separado no histórico.
- **Campo real do total de cobranças**: `contract.payment.totalOfInstallments` nunca veio nos payloads reais — campo correto é `contract.recurrence.charges.total` (confirmado com payloads reais de produção).
- Migrations `042`-`054` (a parte relevante a Eduzz) precisam ser executadas manualmente no Supabase SQL Editor.

## [x] 26. Auditoria Tracking → Meta: correções de qualidade de dados e idempotência

Auditoria completa pedida pelo usuário ("estamos enviando tudo conforme eles pedem?") cobrindo banco + código + dados de produção:

- `fn`/`ln` (nome) e `country`/`st`/`ct`/`zp`/`external_id` passam a ir pra Meta CAPI (antes só ficavam no dashboard interno) — `hashLower()` normaliza igual ao template GTM oficial da Meta.
- **Bug**: telefone só passava por `sha256Hex` sem normalização — máscara (`(11) 99999-9999`) gerava hash que a Meta não reconhece. `normalizePhone()` (só dígitos, com DDI) antes do hash.
- `sha256Hex`/`hashPhone` nunca mais mandam hash de string vazia (identificador-fantasma que derrubava o match e envenenava o cache `_dm_lead`); "primeiro válido vence" em `em`/`ph` no pixel.
- `ct`/`st`/`zp` via `hashNormalized` (tira acento/espaço/pontuação — regra da Meta); `country` normalizado pra ISO-2 antes de hashear/gravar (Eduzz manda "Brasil"/"Brazil"/"US" sem padrão).
- Graph API `v19.0` (depreciada) → `v23.0`.
- `metaCapi`: grava erro DETALHADO da Meta (`error_user_msg`/subcode/fbtrace) em vez de só "Invalid parameter"; `.json()` em try/catch (resposta não-JSON de gateway não quebra mais o tratamento).
- **Validação de token x Pixel ID ao salvar**: `debug_token` confere se o token CAPI realmente autoriza aquele Pixel ID (`granular_scopes.target_ids`) — token de outro pixel é aceito pela Meta mas o evento é descartado em silêncio (isso quebrou em produção); mismatch/token inválido bloqueiam o save com mensagem clara.
- `backfillContractValues()`: corrige retroativamente valor cheio + nº de parcelas quando a ficha do contrato (`contract_created`) chega depois da 1ª cobrança (Eduzz não garante ordem de entrega).
- Idempotência: `campaign_metrics` gravado DEPOIS do insert em `events_log` (a âncora de idempotência), eliminando double-count de receita em retry; renovação conta receita mas não conversão nova.
- Unifica client Supabase do webhook com `supabaseAdmin()` cacheado (era um client novo por request).
- IP/User-Agent da visita persistidos (migration `047`) e reaproveitados na Purchase da Eduzz quando correlacionada.
- Busca por email/telefone agora acha visitante mesmo sem evento Lead (correlacionado só por Purchase).

## [x] 27. Histórico do visitante mostra dispositivo e localização

- `parseUserAgent()` extrai OS+versão (Android/iOS/Windows/macOS/Linux/ChromeOS) e modelo do aparelho quando disponível (só Android expõe isso no UA; iPhone/iPad a Apple esconde por design) — exibido com ícone (celular/tablet/PC) junto da localização no timeline do visitante.
- Mesma info repetida no card "Dados capturados" no topo do drawer (resumo do lead selecionado).

## [x] 28. Modo proxy — contorna o cap de 7 dias do Safari/iOS em cookie

`document.cookie` sempre sofre cap de 7 dias no Safari/WebKit (ITP), mesmo pedindo 400 dias — não dá pra contornar isso só do lado do navegador. A única solução real é `Set-Cookie` do SERVIDOR vindo de um domínio que o Safari considere 1ª parte — como nosso backend é domínio diferente do cliente, isso só funciona através de um proxy reverso hospedado no MESMO domínio da landing page.

- `track-event/route.ts`: toda resposta de sucesso manda `Set-Cookie` incondicional (`fingerprintId`) — noop em modo direto, passa a valer via proxy.
- `pixel.js/route.ts`: gera variante do script (`?via=proxy`, decidido no SERVIDOR, nunca por introspecção no browser) apontando pro `dm-proxy.php` do próprio cliente.
- `proxy-template/route.ts` (novo): gera o `dm-proxy.php` pronto pra download, com hardening (URL hardcoded contra SSRF, allowlist fechada de endpoints, timeout curto, limite de 64KB no body).
- `TrackingConfigPanel.tsx`: toggle instalação direta/proxy + botão de download.

**3 bugs encontrados e corrigidos em iterações seguintes desse modo**:
- Quebra de texto no aviso do modo proxy (`<code>`/`<strong>` como filhos diretos de um `<p>` com `display:flex` — cada filho JSX virava item separado em vez de fluir como texto contínuo).
- **fix crítico**: `initMetaConfig()` concatenava `"?client_id="` numa URL que já tinha `"?"` (`/dm-proxy.php?ep=config`), virando `"?ep=config?client_id"` — o PHP parseava `ep` fora da allowlist e respondia 400, então o `fbq` (Pixel da Meta no navegador) NUNCA carregava em modo proxy (CAPI funcionava, lado browser morria). Agora escolhe `?`/`&` em runtime.
- **fix corrida de identidade**: em proxy o cookie só é gravado pelo servidor (`Set-Cookie`), então na 1ª visita `getUserId()` gerava um id novo a cada chamada antes do round-trip — 2 eventos quase juntos viravam 2 fingerprints. Memoiza o id por carga de página (`cachedUserId`).
- `proxy-template` repassa `Cache-Control` (além de `Content-Type`/`Set-Cookie`) pro `no-store` do `pixel.js` valer através do proxy.

**Decisão final**: descontinuar a instalação direta na UI e oferecer só o modo proxy — perfil de cliente é todo hospedagem PHP, e o proxy é o único jeito do cookie sobreviver +7 dias no Safari/iOS. Multi-tenant auditado e correto (`dm-proxy.php` genérico, 1 arquivo, N empresas, empresa por slug, `_dm_uid` isolado por domínio); variante direta mantida no backend como fallback/migração (não é código morto). UI removeu o toggle, só mostra o snippet de proxy.

## [x] 29. Botão "Testar instalação" pro modo proxy

Cliente não tinha como saber se o `dm-proxy.php` subiu certo sem abrir o site real e inspecionar cookies manualmente. Novo fluxo testa de ponta a ponta a partir do painel:

- `test-proxy/route.ts` (novo): busca a URL informada, confere o snippet na página, chama `?ep=config` (proxy no ar + fala com nosso backend) e `?ep=track` com `ping=true` (confirma que o `Set-Cookie _dm_uid` realmente volta pelo domínio do cliente — a única prova de que o cookie nasce 1ª parte de verdade, o que mais costuma falhar silenciosamente em hospedagem compartilhada).
- `track-event/route.ts`: novo campo `ping=true` — passa pela mesma validação de `dominio_autorizado` de sempre, devolve o cookie, mas nunca grava `events_log` nem chama a Meta CAPI (não polui histórico real do cliente com evento de teste).
- `TrackingConfigPanel.tsx`: campo de URL + botão "Testar" + lista de resultado por checagem dentro do bloco do modo proxy.

## [x] 30. Coluna "Via" (proxy/direto), filtro por dispositivo e fix de tablet Android

Revisão do que foi pedido (colunas OS/Dispositivo/Browser) levantou 3 melhorias:

- **fix**: detecção de tablet Android usava a palavra literal "tablet" no UA (raramente aparece) em vez da convenção real (UA de tablet OMITE o token "Mobile") — um Galaxy Tab real caía sempre como "Celular".
- **feat**: chip de filtro por Dispositivo (Celular/Tablet/Desktop) na tabela de Eventos de Tracking; busca livre agora também casa OS/navegador (ex.: digitar "iphone" ou "chrome" filtra). Filtro de forma de pagamento (Pix/Boleto/Cartão...) aparece quando o chip "Compra" está ativo.
- **feat**: nova coluna "Via" (Proxy/Direto) — `events_log.via` (migration `057`), mandado pelo próprio `pixel.js` (`PROXY_MODE`, decidido no servidor) em todo evento. Deixa visível, por visitante, se o cookie nasceu 1ª parte via `dm-proxy.php` ou direto (sujeito ao cap de 7 dias do Safari/iOS).

## Estado atual da aba Tracking

Pixel próprio (`pixel.js` + `Tracker.init`) com PageView/Lead automáticos, ID persistente via cookie (`_dm_uid`, modo proxy obrigatório no Safari/iOS pra sobreviver +7 dias), dedup Pixel+CAPI por `event_id`, `user_data` completo (`em`/`ph`/`fn`/`ln`/`country`/`st`/`ct`/`zp`/`external_id`/`fbp`/`fbc`/IP/UA) com "event enhancement" (cache de lead reaplicado em todo evento seguinte), múltiplos pixels nomeados por empresa, e vendas Eduzz (webhook, formatos antigo+moderno) virando `Purchase` no mesmo pipeline — com recorrência/parcela/order bump/reembolso tratados e idempotência por âncora em `events_log`. Visualização: tabela por visitante com filtro de data/dispositivo/forma de pagamento/busca e drawer com timeline completa (localização, dispositivo, UTM, dados do lead/compra).
