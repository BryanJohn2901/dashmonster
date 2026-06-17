# src/app/api/tracking — convenções desta pasta

- Captura (`events_log`) **não depende** de `meta_pixel_id`/`meta_capi_token` — grava sempre que a empresa existe e o domínio bate. Repasse pra Meta CAPI é best-effort, só roda se ambos os campos estiverem preenchidos (senão `capi_status` nasce `"skipped"`, não `"pending"`). Decisão deliberada: testar/usar o pixel próprio não pode depender de ter credenciais Meta reais — não reintroduzir o gate 400 antigo sem entender o motivo.
- Fingerprint (`track-event/route.ts`) é fraco por design: hash de IP+User-Agent, sem cookie/localStorage. É proposital pro MVP (ver `plan.md` na raiz) — não "consertar" virando algo mais robusto sem entender o motivo antes.
- CORS em `track-event` é dinâmico (ecoa o `Origin` da request) porque `companies.dominio_autorizado` é por empresa. `Access-Control-Allow-Origin` só aceita 1 valor estático por resposta — a validação real de domínio acontece na lógica da rota (comparação de hostname), não na camada CORS do browser.
- `dominio_autorizado` guarda só o **hostname**, sem porta nem protocolo (ex: `localhost`, não `localhost:3000` nem `http://localhost:3000`) — `new URL(origin).hostname` nunca inclui porta. Coberto por teste em `__tests__/tracking.test.ts`.
- `companies.meta_capi_token` é distinto de `companies.meta_access_token` (este último é o token de gestão de anúncios já existente nas rotas `src/app/api/meta/*` — não serve pra Conversions API).
- Falha na chamada à Meta CAPI nunca pode virar 500 pro pixel — o pixel sempre recebe resposta rápida (200) independente do resultado do POST pra Meta, pra não travar o submit do form do cliente.
- `pixel.js/route.ts` serve o script via route handler (não `public/pixel.js`) pra poder injetar a origem da API em runtime sem passo de build.
