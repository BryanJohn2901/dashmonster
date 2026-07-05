# PipeFlow → Monster Hub: Plano de Integração

> Decisão (2026-07-02): **fusão completa** do PipeFlow CRM no dashmonster.
> Fonte: https://github.com/wesley-wmb/pipeflow-crm.git (Next 14 / React 18 / TW 3, 272 arquivos TS, 33 tabelas)
> Destino: este repo (Next 16 / React 19 / TW 4). Stripe/billing do PipeFlow: **removido** — acesso é
> decidido pelo super admin via `companies.products` (migration 071, `ProdutosAdminSection` no HubSettings).

## Princípios

1. **Tenancy única**: `workspaces`/`workspace_members`/`workspace_invites` do PipeFlow NÃO são portadas.
   Toda tabela do CRM ganha `company_id` (era `workspace_id`) referenciando a nossa `public.companies`.
   RLS reusa os helpers existentes: `is_company_member(cid)`, `can_write_company(cid)`, `is_super_admin()`.
2. **Papéis**: owner/manager/viewer (nossos) substituem owner/admin/member (deles).
   manager ≈ admin; viewer = leitura (conferir telas que assumem "member" pode escrever).
3. **Sem billing**: nada de Stripe, planos free/pro ou limites (`lib/limits.ts` deles morre).
   Empresa com `'pipe'` em `companies.products` = acesso total.
4. **Sem landing/register/onboarding** do PipeFlow: auth e criação de empresa já existem no dash.
5. **Gate de produto**: rotas do CRM só abrem se a empresa ativa tem `'pipe'` contratado
   (mesmo padrão do `canOpenProduct` em `src/config/products.ts`).

## Colisões de nome (verificado 2026-07-02)

| Tabela PipeFlow | Conflito no dash | Resolução |
|---|---|---|
| `companies` (contas B2B dos leads) | `companies` (tenants) | renomear → **`crm_companies`** |
| `leads` | `leads` (leads Meta/planilha) | renomear → **`crm_leads`** |
| demais 31 tabelas | sem conflito | manter nome em `public` |

Tabelas que NÃO vêm: `workspaces`, `workspace_members`, `workspace_invites`,
`dashboard_stage_mappings` (dropada por eles na 20260615).

## Fases

### Fase 0 — Fundações (imediato)
- [ ] Resolver numeração duplicada: existem `071_company_products.sql` E `071_tracking_pixels_webhook_secret.sql`.
      Próxima migration é **072**; não renomear as já aplicadas no Supabase.
- [ ] `src/config/products.ts`: adicionar campo de rota ao `ProductDef` (ex.: `path: "/crm"`).
      `pipe` continua `status: "soon"` até a Fase 2 funcionar.

### Fase 1 — Schema (migration 072_pipeflow_schema.sql, consolidada) ✅ escrita 2026-07-02
Consolidada em `supabase/migrations/072_pipeflow_schema.sql` — **pendente de rodar no SQL Editor**:
- [x] Núcleo: `crm_leads`, `crm_companies`, `deals`, `pipelines`, `pipeline_stages`, `deal_activities`,
      `deal_history`, `deal_tags`, `tags`, `activities`, `profiles` (nome do usuário), `custom_field_definitions/values`
- [x] `workspace_id` → `company_id references public.companies on delete cascade` em tudo;
      FK "conta B2B" renomeado para `crm_company_id` (em `crm_leads` e `deals`)
- [x] Enums prefixados: `crm_lead_status`, `crm_activity_type`, `crm_playbook_activity_type`,
      `crm_deal_history_event`, `crm_custom_field_type`, `crm_custom_field_entity`
- [x] RLS padrão da casa: select `is_company_member(company_id)`, write `can_write_company(company_id)`;
      `pipeline_stages` herda empresa via subquery em `pipelines`
