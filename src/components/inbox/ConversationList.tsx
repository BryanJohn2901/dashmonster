import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ConversationItem } from './ConversationItem'
import type { Conversation } from '@/lib/actions/inbox'

interface ConversationListProps {
  conversations: Conversation[]
  activeConversationId: string | null
  onSelect: (id: string) => void
  searchQuery: string
  onSearchChange: (val: string) => void
  /** Largura controlada (px). Sem valor, usa o token de densidade --conv-w. */
  width?: number
}

export function ConversationList({
  conversations,
  activeConversationId,
  onSelect,
  searchQuery,
  onSearchChange,
  width
}: ConversationListProps) {
  const unreadTotal = conversations.reduce((n, c) => n + (c.unread_count ?? 0), 0)

  return (
    <div
      className="flex flex-col h-full bg-[#0B0D11] flex-shrink-0"
      style={{ width: width ? `${width}px` : 'var(--conv-w)' }}
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-white/5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-bold text-gray-100 tracking-tight">
            Caixa de Entrada
          </h2>
          {unreadTotal > 0 && (
            <span className="bg-canary text-bunker text-[11px] font-bold min-w-[22px] h-[22px] px-1.5 rounded-full flex items-center justify-center">
              {unreadTotal > 99 ? '99+' : unreadTotal}
            </span>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar conversas..."
            className="pl-10 h-10 bg-white/[0.04] border-white/8 hover:border-white/12 focus-visible:ring-1 focus-visible:ring-canary/30 focus-visible:border-canary/30 rounded-xl text-[13.5px] placeholder:text-gray-500"
          />
        </div>

        {/* Count label */}
        <p className="text-[12px] text-gray-500 font-medium">
          {conversations.length === 0
            ? 'Nenhuma conversa'
            : `${conversations.length} conversa${conversations.length !== 1 ? 's' : ''} abertas`}
        </p>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {conversations.length === 0 ? (
          <div className="p-10 text-center text-gray-500 text-sm leading-relaxed">
            Nenhuma conversa encontrada.
          </div>
        ) : (
          conversations.map(conv => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={conv.id === activeConversationId}
              onClick={() => onSelect(conv.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}
