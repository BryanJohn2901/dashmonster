import { DashMonsterLogo } from '@/components/DashMonsterLogo'

interface CrmMonsterLogoProps {
  variant?: 'sidebar' | 'default'
  /** Só a marca (rosto monster), sem wordmark — usado na sidebar colapsada. */
  compact?: boolean
  /** Mostra o ícone ao lado do wordmark (padrão). Telas de auth usam false. */
  showIcon?: boolean
}

export function CrmMonsterLogo({ variant = 'default', compact = false, showIcon = true }: CrmMonsterLogoProps) {
  const isSidebar = variant === 'sidebar'

  // Rail do CRM é sempre escura: rosto monster em lime nos dois temas.
  const icon = <DashMonsterLogo size={30} className="flex-shrink-0 select-none text-[#B6F500] dark:!text-[#B6F500]" />

  // Sidebar colapsada: apenas a marca.
  if (compact) return icon

  return (
    <div className="flex items-center gap-2.5">
      {showIcon && icon}
      <div className="flex flex-col leading-none">
        <span className="text-[17px] font-bold leading-none tracking-tight text-white">CRM Monster</span>
        <span className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-slate/70">
          {isSidebar ? 'Sales CRM' : 'CRM'}
        </span>
      </div>
    </div>
  )
}