- [x] Sem: colunas stripe_*, plan, tabelas de workspace
- [x] `profiles` + trigger `trg_create_profile` em auth.users (convive com `trg_materialize_invites` da 025) + backfill
- [x] `pipeline_stage_activities` ENTROU na 072 (FK de `deal_activities.source_template_id` exige) —
      só a tabela; playbooks avançados continuam na fase 4
- [ ] **Rodar a 072 no Supabase SQL Editor**
- [ ] Adiar p/ fase 4: `channel_connections`, `conversations`, `messages` (inbox),
      `api_tokens`, `webhook_subscriptions`, `webhook_delivery_logs`, `inbound_webhooks` (API pública),
      `playbooks`, `playbook_activities`, `pipeline_members`,
      `dashboards`, `dashboard_widgets`, `dashboard_goals`, `notifications`, `notification_preferences`

**Nota RLS**: `viewer` fica somente-leitura no CRM (padrão da casa). Se vendedor precisar
escrever deals sendo `viewer`, revisar na Fase 2 (ex.: policy própria p/ `deals`/`deal_activities`).

### Fase 2 — Núcleo CRM no app (Next 16 / React 19 / TW 4) — MVP Kanban ✅ 2026-07-02
- [x] **Zero deps novas no MVP**: drag-and-drop nativo HTML5 (a ordem dos cards na coluna não é
      persistida no original — dnd-kit só se precisarmos de touch/polish), sem zod/rhf por ora
- [x] Estrutura: `src/app/crm/page.tsx` + `src/components/crm/PipelineBoard.tsx` + `src/lib/crm.ts`
- [x] Data layer client-side (`src/lib/crm.ts`), padrão useCompany: fetchPipelines, ensureDefaultPipeline
      ("Funil Principal" + 6 etapas no 1º acesso de quem escreve), fetchDeals, createDeal, moveDeal
      (status sync + stage_entered_at + deal_history), deleteDeal
- [x] Gate em /crm: sem `'pipe'` em products → tela "não contratado"; viewer = somente leitura
- [x] Detalhe do negócio — MVP `src/components/crm/DealDetailSheet.tsx` (3 abas: Negócio com
      campos editáveis save-on-blur, Contato com buscar/criar/vincular crm_leads, Histórico
      via deal_history). Jornada de etapas clicável no header. Faltam do original: aba
      Atividades/playbook, aba Empresa (crm_companies), Notas, Mensagens, custom fields,
      navegação entre deals, reatribuir dono
- [x] Aba Atividades no sheet (deal_activities): criar (9 tipos com ícone + agendamento),
      concluir/reabrir (grava activity_completed no histórico), excluir; ordenação
      atrasada → hoje → futura → sem data → concluída
- [x] Card do board: contador ✓ feitas/total (vermelho quando há atrasada), sincronizado
      com o sheet sem refetch
- [ ] Templates de cadência por etapa (pipeline_stage_activities + instanciar ao mover) — Fase 4
- [x] Contatos em /crm/leads (`src/components/crm/LeadsView.tsx`): busca com debounce
      (nome/empresa/e-mail, sanitizada como no original), filtro por status (6 chips),
      tabela, painel lateral de edição save-on-blur (+status +notes), criar contato,
      excluir, "criar negócio na Pipeline" (createDealFromLead: 1º funil, 1ª etapa)
- [x] `CrmShell` compartilhado: gate de entitlement + topbar com navegação Pipeline/Contatos
      (páginas /crm e /crm/leads usam via render prop)
- [x] Editor de funil (`src/components/crm/PipelineSettingsModal.tsx`): criar/editar/excluir
      funil, etapas com renomear/reordenar (setas)/cor/papel, validação 1 ganha + 1 perdida,
      updatePipeline portado (reset de status_kind → reaplicar → mover deals won/lost pra
      etapa terminal → re-sync status); excluir bloqueado se funil tem negócios
- [x] Tags: chips no card (até 3 + contador), editor na aba Negócio do sheet
      (toggle nas tags da empresa + criar inline com cor rotativa); lib: fetchTags,
      createTag, fetchDealTags, addDealTag, removeDealTag; fetchDeals traz tags via join
