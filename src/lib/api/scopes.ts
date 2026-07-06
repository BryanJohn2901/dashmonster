export const SCOPES = {
  ACCOUNT_READ:      'account:read',
  USERS_READ:        'users:read',
  CONTACTS_READ:     'contacts:read',
  CONTACTS_WRITE:    'contacts:write',
  COMPANIES_READ:    'companies:read',
  COMPANIES_WRITE:   'companies:write',
  DEALS_READ:        'deals:read',
  DEALS_WRITE:       'deals:write',
  PIPELINES_READ:    'pipelines:read',
  PIPELINES_WRITE:   'pipelines:write',
  ACTIVITIES_READ:   'activities:read',
  ACTIVITIES_WRITE:  'activities:write',
  WEBHOOKS_READ:     'webhooks:read',
  WEBHOOKS_WRITE:    'webhooks:write',
} as const

export type Scope = typeof SCOPES[keyof typeof SCOPES]

export const ALL_SCOPES = Object.values(SCOPES) as Scope[]

export const SCOPE_LABELS: Record<Scope, string> = {
  'account:read':     'Ler dados da conta',
  'users:read':       'Ler usuários',
  'contacts:read':    'Ler contatos',
  'contacts:write':   'Criar e editar contatos',
  'companies:read':   'Ler empresas',
  'companies:write':  'Criar e editar empresas',
  'deals:read':       'Ler negócios',
  'deals:write':      'Criar e editar negócios',
  'pipelines:read':   'Ler funis e etapas',
  'pipelines:write':  'Criar e editar funis e etapas',
  'activities:read':  'Ler atividades',
  'activities:write': 'Criar e editar atividades',
  'webhooks:read':    'Ler webhooks',
  'webhooks:write':   'Criar e editar webhooks',
}

export function hasScope(tokenScopes: string[], required: Scope): boolean {
  return tokenScopes.includes(required)
}
