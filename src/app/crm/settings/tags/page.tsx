'use client'

// Port fiel de app/(app)/settings/tags/page.tsx (era RSC; aqui client).

import { useEffect, useState } from 'react'
import { CrmShell } from '@/components/crm/CrmShell'
import { TagsManager } from '@/components/settings/TagsManager'
import { getTags, type TagWithCount } from '@/lib/actions/tags'

export default function TagsSettingsPage() {
  return <CrmShell>{({ canWrite }) => <Content isAdmin={canWrite} />}</CrmShell>
}

function Content({ isAdmin }: { isAdmin: boolean }) {
  const [tags, setTags] = useState<TagWithCount[] | null>(null)

  useEffect(() => { void getTags().then(setTags).catch(() => setTags([])) }, [])

  if (!tags) return null

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[#F7F9FA]">Tags</h1>
        <p className="mt-1 text-sm text-slate">
          Organize leads e negócios com etiquetas coloridas para facilitar a categorização e filtragem.
        </p>
      </div>

      <TagsManager initialTags={tags} isAdmin={isAdmin} />
    </div>
  )
}