- [x] Dashboard CRM em /crm/dashboard (`src/components/crm/CrmDashboard.tsx`):
      4 cards (contatos, abertos+valor, ganhos+valor, conversão = ganhos÷encerrados)
      + funil por etapa com barras (contagem/valor) e seletor de pipeline;
      nav do CrmShell ganhou a 3ª aba
- [ ] Duplicados (findDuplicateDeals/findDuplicateLeads ao criar)
- [x] Modo demo do CRM: `src/lib/crm.ts` virou fachada (Supabase configurado →
      `crmSupabase.ts`; sem Supabase → `crmDemo.ts` em memória, seed com funil de 6
      etapas, 6 negócios, 4 contatos, tags, atividades — incl. 1 atrasada — e histórico).
      `const impl: typeof real = ...` garante assinaturas idênticas via tsc.
      Requer modo DEV ativo (mesma regra das empresas demo do useCompany)

### Fase 2.5 — Identidade visual original (Nexo) ✅ 2026-07-02
Decisão do usuário: CRM usa a identidade ORIGINAL do PipeFlow, não os tokens dm-* do hub.
- [x] `src/components/crm/theme.ts` — tokens Nexo: dark absoluto #0B0D11 (bunker),
      superfícies #151A20/#1B222A/#222A31, acento canary #C6F432 (texto escuro em cima),
      danger #FF6B6B, bordas por luminosidade (sem sombras pesadas)
- [x] CrmShell reescrito: sidebar lateral 232px (logo P canary, nav com ícones,
      badge somente-leitura, "Monster Hub" no rodapé) — como o AppShell original
- [x] Reskin dos 5 componentes (swap mecânico: dm-* → hexes Nexo, verde → canary,
      sombras → anel de luminosidade). CRM é dark independente do tema do dash.

### Fase 4 — Recriação completa (decisão 2026-07-03: portar o sistema INTEIRO)
**Onda 1 ✅ (2026-07-03):**
- [x] Migration `073_pipeflow_full.sql` — **pendente de rodar no SQL Editor**: inbox omnicanal
      (channel_connections/conversations/messages + realtime), notifications (+preferences,
      RLS por usuário), playbooks nomeados, pipeline_members, dashboards/widgets/goals,
      api_tokens, webhooks (out/logs/inbound). Enums crm_*. Sem dashboard_stage_mappings (dropada no original)
- [x] Aba Notas no sheet (deal_history note_added, como o original)
- [x] Aba Empresa no sheet (crm_companies: buscar/criar/vincular/editar)
- [x] Calendário em /crm/calendario (agenda 30d + atrasadas, concluir inline) + nav na sidebar
- [x] Playbook engine: cadência por etapa (editor ⚡ no modal de funil → pipeline_stage_activities);
      instantiateStagePlaybook idempotente chamado em moveDeal/createDeal (real e demo)

**Onda 2 ✅ parcial (2026-07-03):** migration 073 RODADA no Supabase.
- [x] Inbox UI (/crm/inbox): lista de conversas (ícone por provedor, não-lidas, tempo),
      thread com bolhas + status ✓✓, chips Aberta/Pendente/Resolvida, composer
      (grava outbound no banco e atualiza preview; DISPARO real pelo provedor = fase
      de integrações), estado vazio orientando conexão de canal
- [x] Notificações: sino no rodapé da sidebar com badge de não-lidas, dropdown com
      lista, marcar uma/todas lidas (RLS por usuário)

**Onda 3 ✅ (2026-07-03):**
- [x] Custom fields fim-a-fim: manager em /crm/config (criar por entidade deal/contact/company,
      11 tipos, opções de select, desativar=soft delete) + `CustomFieldsInline` renderizando
      nos sheets (aba Negócio e Contato), save on blur/change, upsert em custom_field_values
