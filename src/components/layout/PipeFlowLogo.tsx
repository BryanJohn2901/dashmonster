interface PipeFlowLogoProps {
  variant?: 'sidebar' | 'default'
  /** Só a marca "P", sem o wordmark — usado na sidebar colapsada. */
  compact?: boolean
  /** Mostra o ícone "P" ao lado do wordmark (padrão). Telas de auth usam false. */
  showIcon?: boolean
}

export function PipeFlowLogo({ variant = 'default', compact = false, showIcon = true }: PipeFlowLogoProps) {
  const isSidebar = variant === 'sidebar'

  const icon = (
    <img
      src="/brand/pipeflow-icon.svg"
      alt="PipeFlow"
      width={36}
      height={36}
      className="h-9 w-9 flex-shrink-0 rounded-xl select-none"
    />
  )

  // Sidebar colapsada: apenas o ícone da marca.
  if (compact) return icon

  return (
    <div className="flex items-center gap-2.5">
      {showIcon && icon}
      <div className="flex flex-col leading-none">
        <img
          src="/brand/pipeflow-wordmark.svg"
          alt="PipeFlow"
          className="h-[20px] w-auto select-none"
        />
        <span className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-slate/70">
          {isSidebar ? 'Sales CRM' : 'CRM'}
        </span>
      </div>
    </div>
  )
}
