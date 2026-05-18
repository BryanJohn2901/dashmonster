# Analytics PTA

Dashboard de campanhas com autenticacao via Supabase, importacao por Google Sheets/CSV/Meta e dados compartilhados entre usuarios.

## Rodar localmente

```bash
npm install
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

## Configurar Supabase (obrigatorio)

1. Crie um projeto no Supabase.
2. No `SQL Editor`, execute o arquivo:
   - `supabase/migrations/002_auth_shared_dashboard.sql`
3. Em `Project Settings > API`, copie:
   - `Project URL`
   - `anon public key`
4. Crie um `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_ANON_PUBLIC_KEY
```

5. Reinicie o `npm run dev`.

## Login inicial

- Usuario no app: `admin`
- Senha no app: `admin`

O app converte internamente para o usuario seed no Supabase.

## Deploy na Vercel

1. No Supabase, aplique as migrações em `supabase/migrations/` (por ordem numérica) no SQL Editor ou via CLI. Inclua pelo menos `002_auth_shared_dashboard.sql` e, para leads no dashboard, `013_campaign_metrics_leads.sql` (depois use **Atualizar Meta** no app).
2. Na Vercel: **Add New > Project**, importe o repositório.
3. Deixe o preset **Next.js** (build `npm run build`, install com `npm ci` se existir `package-lock.json`).
4. **Node:** o repositório define `engines.node` e `.nvmrc` (22+); a Vercel usa isso automaticamente.
5. Em **Settings > Environment Variables** (Production e Preview), copie de `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Opcionais: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_AUTH_MIDDLEWARE_TIMEOUT_MS`
6. **Deploy**. Após alterar env ou migrações no Supabase, faça **Redeploy**.
7. Antes de subir código: `npm run build` local deve concluir sem erros de TypeScript.

## Observações

- Somente chaves publicas (`NEXT_PUBLIC_*`) no frontend.
- Nunca use `SUPABASE_SERVICE_ROLE_KEY` no cliente.
