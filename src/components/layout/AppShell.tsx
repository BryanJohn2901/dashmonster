'use client'

// Shell do CRM. Client component (não Server Component): useCompany (tenancy
// do hub) + crm.ts (dados), padrão do resto do app.
// Gate de entitlement ('pipe' em companies.products) veio do CrmShell.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useCompany, memberAllowedProducts } from '@/hooks/useCompany'
import { supabaseClient } from '@/lib/supabase'
import { fetchPipelines, fetchConversations } from '@/lib/crm'
import { PipelineSettingsModal } from '@/components/pipeline/PipelineSettingsModal'
import { Sidebar, SIDEBAR_COLLAPSED_COOKIE } from './Sidebar'
import { Header } from './Header'
import { DensityProvider } from './DensityProvider'

function readCollapsedCookie(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.split('; ').some((c) => c === `${SIDEBAR_COLLAPSED_COOKIE}=1`)
}

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { company, memberships, isSuperAdmin, loading, switchCompany, companyId } = useCompany()
  const [user, setUser] = useState<{ name: string; email: string; avatarUrl: string | null } | null>(null)
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([])
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0)
  const [createPipelineOpen, setCreatePipelineOpen] = useState(false)
  const [pipelinesVersion, setPipelinesVersion] = useState(0)

  // Usuário: sessão Supabase; sem Supabase (preview) usa o dev fake do hub.
  useEffect(() => {
    if (!supabaseClient) {
      setUser({ name: 'Dev Preview', email: 'dev@preview.local', avatarUrl: null })
      return
    }
    supabaseClient.auth.getUser().then(({ data }) => {
      const u = data.user
      if (!u) return
      setUser({
        name: String(u.user_metadata?.full_name ?? '').trim() || (u.email ?? 'Usuário'),
        email: u.email ?? '',
        avatarUrl: (u.user_metadata?.avatar_url as string | undefined) ?? null,
      })
    })
  }, [])

  // Pipelines da sidebar + não-lidas do inbox.
  useEffect(() => {
    if (!companyId || !company) return
    const hasPipe = memberAllowedProducts(company, user?.email).includes('pipe') || isSuperAdmin
    if (!hasPipe) return
    fetchPipelines(companyId)
      .then((list) => setPipelines(list.map((p) => ({ id: p.id, name: p.name }))))
      .catch(() => {})
    fetchConversations(companyId)
      .then((convs) => setInboxUnreadCount(convs.reduce((sum, c) => sum + c.unreadCount, 0)))
      .catch(() => {})
  }, [companyId, company, isSuperAdmin, pipelinesVersion, user])

  const handleSwitchCompany = useCallback((id: string) => {
    switchCompany(id)
  }, [switchCompany])

  if (loading) {
    return <Centered><p className="text-sm text-slate">Carregando…</p></Centered>
  }

  if (!company || !companyId) {
    return (
      <Centered>
        <p className="text-sm font-medium text-geyser">
          Faça login e escolha uma empresa para abrir o CRM Monster.
        </p>
        <BackToHub />
      </Centered>
    )
  }

  // Entitlement da empresa ∩ restrição por membro (settings.memberProducts).
  const hasPipe = memberAllowedProducts(company, user?.email).includes('pipe') || isSuperAdmin
  if (!hasPipe) {
    return (
      <Centered>
        <h1 className="text-xl font-semibold text-[#F7F9FA]">CRM Monster não contratado</h1>
        <p className="max-w-md text-center text-sm text-geyser">
          A empresa <strong>{company.name}</strong> ainda não tem o CRM Monster ativo.
          Fale com o suporte para liberar o CRM.
        </p>
        <BackToHub />
      </Centered>
    )
  }

  const workspaces = memberships.map((m) => ({
    id: m.company.id,
    name: m.company.name,
    initials: '',
    hasPipe: memberAllowedProducts(m.company, user?.email).includes('pipe') || isSuperAdmin,
  }))

  return (
    <div className="flex h-screen overflow-hidden bg-bunker text-geyser">
      <DensityProvider />
      <Sidebar
        companyId={companyId}
        workspaces={workspaces}
        currentWorkspaceId={companyId}
        onSwitchWorkspace={handleSwitchCompany}
        user={user}
        pipelines={pipelines}
        inboxUnreadCount={inboxUnreadCount}
        initialCollapsed={readCollapsedCookie()}
        onCreatePipeline={() => setCreatePipelineOpen(true)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          companyId={companyId}
          workspaces={workspaces}
          currentWorkspaceId={companyId}
          onSwitchWorkspace={handleSwitchCompany}
          user={user}
          pipelines={pipelines}
          inboxUnreadCount={inboxUnreadCount}
          onCreatePipeline={() => setCreatePipelineOpen(true)}
        />
        <main className="flex-1 overflow-y-auto p-5 lg:p-8" style={{ background: '#0B0D11' }}>{children}</main>
      </div>

      <PipelineSettingsModal
        open={createPipelineOpen}
        onOpenChange={setCreatePipelineOpen}
        pipeline={null}
        onSaveSuccess={() => {
          setCreatePipelineOpen(false)
          setPipelinesVersion((v) => v + 1)
        }}
      />
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bunker px-6">
      {children}
    </div>
  )
}

function BackToHub() {
  return (
    <Link
      href="/"
      className="rounded-xl px-4 py-2 text-sm font-semibold text-bunker transition hover:brightness-105"
      style={{ background: '#c6f432' }}
    >
      Voltar ao Monster Hub
    </Link>
  )
}