- [x] /crm/config (item Configurações na sidebar): Tags (renomear inline, cor por clique,
      excluir, criar), Campos personalizados, Canais (lista provedores + status; conexão real
      = fase de integrações)
- [x] Metas do mês no Dashboard (dashboard_goals global): card com progresso Leads/Vendas/Receita
      (realizado = leads criados no mês + won com stage_entered_at no mês), editor modal p/ owner/manager

**Onda 4 ✅ parcial (2026-07-03):**
- [x] Notificações automáticas: mover negócio notifica o DONO (se outra pessoa moveu) —
      `notifyDealOwner` em moveDeal, insert direto (policy notifications_member_insert)
- [x] Duplicados: aviso âmbar em tempo real no quick-add do board (findDuplicateDeals por
      pipeline) e no criar contato (findDuplicateLeads por nome/e-mail)
- [x] Config → API: gerar token `pf_…` (sha256 no banco via crypto.subtle, valor em claro
      mostrado UMA vez com copiar), listar, revogar
- [x] Config → Webhooks: criar (nome + URL https + eventos deal.*/lead.*), pausar/ativar,
      excluir; secret `whsec_…` gerado no cliente; CRM_WEBHOOK_EVENTS compartilhado

**Onda 5 (restante):**
- [ ] Rotas server da API v1 (/api/crm/v1/leads|deals, Bearer pf_… → api_tokens via hash,
      supabaseAdmin) + dispatcher de webhooks out (rota interna assina HMAC e entrega + log)
- [ ] Integrações reais de canal: Z-API / WhatsApp Cloud / IG (envs + webhooks de entrada)
- [ ] Dashboard builder (widgets custom) — tabelas prontas na 073
- [ ] Lembretes de atividade (activity_reminder) — precisa cron (Vercel Hobby = diário)
- [ ] Command palette (Ctrl+K); sidebar colapsável; multi_select real

### Fase 3 — Hub “live” ✅ 2026-07-03
- [x] `products.ts`: `pipe` → `status: "live"`
- [x] `ProductSelectScreen.tsx`: `PipeCard` ganha variante contratada (botão "Abrir PipeFlow" → rota CRM);
      teaser "Em breve" permanece para empresas sem o produto
- [x] `page.tsx`: handler `onOpenPipe` (`router.push("/crm")` — não marca PRODUCT_CHOSEN: voltar ao "/" reabre o hub)
- [x] Demo: `demo-1` (useCompany) ganhou `"pipe"` em products p/ testar o fluxo sem Supabase
- [ ] Super admin liga `'pipe'` na empresa REAL → CRM abre já funcional (pipeline default criada on-first-access)

### Fase 4 — Módulos avançados (cada um é um projeto)
- [ ] Inbox multi-canal (WhatsApp Z-API, WhatsApp Cloud, Instagram DM) — exige envs/webhooks próprios
- [ ] Playbooks / automações
- [ ] Dashboard builder + goals
- [ ] Notificações + preferências
- [ ] API pública v1 + webhooks out
- [ ] Calendário
- [ ] Cron (atenção: Vercel Hobby só aceita cron diário)

### Fase 5 — PORT FIEL da UI original (decisão 2026-07-03: usuário rejeitou a UI recriada)
O CRM deve SER o PipeFlow original (layout/telas idênticos), exceto: configurações de
conta/empresa e liberação do produto ficam no padrão Monster Hub (super admin liga `pipe`
em `companies.products`; sem workspace/billing/Stripe do original).

**Arquitetura do port:**
- Paths idênticos aos do original para copiar componentes com edição mínima:
  `src/components/ui/*` (20 primitivos shadcn/base-ui copiados), `src/lib/utils(.ts|/cn|/formatters|/constants|/playbook-constants)`,
  `src/components/layout/*` (shell), depois `src/components/{pipeline,leads,dashboard,...}`.
- Deps novas instaladas: @base-ui/react, @radix-ui/react-label, cva, clsx, tailwind-merge,
  @dnd-kit/core+utilities, date-fns, react-day-picker, sonner, tw-animate-css, rhf, resolvers, zod.
