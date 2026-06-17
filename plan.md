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

## 8. Settings UI — seção "Tracking Pixel" em `CompanyStudio.tsx` ✅ feito

Faltava como o usuário de fato configura `meta_pixel_id`/`meta_capi_token`/`dominio_autorizado` sem rodar SQL manual — a única forma até aqui. Adicionado seguindo o padrão exato da seção "Conexão Meta" já existente (`ConexaoSection`/`setCompanyToken`):
- `src/hooks/useCompany.ts`: `fetchCompanyTracking(companyId)` / `setCompanyTracking(companyId, config)` — mesmo padrão de `fetchCompanyToken`/`setCompanyToken` (`supabaseClient.from("companies").update(...)`, RLS faz a autorização de owner).
- `src/components/CompanyStudio.tsx`: nova seção `TrackingSection` no Estúdio da Empresa (accordion, gated por `canEdit={isOwner}`), com os 3 campos + texto explicando a diferença entre `meta_capi_token` e o token de Conexão Meta, e o aviso de que `dominio_autorizado` é só hostname (sem protocolo/porta).
- Acessível em **Minha conta → Estúdio da Empresa → Tracking Pixel**.

## 9. Fluxo de configuração guiado (feedback do usuário: "fluxo confuso") ✅ feito

Antes, ir de "vejo a aba Tracking vazia" até "sei o que fazer" exigia adivinhar onde configurar e copiar/colar manualmente o slug no snippet do pixel. Fechado o loop:
- **Botão "Configurar agora →"** no aviso de "tracking não configurado" (`TrackingEventsView.tsx`) — chama `onConfigure` (prop nova), que em `Dashboard.tsx` troca pra aba "Minha conta", sub-aba "Empresa" e sinaliza qual seção abrir.
- **`CompanyStudio.tsx`** ganhou prop `focusSection` — abre e rola automaticamente até a seção certa do accordion (`id="studio-section-<id>"` + `scrollIntoView`). Repassado via `MyAccount.tsx` (`focusStudioSection`), espelhando o padrão já existente de `activeTab`/`onTabChange` controlado por `Dashboard.tsx`.
- **Snippet de instalação pronto pra copiar** dentro da seção "Tracking Pixel": depois de salvar o Pixel ID, aparece o `<script>` exato (com o slug real da empresa e a origem do app) com botão "Copiar" — sem precisar montar a tag manualmente.

## 10. Desacoplar captura de Meta (feedback do usuário: "quero testar nosso pixel, não o da Meta") ✅ feito

Até aqui o `track-event/route.ts` retornava 400 e **nem gravava no `events_log`** se `meta_pixel_id`/`meta_capi_token` estivessem vazios — impossível testar o pixel próprio sem credenciais Meta reais primeiro. Mudança:
- Removido o gate 400. Captura grava em `events_log` sempre que a empresa existe e o domínio bate (igual antes).
- Repasse pra Meta CAPI vira **best-effort**: só roda se `meta_pixel_id` E `meta_capi_token` estiverem preenchidos. Quando não estão, `capi_status` nasce `"skipped"` (novo valor, sem migration — coluna é `TEXT` livre, sem `CHECK`) em vez de tentar e falhar.
- `CompanyStudio.tsx`: seção "Tracking Pixel" reorganizada — snippet de instalação e campo de domínio aparecem sempre (não dependem mais de Pixel ID preenchido); Pixel ID/Token CAPI viram visualmente "opcional", numa subseção separada ("Enviar também pra Meta Conversions API").
- `TrackingEventsView.tsx`: aviso de Meta não configurada virou informativo (cinza, "Eventos sendo capturados normalmente...") em vez de bloqueante (âmbar, "Tracking não configurado"). Badge de status ganhou `skipped` (cinza, "Capturado (sem Meta)").
- `__tests__/tracking.test.ts`: teste antigo "400 quando tracking não configurado" virou "200 + grava sem chamar Meta CAPI quando empresa não tem pixel configurado".

## 11. Pixel v2 — PageView automático + ID persistente via cookie (feedback do usuário: "instalei e nenhum evento chegou, nem cookie de histórico") ✅ feito

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

## 12. Visão por visitante + dados reais do Lead (feedback do usuário: "pixel funcionando, agora vamos melhorar") ✅ feito

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

## 13. Bugs fora do escopo de tracking, achados/corrigidos no caminho

Não fazem parte do PRD original, mas surgiram testando o resto do app na mesma sessão:

