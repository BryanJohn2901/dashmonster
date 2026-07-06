'use client'

import { useEffect } from 'react'
import { readDensity, applyDensityToHtml } from '@/lib/hooks/useDensity'

export function DensityProvider() {
  useEffect(() => {
    applyDensityToHtml(readDensity())
  }, [])

  return null
}
