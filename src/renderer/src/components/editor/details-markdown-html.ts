import type { MarkdownToken } from '@tiptap/core'

export const DETAILS_CLOSE_TAG = '</details>'

export type DetailsHtmlToken = MarkdownToken & {
  attributes?: Record<string, unknown>
  bodyTokens?: MarkdownToken[]
  summaryTokens?: MarkdownToken[]
}

export type DetailsHtmlBlock = {
  raw: string
  openingAttributes: string
  inner: string
  hasNestedDetails: boolean
}

export function escapeDetailsHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function parseDetailsAttributes(rawAttributes: string): Record<string, unknown> {
  return {
    open: /\sopen(?:\s|=|$)/i.test(rawAttributes),
    variant: /\sdata-orca-toggle=(?:"heading-1"|'heading-1'|heading-1)(?:\s|$)/i.test(rawAttributes)
      ? 'heading-1'
      : null
  }
}

export function detailsBodyHtmlToMarkdown(body: string): string {
  return body
    .replace(/<p\b[^>]*>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .trim()
}

export function renderDetailsAttributes(attrs: Record<string, unknown> | undefined): string {
  const attributes = ['class="orca-details"']

  if (attrs?.variant === 'heading-1') {
    attributes.push('data-orca-toggle="heading-1"')
  }

  if (attrs?.open === true) {
    attributes.push('open')
  }

  return attributes.join(' ')
}

export function isSupportedDetailsHtml(raw: string): boolean {
  return /^<\/?(?:details|summary)\b/i.test(raw.trim())
}

export function matchDetailsHtmlBlock(content: string, start: number): DetailsHtmlBlock | null {
  const openingMatch = content.slice(start).match(/^<details\b[^>]*>/i)
  if (!openingMatch) {
    return null
  }

  const detailsTagPattern = /<\/?details\b[^>]*>/gi
  detailsTagPattern.lastIndex = start

  let depth = 0
  let hasNestedDetails = false

  for (;;) {
    const tagMatch = detailsTagPattern.exec(content)
    if (!tagMatch) {
      return null
    }

    const tag = tagMatch[0]
    const isClosingTag = /^<\/details\b/i.test(tag)

    if (isClosingTag) {
      depth -= 1
      if (depth === 0) {
        const closingEnd = tagMatch.index + tag.length
        return {
          raw: content.slice(start, closingEnd),
          openingAttributes: openingMatch[0].replace(/^<details\b/i, '').replace(/>$/u, ''),
          inner: content.slice(start + openingMatch[0].length, tagMatch.index),
          hasNestedDetails
        }
      }
    } else {
      if (depth > 0) {
        hasNestedDetails = true
      }
      depth += 1
    }
  }
}

export function isEditableDetailsHtmlBlock(block: DetailsHtmlBlock): boolean {
  if (block.hasNestedDetails) {
    return false
  }

  const summaryMatch = block.inner.match(/^\s*<summary\b[^>]*>([\s\S]*?)<\/summary>/i)
  if (!summaryMatch) {
    return false
  }

  if (/<\/?[A-Za-z][\w.:-]*(?:\s[^<>]*?)?\/?>/.test(summaryMatch[1])) {
    return false
  }

  const allowedHtmlRemoved = block.inner
    .replace(/^\s*<summary\b[^>]*>[\s\S]*?<\/summary>/i, '')
    .replace(/<\/?p\b[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '')

  return !/<\/?[A-Za-z][\w.:-]*(?:\s[^<>]*?)?\/?>/.test(allowedHtmlRemoved)
}
