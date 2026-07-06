"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        data-slot="input"
        className={cn(
          // Base
          "h-11 w-full min-w-0 rounded-xl px-3.5 py-2.5",
          "text-sm text-[#F7F9FA] outline-none",
          "bg-[#11151A] border border-[rgba(216,222,227,0.12)]",
          "transition-[color,border-color,box-shadow] duration-200",
          // Placeholder
          "placeholder:text-slate/60",
          // Hover (Tailwind emite focus depois de hover → foco vence quando ambos ativos)
          "hover:border-[rgba(216,222,227,0.20)]",
          // Focus — anel canary, mesmo padrão do Button
          "focus:border-canary/60 focus:ring-4 focus:ring-canary/[0.12]",
          // File input
          "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-geyser",
          // Disabled
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          // Invalid
          "aria-invalid:border-danger aria-invalid:ring-4 aria-invalid:ring-danger/20",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
