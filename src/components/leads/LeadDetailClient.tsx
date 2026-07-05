'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LeadForm } from './LeadForm'
import type { LeadRow } from '@/lib/actions/leads'
import type { CompanyWithStats } from '@/lib/actions/companies'

interface LeadDetailClientProps {
  lead: LeadRow
  companies?: CompanyWithStats[]
  children: React.ReactNode
  onSaved?: () => void
}

export function LeadDetailClient({ lead, companies = [], children, onSaved }: LeadDetailClientProps) {
  const [formOpen, setFormOpen] = useState(false)

  return (
    <div className="relative">
      {children}
      <div className="p-4 -mt-px border-t border-border">
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => setFormOpen(true)}
        >
          <Pencil className="h-3.5 w-3.5" />
          Editar Lead
        </Button>
      </div>
      <LeadForm
        open={formOpen}
        onOpenChange={setFormOpen}
        lead={lead}
        companies={companies}
        onSaved={onSaved}
      />
    </div>
  )
}
