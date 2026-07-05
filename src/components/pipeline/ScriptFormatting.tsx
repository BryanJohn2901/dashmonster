'use client'

import React from 'react'

type PasteEvent = React.ClipboardEvent<HTMLTextAreaElement>

const INLINE_PATTERN = /(\[[^\]]+\]|\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g

function renderInline(text: string) {
  return text.split(INLINE_PATTERN).filter(Boolean).map((part, index) => {
    if (/^\[[^\]]+\]$/.test(part)) {
      return (
        <mark
          key={index}
          className="rounded bg-amber-500/20 px-1 py-0.5 text-[0.92em] font-bold text-amber-400"
        >
          {part}
        </mark>
      )
    }

    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={index} className="font-bold text-foreground">{part.slice(2, -2)}</strong>
    }

    if (/^`[^`]+`$/.test(part)) {
      return (
        <code key={index} className="rounded bg-muted/50 px-1 py-0.5 text-[0.92em] text-geyser">
          {part.slice(1, -1)}
        </code>
      )
    }

    if (/^\*[^*]+\*$/.test(part)) {
      return <em key={index} className="text-foreground/85">{part.slice(1, -1)}</em>
    }

    return <React.Fragment key={index}>{part}</React.Fragment>
  })
}

function renderParagraph(block: string, index: number) {
  const lines = block.split('\n')
  return (
    <p key={index} className="leading-7 text-foreground/82">
      {lines.map((line, lineIndex) => (
        <React.Fragment key={lineIndex}>
          {lineIndex > 0 && <br />}
          {renderInline(line)}
        </React.Fragment>
      ))}
    </p>
  )
}

function renderBlock(block: string, index: number) {
  const trimmed = block.trim()
  const lines = trimmed.split('\n').map((line) => line.trim()).filter(Boolean)

  if (!trimmed) return null

  const heading = trimmed.match(/^(#{1,3})\s+(.+)$/)
  if (heading) {
    const level = heading[1].length
    const className = level === 1
      ? 'text-xl font-black text-foreground'
      : level === 2
        ? 'text-base font-black text-foreground'
        : 'text-sm font-bold uppercase tracking-wide text-geyser'

    return <h4 key={index} className={className}>{renderInline(heading[2])}</h4>
  }

  if (lines.every((line) => /^\s*[-*•]\s+/.test(line))) {
    return (
      <ul key={index} className="ml-5 list-disc space-y-2 leading-7 text-foreground/82 marker:text-primary">
        {lines.map((line, lineIndex) => (
          <li key={lineIndex}>{renderInline(line.replace(/^\s*[-*•]\s+/, ''))}</li>
        ))}
      </ul>
    )
  }

  if (lines.every((line) => /^\s*\d+[.)]\s+/.test(line))) {
    return (
      <ol key={index} className="ml-5 list-decimal space-y-2 leading-7 text-foreground/82 marker:text-primary">
        {lines.map((line, lineIndex) => (
          <li key={lineIndex}>{renderInline(line.replace(/^\s*\d+[.)]\s+/, ''))}</li>
        ))}
      </ol>
    )
  }

  if (lines.every((line) => /^>\s+/.test(line))) {
    return (
      <blockquote key={index} className="border-l-2 border-primary/50 pl-4 italic leading-7 text-foreground/75">
        {lines.map((line, lineIndex) => (
          <React.Fragment key={lineIndex}>
            {lineIndex > 0 && <br />}
            {renderInline(line.replace(/^>\s+/, ''))}
          </React.Fragment>
        ))}
      </blockquote>
    )
  }

  return renderParagraph(trimmed, index)
}

export function ScriptRenderer({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, '\n').trim().split(/\n{2,}/)

  return (
    <div className="space-y-4 text-[15px]">
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  )
}

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const element = node as HTMLElement
  const tag = element.tagName.toLowerCase()
  const children = Array.from(element.childNodes).map(nodeToMarkdown).join('')

  if (tag === 'br') return '\n'
  if (tag === 'strong' || tag === 'b') return `**${children.trim()}**`
  if (tag === 'em' || tag === 'i') return `*${children.trim()}*`
  if (tag === 'h1') return `# ${children.trim()}\n\n`
  if (tag === 'h2') return `## ${children.trim()}\n\n`
  if (tag === 'h3') return `### ${children.trim()}\n\n`
  if (tag === 'li') return `- ${children.trim()}\n`
  if (tag === 'ul' || tag === 'ol') return `${children.trimEnd()}\n\n`
  if (tag === 'p' || tag === 'div') return `${children.trimEnd()}\n\n`

  return children
}

function htmlToMarkdown(html: string) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  return Array.from(doc.body.childNodes)
    .map(nodeToMarkdown)
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function handleScriptRichPaste(
  event: PasteEvent,
  currentValue: string,
  setValue: (value: string) => void
) {
  const html = event.clipboardData.getData('text/html')
  if (!html) return

  const markdown = htmlToMarkdown(html)
  if (!markdown) return

  event.preventDefault()

  const target = event.currentTarget
  const start = target.selectionStart ?? currentValue.length
  const end = target.selectionEnd ?? currentValue.length
  const nextValue = `${currentValue.slice(0, start)}${markdown}${currentValue.slice(end)}`
  setValue(nextValue)

  window.requestAnimationFrame(() => {
    const cursor = start + markdown.length
    target.setSelectionRange(cursor, cursor)
  })
}
