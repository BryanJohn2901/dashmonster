import { cn } from '@/lib/utils'
import { format, isToday, isYesterday } from 'date-fns'
import { MessageCircle, MessageSquare } from 'lucide-react'
import type { Conversation } from '@/lib/actions/inbox'

interface ConversationItemProps {
  conversation: Conversation
  isActive: boolean
  onClick: () => void
}

function formatPreview(preview: string | null) {
  switch (preview?.trim().toLowerCase()) {
    case '[imagem]':   return '📷 Imagem'
    case '[audio]':    return '🎵 Áudio'
    case '[video]':    return '🎬 Vídeo'
    case '[documento]':return '📄 Documento'
    default:           return preview || 'Nova conversa'
  }
}

export function ConversationItem({ conversation, isActive, onClick }: ConversationItemProps) {
  const date = new Date(conversation.last_message_at)
  let timeStr = ''
  if (isToday(date))        timeStr = format(date, 'HH:mm')
  else if (isYesterday(date)) timeStr = 'Ontem'
  else                        timeStr = format(date, 'dd/MM')

  const initials = (conversation.contact_name || conversation.provider_thread_id || '?')
    .charAt(0)
    .toUpperCase()

  return (
    <button
      onClick={onClick}
      className={cn(
        'relative w-full flex items-start gap-4 py-4 px-5 text-left transition-all duration-150',
        isActive
          ? 'bg-white/[0.07]'
          : 'hover:bg-white/[0.03] border-b border-white/[0.05]'
      )}
    >
      {/* Left accent bar for active */}
      {isActive && (
        <span className="absolute left-0 inset-y-3 w-[3px] rounded-r-full bg-canary" />
      )}

      {/* Avatar + channel badge */}
      <div className="relative flex-shrink-0">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center overflow-hidden ring-1 ring-white/10">
          {conversation.contact_avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={conversation.contact_avatar_url}
              alt={conversation.contact_name || ''}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-gray-300 font-semibold text-[17px]">
              {initials}
            </span>
          )}
        </div>
        <div className={cn(
          'absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] rounded-full flex items-center justify-center border-2 border-[#0B0D11]',
          conversation.provider === 'instagram' ? 'bg-pink-600' : 'bg-emerald-500'
        )}>
          {conversation.provider === 'instagram' ? (
            <MessageSquare className="w-2.5 h-2.5 text-white fill-current" />
          ) : (
            <MessageCircle className="w-2.5 h-2.5 text-white fill-current" />
          )}
        </div>
      </div>

      {/* Text content */}
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex justify-between items-baseline gap-2 mb-1.5">
          <h4 className={cn(
            'font-semibold text-[14.5px] truncate leading-snug',
            isActive ? 'text-white' : 'text-gray-200'
          )}>
            {conversation.contact_name || conversation.provider_thread_id}
          </h4>
          <span className={cn(
            'text-[12px] flex-shrink-0 font-medium',
            conversation.unread_count > 0 ? 'text-canary' : 'text-gray-500'
          )}>
            {timeStr}
          </span>
        </div>

        <div className="flex justify-between items-center gap-2">
          <p className={cn(
            'text-[13px] truncate leading-snug',
            conversation.unread_count > 0
              ? 'text-gray-200 font-medium'
              : 'text-gray-500'
          )}>
            {formatPreview(conversation.last_message_preview)}
          </p>

          {conversation.unread_count > 0 && (
            <div className="flex-shrink-0 bg-canary text-bunker text-[11px] font-bold min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center">
              {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
