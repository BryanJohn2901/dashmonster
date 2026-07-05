"use client"

import * as React from 'react'
import { cn } from '@/lib/utils'

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[96px] w-full rounded-xl px-3.5 py-3 text-sm text-[#F7F9FA]',
          'placeholder:text-slate/60 transition-all duration-200 outline-none resize-y',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        style={{
          background: '#11151A',
          border: '1px solid rgba(216,222,227,0.12)',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'rgba(198,244,50,0.60)'
          e.currentTarget.style.boxShadow = '0 0 0 4px rgba(198,244,50,0.12)'
          props.onFocus?.(e)
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'rgba(216,222,227,0.12)'
          e.currentTarget.style.boxShadow = 'none'
          props.onBlur?.(e)
        }}
        ref={ref}
        {...props}
      />
    )
  },
)
Textarea.displayName = 'Textarea'

export { Textarea }
