'use client'

import { useRef } from 'react'

interface ResizableDividerProps {
  /** Chamado no início do arraste — capture aqui a largura inicial do painel. */
  onResizeStart: () => void
  /** Delta horizontal (px) acumulado desde o início do arraste. */
  onResize: (deltaX: number) => void
  /** Fim do arraste — bom momento para persistir. */
  onResizeEnd: () => void
  ariaLabel: string
}

/**
 * Divisória vertical arrastável entre dois painéis. Área de clique de 8px com
 * uma linha de 1px que destaca no hover/drag. Suporta teclado (setas) para
 * acessibilidade (role="separator").
 */
export function ResizableDivider({ onResizeStart, onResize, onResizeEnd, ariaLabel }: ResizableDividerProps) {
  const startX = useRef(0)

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    startX.current = e.clientX
    onResizeStart()
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    function handleMove(ev: PointerEvent) {
      onResize(ev.clientX - startX.current)
    }
    function handleUp() {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      onResizeEnd()
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    onResizeStart()
    onResize(e.key === 'ArrowLeft' ? -16 : 16)
    onResizeEnd()
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      className="group relative z-10 w-2 flex-shrink-0 cursor-col-resize self-stretch outline-none focus-visible:bg-canary/10"
    >
      <span className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/5 transition-colors group-hover:bg-canary/50 group-focus-visible:bg-canary/60 group-active:bg-canary" />
    </div>
  )
}
