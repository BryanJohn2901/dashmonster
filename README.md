<div align="center">

# 🐉 DashMonster

### Dashboard analítico para Meta Ads — sem planilha, sem exportação, sem enrolação.

[![Deploy on Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel)](https://vercel.com/new/clone?repository-url=https://github.com/BryanJohn2901/DashMonster)
[![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=next.js)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com)
[![Meta Ads API](https://img.shields.io/badge/Meta%20Ads-Graph%20API%20v21-0866FF?logo=meta)](https://developers.facebook.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## Antes / Depois

<table>
<tr>
<td width="50%">

**😩 Sem DashMonster**

- Exporta relatório no Gerenciador de Anúncios
- Abre planilha, cola os dados, formata as colunas
- Calcula ROAS, CPA e ROI à mão (ou com fórmula)
- Faz isso de novo semana que vem
- Repete para cada cliente / cada conta
- Perde tempo com tarefa que não gera resultado

</td>
<td width="50%">

**🐉 Com DashMonster**

- Coloca o token da Meta uma vez
- Adiciona a conta de anúncios (`act_...`)
- Clica **Sincronizar agora**
- ROAS, CPA, ROI, CTR, funil — tudo calculado
- Atualiza sozinho a cada hora
- Foca no que importa: a estratégia

</td>
</tr>
</table>

---

## O que você ganha

| Feature | O que faz |
|---|---|
| **KPIs em tempo real** | ROAS, CPA, ROI, CTR, CPM, CPC — calculados automaticamente pela API |
| **Funil de conversão** | Impressões → Cliques → Visitas → Leads → Vendas com taxa em cada etapa |
| **Múltiplas contas** | Gerencie N contas Meta Ads em um único login |
| **Filtro por período** | 7, 15, 30, 60, 90 dias ou máximo (2 anos) — você escolhe |
| **Filtro por campanha** | Selecione campanhas específicas; o dashboard filtra automaticamente |
| **Categorias de produto** | Pós-grad, Livros, Ebooks, Perpétuo, Eventos + categorias personalizadas |
| **Perfis de anunciante** | Perfil separado por cliente ou produto com análise individual |
| **Análise de criativos** | Identifique quais peças geram mais resultado |
| **Histórico de performance** | Série temporal de qualquer métrica, compare períodos |
| **Tema claro / escuro** | Toggle automático, interface limpa |
| **Sincronização automática** | Dados atualizados a cada hora sem você precisar fazer nada |

---

## Benchmarks — tempo gasto por semana

| Tarefa | Sem DashMonster | Com DashMonster | Economia |
|---|---|---|---|
| Relatório semanal de 1 cliente | ~40 min | ~2 min | **95%** |
| Analisar 5 contas diferentes | ~3 h | ~10 min | **94%** |
| Calcular ROAS / CPA de campanha | ~15 min | Instantâneo | **100%** |
| Montar funil de conversão | ~30 min | Automático | **100%** |
| Comparar período A vs B | ~20 min | ~1 min | **95%** |

---

## Como funciona

```
1. Conecta o token da Meta Ads API (System User Token)
         │
         ▼
2. Adiciona as contas de anúncios no Painel de Controle (act_...)
         │
         ▼
3. Sincroniza (automático a cada hora ou manual)
         │
         ▼
4. Dashboard atualizado com KPIs, funil, gráficos e filtros
         │
         ▼
5. Você toma decisões — o DashMonster cuida dos números
```

---

## Setup

### Pré-requisitos
- Node.js >= 22
- Conta no [Supabase](https://supabase.com) (grátis)
- [Token da Meta Graph API](https://developers.facebook.com) — use **System User Token** para não expirar

### 1. Clone e instale

```bash
git clone https://github.com/BryanJohn2901/DashMonster.git
cd DashMonster
npm install
```

### 2. Variáveis de ambiente

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxx...
```

### 3. Migrations no Supabase

Acesse **Supabase → SQL Editor** e rode os arquivos em ordem:

```
supabase/migrations/001_historical_data.sql
supabase/migrations/002_auth_shared_dashboard.sql
supabase/migrations/003_fix_data_api_grants_and_realtime.sql
supabase/migrations/004_create_missing_tables.sql
supabase/migrations/005_campaign_metrics_upsert_constraint.sql
supabase/migrations/006_campaign_creatives.sql
supabase/migrations/007_user_categories.sql
supabase/migrations/008_user_account_internal_filter.sql
supabase/migrations/009_security_linter_fixes.sql
```

### 4. Rode

```bash
npm run dev
# http://localhost:3000
```

### 5. Configure no app

1. Faça login / crie conta
2. **Painel de Controle** → aba **Integrações** → cole o token → Salvar
3. Aba **Contas** → adicione `act_...` na categoria correta
4. Aba **Sincronização** → clique **Sincronizar agora**
5. Dados aparecem em segundos ✅

---

## Deploy na Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/BryanJohn2901/DashMonster)

Após importar o repositório, configure em **Settings → Environment Variables**:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

---

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16.2 (App Router + Turbopack) |
| UI | React 19 + Tailwind CSS v4 |
| Banco | Supabase (PostgreSQL + RLS + Realtime) |
| Auth | Supabase Auth |
| Gráficos | Recharts |
| Ícones | Lucide React |
| API de dados | Meta Ads Graph API v21.0 |
| Deploy | Vercel |

---

## Estrutura

```
src/
├── app/
│   ├── api/meta/insights/   # Proxy para a Meta Graph API
│   └── page.tsx             # Root — orquestra sync, auth e dashboard
├── components/
│   ├── Dashboard.tsx        # KPIs, gráficos, filtros, funil
│   ├── ControlPanel.tsx     # Config de contas, token e sync
│   └── ProfileAnalysis.tsx  # Análise por perfil de anunciante
├── hooks/
│   ├── useCampaignStore.ts  # Estado global (localStorage + Supabase)
│   └── useAdvertiserStore.ts
├── utils/
│   ├── metaApi.ts           # Cliente Meta Graph API
│   └── supabaseCategories.ts
└── supabase/migrations/     # Schema SQL versionado (001–009)
```

---

## Contribuindo

1. Fork o projeto
2. Crie uma branch: `git checkout -b feature/minha-feature`
3. Commit: `git commit -m 'feat: minha feature'`
4. Push: `git push origin feature/minha-feature`
5. Abra um Pull Request

---

<div align="center">
  <br/>
  <strong>Feito para quem leva tráfego a sério. 🐉</strong>
  <br/><br/>
  <sub>Dados reais. Decisões reais. Resultado real.</sub>
</div>
