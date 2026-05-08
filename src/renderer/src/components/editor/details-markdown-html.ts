import type { MarkdownToken } from '@tiptap/core'

export const DETAILS_CLOSE_TAG = '</details>'

export type DetailsHtmlToken = MarkdownToken & {
  attributes?: Record<string, unknown>
  bodyTokens?: MarkdownToken[]
  summaryTokens?: MarkdownToken[]
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

export function matchSupportedDetailsHtmlBlock(content: string, start: number): string | null {
  const openingMatch = content.slice(start).match(/^<details\b[^>]*>/i)
  if (!openingMatch) {
    return null
  }

  const closingIndex = content
    .toLowerCase()
    .indexOf(DETAILS_CLOSE_TAG, start + openingMatch[0].length)
  if (closingIndex === -1) {
    return null
  }

  return content.slice(start, closingIndex + DETAILS_CLOSE_TAG.length)
}