- CSS: tokens Nexo escopados em `.pf-app` (`src/app/crm/crm.css` + blocos @theme/@theme inline
  no globals.css com fallback — fora do /crm nada muda). Tipografia 14px-base e raios 12px-base
  do original valem só dentro de .pf-app via vars --pf-*.
- **Adapter de dados**: componentes originais chamavam server actions (`@/lib/actions/*`).
  Aqui viram libs client `src/lib/actions/*.ts` com OS MESMOS nomes/shapes (snake_case),
  delegando para a fachada `crm.ts` (real crmSupabase / demo crmDemo — demo continua vivo).
  Campos que faltam na fachada são ADICIONADOS a ela (paridade demo forçada por `typeof real`).
  Tenant: `getCompanyContext()` resolve a empresa ativa (era getActiveWorkspaceId).
- app/crm/layout.tsx monta AppShell (gate de 'pipe' + sidebar/header originais);
  CrmShell virou pass-through {companyId, canWrite} até cada página ser portada.

Progresso (tasks da sessão 2026-07-03):
- [x] 1. Fundação: deps + tokens + ui/* + cn (tsc limpo)
- [x] 2. Shell fiel: AppShell/Sidebar/SidebarNav/Header/UserMenu/WorkspaceSwitcher(=empresas hub)/
      NotificationBell/CommandPalette (globalSearch novo na fachada) — verificado no preview
- [x] 3. Pipeline/Kanban fiel ✅ — components/pipeline/{KanbanBoard,KanbanColumn,DealCard,DealForm,
      PipelineSettingsModal,KanbanBoardSkeleton} copiados (edições: rotas /crm/*, prop onRefresh
      no lugar de router.refresh de RSC). Adapters novos: lib/actions/{deals,pipelines,inbox}.ts;
      CrmDeal ganhou leadId/leadCompany/leadPhone/leadEmail/temperature/expectedCloseDate/dueDate/
      updatedAt (real+demo); crm updateDeal aceita dueDate; fetchDeals(pipelineId opcional).
      Board em /crm/pipeline; /crm → redirect /crm/dashboard; types shim src/types/supabase.ts.
      DealDetailSheet = stub (task 4). Verificado: board rende, form cria negócio.
- [x] 4. DealDetailSheet completo ✅ — 11 comps copiados (deal-detail/*: ContactTab, CompanyTab,
      DealInfoTab, HistoryTab, NotesTab, CustomFieldsManagerModal, CustomFieldsInline +
      ActivityUnifiedModal/ActivityEditorModal/ActivityScheduleModal/PlaybookSelectorModal).
      Fachada ganhou playbooks nomeados completos (createPlaybook/deletePlaybook/
      addPlaybookActivity/updatePlaybookActivity/deletePlaybookActivity, real+demo) e deal
      estendido com company_id/utm_*/acquisition_channel/landing_page_url/proposal|payment|
      scheduling|contract_url (real+demo). Shim custom-fields ganhou group_name/placeholder.
      MessagesPanel stub ganhou prop workspaceId. Corrigido bug de "setState durante render"
      (onUpdate chamado dentro do updater de setDeal) em syncActivityCounts/applyDealPatch.
      Verificado no preview: sheet abre a partir do card, 7 abas renderizam, sem erros no console.
- [x] 5. Dashboard Indicadores ✅ — DashboardBuilder.tsx portado quase verbatim (só trocou
      router.refresh() por prop onRefresh, sem RSC). O "builder" de widgets/templates do
      original é código morto (DashboardBuilder.tsx nunca lê data.widgets/templates) —
      ponytail: não portado. Novo adapter lib/actions/dashboard.ts recalcula overview/funil
      client-side sobre getDeals()+getLeads()+fetchCompanyDealActivities/History (bulk,
      novas na fachada). Metas (dashboard_goals) ganharam suporte a pipelineId + annualRevenue
      (fetchGoal/saveGoal/fetchGoals, real+demo); filtros de período persistem em
      localStorage (sem tabela dashboards). Verificado no preview: abas Visão geral/Funil,
      gauges de meta, ritmo com meta por vendedor, diagnóstico do funil — tudo com dados demo.
