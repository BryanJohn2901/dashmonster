import { useState, useRef, useEffect } from 'react'
import { Send, Image as ImageIcon, Paperclip, MoreVertical, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MessageBubble } from './MessageBubble'
import type { Message, Conversation } from '@/lib/actions/inbox'

interface ChatWindowProps {
  conversation: Conversation
  messages: Message[]
  onSendMessage: (content: string) => Promise<void>
}

export function ChatWindow({ conversation, messages, onSendMessage }: ChatWindowProps) {
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }

  const handleSend = async () => {
    if (!content.trim() || sending) return
    
    const text = content.trim()
    setContent('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    
    setSending(true)
    try {
      await onSendMessage(text)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col flex-1 h-full bg-[#0B0D11]">
      <div className="flex-shrink-0 h-[72px] border-b border-white/5 flex items-center justify-between px-6 bg-[#0B0D11]">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gray-800 flex items-center justify-center overflow-hidden border border-white/5">
            {conversation.contact_avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={conversation.contact_avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-gray-400 font-medium text-lg">
                {(conversation.contact_name || conversation.provider_thread_id || '?').charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <h2 className="font-semibold text-gray-100 text-[15px]">
              {conversation.contact_name || conversation.provider_thread_id}
            </h2>
            <p className="text-xs text-gray-500 font-medium flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {conversation.provider.includes('whatsapp') ? 'WhatsApp' : 'Instagram'}
            </p>
          </div>
        </div>
        
        <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white rounded-full">
          <MoreVertical className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">
            Envie uma mensagem para iniciar o atendimento.
          </div>
        ) : (
          <div className="space-y-0.5">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={bottomRef} className="h-1" />
          </div>
        )}
      </div>

      <div className="flex-shrink-0 p-4 border-t border-white/5 bg-[#0B0D11]">
        <div className="flex items-end gap-2 bg-[#121214] border border-white/10 rounded-2xl p-2.5 focus-within:border-white/20 focus-within:ring-1 focus-within:ring-white/10 transition-all shadow-sm">
          <div className="flex items-center gap-1 pb-0.5 px-1">
            <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-400 hover:text-gray-200 shrink-0 rounded-full">
              <Paperclip className="w-[18px] h-[18px]" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-400 hover:text-gray-200 shrink-0 rounded-full">
              <ImageIcon className="w-[18px] h-[18px]" />
            </Button>
          </div>
          
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => {
              setContent(e.target.value)
              adjustTextareaHeight()
            }}
            onKeyDown={handleKeyDown}
            placeholder="Escreva sua mensagem..."
            className="flex-1 bg-transparent border-0 focus:ring-0 resize-none text-[15px] text-gray-200 placeholder-gray-500 py-2.5 px-2 overflow-y-auto"
            rows={1}
            style={{ minHeight: '44px' }}
          />
          
          <Button 
            onClick={handleSend} 
            disabled={!content.trim() || sending} 
            size="icon" 
            className="h-11 w-11 shrink-0 rounded-xl bg-canary text-bunker hover:bg-canary/90 disabled:opacity-50 font-medium transition-all"
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-1" />}
          </Button>
        </div>
        <p className="text-center text-[10px] text-gray-600 mt-3 font-medium">
          Pressione Enter para enviar, Shift + Enter para quebrar linha
        </p>
      </div>
    </div>
  )
}
