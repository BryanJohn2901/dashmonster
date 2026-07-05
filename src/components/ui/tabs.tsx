'use client'

import * as React from 'react'
import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'
import { cn } from '@/lib/utils'

const Tabs = TabsPrimitive.Root

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'inline-flex h-10 items-center gap-1 rounded-[10px] border border-slate/10 bg-ebony p-1 text-slate',
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        'relative inline-flex h-8 items-center justify-center whitespace-nowrap rounded-[8px] px-3 text-sm font-medium transition-all duration-200 ease-out outline-none hover:text-geyser focus-visible:ring-3 focus-visible:ring-canary/20 disabled:pointer-events-none disabled:opacity-50 data-[selected]:bg-bunker data-[selected]:text-geyser data-[selected]:shadow-none data-[selected]:after:absolute data-[selected]:after:bottom-0 data-[selected]:after:h-0.5 data-[selected]:after:w-4 data-[selected]:after:rounded-full data-[selected]:after:bg-canary',
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn('mt-6 outline-none focus-visible:ring-3 focus-visible:ring-canary/20', className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