- [x] 6. Leads fiel ✅ — components/leads/* (LeadsView, LeadList, LeadCard,
      LeadFilters, LeadForm, LeadStatusBadge, LeadProfile, LeadContentTabs,
      LeadDetailClient, ActivityTimeline, ActivityForm) copiados. LeadFilters e
      LeadForm/Profile perderam RSC (searchParams/router.refresh) → viraram
      controlados com props search/status/onRefresh (mesmo padrão onRefresh do
      resto do port). Novo: tabela `activities` (timeline legada do lead, distinta
      de deal_activities) ganhou fachada fetchLeadActivities/createLeadActivity
      (real+demo) + adapter lib/actions/activities.ts. CrmLead ganhou
      estimatedValue; createLead/updateLead aceitam crmCompanyId/estimatedValue.
      LeadRow.company_id é alias de crm_company_id (empresa B2B vinculada, não o
      tenant) — mesmo padrão do ContactOption. Corrigido mojibake (UTF-8 dupla
      codificação) herdado do LeadForm.tsx original. Rotas /crm/leads e
      /crm/leads/[leadId] (client, useParams). Verificado no preview: lista com
      4 leads demo, detalhe abre, registrar atividade funciona e atualiza a
      timeline sem erros no console.
- [x] 7. Calendário e Inbox ✅ — Calendário 100% fiel: rota movida de /crm/calendario
      para /crm/calendar (nav atualizada), CalendarView+QuickCreateActivityModal
      copiados quase verbatim (só troca router.refresh() por refetch local).
      Novo adapter lib/actions/calendar.ts (getCalendarActivities/getCalendarMembers)
      sobre fetchCompanyDealActivities; membros derivados dos donos de negócio
      (sem tabela workspace_members). CrmActivity ganhou assignedTo/reminderAt
      (real+demo) + getDealsForSelect em deals.ts.
      Inbox: PARCIAL fiel — ConversationList/ConversationItem/ChatWindow/
      MessageBubble/ResizableDivider copiados verbatim (novo lib/actions/inbox.ts
      mapeando CrmConversation/CrmMessage → shape snake_case original).
      MessagesPanel (aba do DealDetailSheet/lead) agora real (não é mais stub).
      SmartChatTimeline e LeadLinker AGORA PORTADOS (fiel): timeline unificada
      (mensagens+notas+tarefas, useChatTimeline sem realtime — reload após
      ações) no InboxView e no MessagesPanel; LeadLinker cria lead+negócio no
      funil/etapa escolhidos (createInboxContact ganhou pipelineId/stageId e a
      fachada ganhou linkConversationLead real+demo), mostra o negócio
      (getDealForPanel no adapter deals) e troca status Ganho/Perdido/Aberto.
      Segue fora: TemplatePicker (modelos WhatsApp Cloud — credenciais Meta) e
      upload de anexo (rota externa; botão avisa).
- [x] 8. Painel Admin full-screen (/admin) + Configurações do hub enxuto.
      Novo src/app/admin/page.tsx (guard: isSuperAdmin OU senha DEV via
      useDevMode.enable) + src/components/admin/{AdminPanel,sections,
      CreateCompanyWizard}.tsx. Layout 3 colunas (rail ícones | sidebar nav com
      busca | conteúdo; overview em cards). Seções: Empresas (fetchAdminCompanies,
      rename, chips de produtos/token), Produtos & acessos (setCompanyProducts),
      Usuários & papéis (fetchCompanyMembers/updateMemberRole/removeMember),
      Convites (inviteMemberByEmail + título "de RH" em settings.memberTitles),
      Conexão Meta (fetchCompanyToken/setCompanyToken + status geral), Contas de
      anúncio (user_account_entries RO + sugestões em settings), Instagram
      (settings.instagramHandle), Filtros & histórico (settings.companyFilters
      [{id,name,subfilters}] + customHistoryTabs). Wizard criar empresa: Nome →
      Abas histórico → Filtros/subfiltros → Equipe (2 donos máx; Analista/Gestor
      de tráfego/Designer/Visualizador → owner/manager/viewer no banco, título em
      memberTitles) → Revisar. HubSettings agora só: Perfil, Geral, Histórico,
      Tracking, Colaboradores, Acesso DEV + link "Painel Admin" (super admin/dev).
      ponytail: seções antigas do HubSettings (Conexão/Contas/Instagram/Filtros/
      Produtos/CriarEmpresa) viraram código morto no arquivo — remover na task 9.
      Configurações CRM (/crm/settings/*) segue pendente (movida pra task 9+).
- [x] 9. Limpeza: apagados 8 componentes crm simplificados substituídos
      (CalendarView, CrmDashboard, CustomFieldsInline, DealDetailSheet, InboxView,
      LeadsView, PipelineBoard, PipelineSettingsModal — versões antigas de
      src/components/crm/). Ficam: CrmShell (gate de todas as páginas /crm),
      ConfigView + theme.ts (config simplificada em /crm/config até o port fiel
      de /crm/settings/*). HubSettings reescrito enxuto (515→~490 linhas): morreram
      CriarEmpresaSection, ProdutosAdminSection, FiltrosEditor, FacebookConnectShell,
      InstagramShell + ícones — tudo vive no /admin agora.
      PENDENTE (fora do escopo desta task): port fiel de /crm/settings/*
      (tags, custom-fields, channels, developers, notifications, data).
- [x] 10. Port fiel: /crm/settings/* — layout + SettingsNav (sem account/billing/
      workspace → link "Conta & Empresa (Hub)"; sem modelos WhatsApp).
      Páginas client (padrão CrmShell): tags (TagsManager verbatim + adapter
      lib/actions/tags.ts; ponytail: usageCount=0), custom-fields
      (CustomFieldsManager verbatim; ponytail: is_required só no form — coluna não
      existe na 072), notifications (NotificationPreferences verbatim + adapter em
      localStorage — e-mail nem dispara ainda), data (DataExport/DataImport
      verbatim + adapter data.ts sobre getLeads/createLead; sem limite de plano),
      channels (ChannelCard fiel + página enxuta — ChannelsSettingsClient original
      é 100% OAuth Meta/FB SDK, fica pra quando houver credenciais; adapter
      channels.ts read-only), developers (DeveloperSettingsClient verbatim +
      adapters api-tokens.ts/webhook-subscriptions.ts sobre a fachada;
      inbound-webhooks.ts é stub — exige endpoint público, Onda 5; delete de
      token = revoke). Novos shims: types/channel-connections.ts; copiados
      lib/api/scopes.ts, lib/webhooks/events.ts, lib/constants/notifications.ts.
      Sidebar "Configurações" → /crm/settings/notifications; /crm/config +
      ConfigView + theme.ts APAGADOS (só CrmShell sobrou em components/crm).

## Riscos conhecidos
- Next 16 tem breaking changes vs treinamento — ler `node_modules/next/dist/docs/` antes de portar cada padrão
- React 19: `useFormState` → `useActionState`, refs, etc.
- Papel `viewer` nosso é mais restrito que `member` deles — revisar cada action de escrita
- Volume: 272 arquivos TS na origem; portar por feature, nunca por arquivo

## Referência local
Clone raso para consulta: re-clonar quando preciso —
`git clone --depth 1 https://github.com/wesley-wmb/pipeflow-crm.git`
Docs úteis no repo deles: `docs/PRD.md`, `docs/SETTINGS_PLAN.md`, `docs/ai/compatibility-map.md`
