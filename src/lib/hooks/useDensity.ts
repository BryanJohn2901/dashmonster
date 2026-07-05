'use client'

import { useState, useEffect } from 'react'

export type Density = 'compact' | 'normal' | 'spacious'

const STORAGE_KEY = 'pf_density'
const CHANGE_EVENT = 'pf-density-change'

export function readDensity(): Density {
  if (typeof window === 'undefined') return 'normal'
  return (localStorage.getItem(STORAGE_KEY) as Density) ?? 'normal'
}

export function writeDensity(density: Density) {
  localStorage.setItem(STORAGE_KEY, density)
  applyDensityToHtml(density)
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: density }))
}

export function applyDensityToHtml(density: Density) {
  const html = document.documentElement
  if (density === 'normal') {
    html.removeAttribute('data-density')
  } else {
    html.setAttribute('data-density', density)
  }
}

export function useDensity(): [Density, (d: Density) => void] {
  const [density, setLocal] = useState<Density>('normal')

  useEffect(() => {
    const initial = readDensity()
    setLocal(initial)
    applyDensityToHtml(initial)

    function onChange(e: Event) {
      setLocal((e as CustomEvent<Density>).detail)
    }

    window.addEventListener(CHANGE_EVENT, onChange)
    return () => window.removeEventListener(CHANGE_EVENT, onChange)
  }, [])

  function set(d: Density) {
    setLocal(d)
    writeDensity(d)
  }

  return [density, set]
}