**Migration `032_user_tags_company_id.sql`** — `addUserTag()` (`src/utils/supabaseProducts.ts`) tentava inserir `company_id` numa coluna que não existia em `user_tags`. Causa raiz: a migration `021_companies_multi_tenant.sql` adiciona `company_id`+RLS por empresa numa lista de tabelas, mas só se a tabela **já existir** naquele momento (checa `information_schema.tables`). Como `user_tags` (migration `011`) nunca tinha rodado neste projeto até o usuário rodar agora (ver seção de Histórico mais acima), a 021 pulou ela silenciosamente — sem `company_id`, com as policies antigas só-por-usuário da 011. A 032 replica manualmente o que a 021 teria feito. Esse tipo de gap (migration condicional que silenciosamente pula tabela ainda não criada) pode se repetir com outras tabelas que historicamente ficaram pra trás — vale desconfiar se aparecer outro erro de "column does not exist" parecido.

Também corrigido: `addUserTag`/`deleteUserTag` lançavam o objeto de erro bruto do Supabase (`throw error`), que não é `instanceof Error` — por isso o toast de erro (corrigido na seção do Histórico) sempre mostrava "erro desconhecido" em vez da mensagem real. Agora fazem `throw new Error(error.message)`.

## 14. Título da página, todos os campos do form, UTM legível (feedback do usuário após ver o drawer funcionando) ✅ feito

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

## 15. Resiliência a migration atrasada + drawer multi-cadastro + rótulo de campo ✅ feito

Depois do deploy da seção 14, a tela de Tracking quebrou ("column events_log.page_title does not exist") porque a migration 033 ainda não tinha rodado no Supabase — deploy de código é automático (`git push`), migration é manual. Corrigido nas duas pontas:
- **Leitura** (`TrackingEventsView.tsx`): `EVENTS_SELECT`/`EVENTS_SELECT_FALLBACK` — se o select com as colunas novas falhar citando uma delas, refaz sem elas em vez de quebrar a tela.
- **Escrita** (`track-event/route.ts`): `insertEvent()` com `OPTIONAL_COLUMN_GROUPS` — generaliza o fallback por grupo de colunas (1 grupo por migration), tentando de novo sem o grupo que faltar. Sem isso o evento era perdido silenciosamente até a migration rodar.
- `pixel.js` também perdeu o cache de 5min (`Cache-Control: no-store`) — o cache fazia o cliente rodar a versão antiga do script por até 5min após cada deploy, gerando falso-negativo ("não captura X") que na real era só script desatualizado.

Depois, feedback de uso: "achei que tava mostrando só o primeiro cadastro" + "quero a URL completa" — `VisitorDrawer` ganhou estado local pra trocar qual cadastro o card "Dados capturados" exibe (clicar num evento "Lead" na jornada troca o card, default = mais recente) e a jornada passou a mostrar a URL completa em vez de só o path.

Por fim: builders tipo Elementor nomeiam o input do form como `form_fields[name]` — `humanizeFieldKey()` extrai o nome de dentro dos colchetes e formata como rótulo (`form_fields[name]` → "Nome:"), com o mesmo ícone/estilo de email/telefone.

## 16. Geolocalização por evento (substitui VisitorAPI) ✅ feito

Pedido: capturar País/Estado/Cidade em todo evento, "lógica inteligente, moderna e prática" — sem reintroduzir um serviço externo tipo VisitorAPI.

**Decisão de arquitetura**: app roda na Vercel (`vercel.json` na raiz), que já resolve geo-IP e injeta nos headers (`x-vercel-ip-country`, `x-vercel-ip-country-region`, `x-vercel-ip-city`) em **toda** requisição, de graça — sem chamada a API externa, sem custo, sem latência extra, sem mandar o IP do visitante pra um terceiro. Lido via `@vercel/functions` (`geolocation(request)`), pacote oficial da Vercel — é a forma documentada de acessar isso desde o Next 15, que removeu `request.geo`/`request.ip`. Só funciona em produção na Vercel; em dev local os 3 campos vêm `null` (não dá pra simular sem deployar, comportamento esperado).

**Migration `034_events_log_geo.sql`**: `events_log.country` (TEXT, código ISO alpha-2 ex. "BR"), `country_region` (TEXT, código do estado ex. "SP"), `city` (TEXT).

**`track-event/route.ts`**: `geolocation(request)` lido uma vez por request, gravado junto no insert. Entra no novo grupo `["country", "country_region", "city"]` de `OPTIONAL_COLUMN_GROUPS` — mesma resiliência da seção 15 se a 034 ainda não tiver rodado.

**`TrackingEventsView.tsx`**: nova coluna "Local" na tabela (1 por visitante, última localização conhecida) e linha de localização em cada evento da jornada no drawer. `flagEmoji()` calcula a bandeira a partir do código ISO no client (sem guardar emoji no banco) e `formatLocation()` monta "🇧🇷 São Paulo, SP · BR".
