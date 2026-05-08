import type { AnyExtension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Table } from '@tiptap/extension-table'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableRow } from '@tiptap/extension-table-row'
import { Markdown } from '@tiptap/markdown'
import { createLowlight, common } from 'lowlight'
import { loadLocalImageSrc, onImageCacheInvalidated } from './useLocalImageSrc'
import { RawMarkdownHtmlBlock, RawMarkdownHtmlInline } from './raw-markdown-html'
import {
  detailsBodyHtmlToMarkdown,
  escapeDetailsHtml,
  isEditableDetailsHtmlBlock,
  matchDetailsHtmlBlock,
  parseDetailsAttributes,
  renderDetailsAttributes,
  type DetailsHtmlToken
} from './details-markdown-html'
import { MarkdownDocLink } from './rich-markdown-doc-link'
import { RichMarkdownCodeBlock } from './RichMarkdownCodeBlock'
import { safeReactNodeViewRenderer } from './safe-react-node-view-renderer'
import { DragSelectionGuard } from './drag-selection-guard'

const lowlight = createLowlight(common)

const RICH_MARKDOWN_PLACEHOLDER = 'Write markdown… Type / for blocks.'
const OrcaDetails = Details.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      variant: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute('data-orca-toggle') === 'heading-1' ? 'heading-1' : null,
        renderHTML: ({ variant }) =>
          variant === 'heading-1' ? { 'data-orca-toggle': 'heading-1' } : {}
      }
    }
  },
  markdownTokenizer: {
    name: 'details',
    level: 'block',
    start: '<details',
    tokenize(src, _tokens, lexer) {
      const detailsBlock = matchDetailsHtmlBlock(src, 0)
      if (!detailsBlock || !isEditableDetailsHtmlBlock(detailsBlock)) {
        return undefined
      }

      const summaryMatch = detailsBlock.inner.match(/^\s*<summary\b[^>]*>([\s\S]*?)<\/summary>/i)
      if (!summaryMatch) {
        return undefined
      }

      const summary = summaryMatch[1].trim()
      const body = detailsBlock.inner.slice((summaryMatch.index ?? 0) + summaryMatch[0].length)

      return {
        type: 'details',
        raw: detailsBlock.raw,
        block: true,
        attributes: parseDetailsAttributes(detailsBlock.openingAttributes),
        summaryTokens: lexer.inlineTokens(summary),
        bodyTokens: lexer.blockTokens(detailsBodyHtmlToMarkdown(body))
      } as DetailsHtmlToken
    }
  },
  parseMarkdown: (token, helpers) => {
    const detailsToken = token as DetailsHtmlToken
    if (detailsToken.type !== 'details') {
      return []
    }

    const summary = helpers.createNode(
      'detailsSummary',
      {},
      helpers.parseInline(detailsToken.summaryTokens ?? [])
    )
    const body = helpers.parseChildren(detailsToken.bodyTokens ?? [])
    const content = helpers.createNode(
      'detailsContent',
      {},
      body.length > 0 ? body : [helpers.createNode('paragraph')]
    )

    return helpers.createNode('details', detailsToken.attributes ?? {}, [summary, content])
  },
  renderMarkdown: (node, helpers) => {
    const summary = node.content?.find((child) => child.type === 'detailsSummary')
    const content = node.content?.find((child) => child.type === 'detailsContent')
    const summaryText = escapeDetailsHtml(helpers.renderChildren(summary?.content ?? [], ''))
    const body = helpers.renderChildren(content?.content ?? [], '\n\n').trim()
    const attrs = renderDetailsAttributes(node.attrs)

    return `<details ${attrs}>\n<summary>${summaryText}</summary>\n\n${body}\n\n</details>`
  }
})

export function createRichMarkdownExtensions({
  includePlaceholder = false
}: {
  includePlaceholder?: boolean
} = {}): AnyExtension[] {
  const extensions: AnyExtension[] = [
    // Why: rich-mode detection must use the exact same markdown extension set as
    // the live editor. If these drift, Orca can claim a document is editable in
    // preview and then still lose syntax on save.
    StarterKit.configure({
      link: false,
      codeBlock: false
    }),
    CodeBlockLowlight.extend({
      addNodeView() {
        return safeReactNodeViewRenderer(RichMarkdownCodeBlock)
      }
    }).configure({
      lowlight,
      defaultLanguage: null
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true
    }),
    // Why: in dev mode the renderer is served from http://localhost, so
    // file:// URLs in <img> tags are blocked by cross-origin restrictions.
    // A nodeView loads local images via IPC → blob URL, which bypasses this
    // and works identically in dev and production modes.
    Image.extend({
      addStorage() {
        return { filePath: '' }
      },
      addNodeView() {
        return ({ node, HTMLAttributes }) => {
          // Why: wrapping the <img> in a container prevents the browser's
          // native image drag (which sends image bytes) from conflicting with
          // ProseMirror's node-level drag (which serializes the schema node
          // for relocation within the document).
          const dom = document.createElement('div')
          dom.style.lineHeight = '0'

          const img = document.createElement('img')
          img.draggable = false
          for (const [key, value] of Object.entries(HTMLAttributes)) {
            if (key !== 'src' && value != null && value !== false) {
              img.setAttribute(key, String(value))
            }
          }
          dom.appendChild(img)

          let currentSrc = node.attrs.src as string | undefined

          const loadImage = (src: string | undefined): void => {
            const fp = this.storage.filePath as string
            if (src && fp) {
              // Why: when IPC resolution fails (e.g. unsupported format),
              // the ternary falls back to the raw src so the browser can
              // attempt its own loading rather than leaving a broken image.
              void loadLocalImageSrc(src, fp).then((resolved) => {
                img.src = resolved ? resolved : src
              })
            } else if (src) {
              img.src = src
            }
          }

          loadImage(currentSrc)

          // Why: when the user refocuses the window after deleting or replacing
          // image files, the blob URL cache is cleared and this callback re-loads
          // the image from disk so the editor reflects the current filesystem state.
          const unsubscribe = onImageCacheInvalidated(() => {
            loadImage(currentSrc)
          })

          return {
            dom,
            update: (updatedNode) => {
              if (updatedNode.type.name !== 'image') {
                return false
              }
              const newSrc = updatedNode.attrs.src as string | undefined
              if (newSrc !== currentSrc) {
                currentSrc = newSrc
                loadImage(newSrc)
              }
              return true
            },
            destroy: () => {
              unsubscribe()
            }
          }
        }
      }
    }).configure({
      allowBase64: true
    }),
    TaskList,
    TaskItem.configure({
      nested: true
    }),
    OrcaDetails.configure({
      persist: true,
      HTMLAttributes: {
        class: 'orca-details'
      }
    }),
    DetailsSummary,
    DetailsContent,
    Table.configure({
      resizable: false
    }),
    TableRow,
    TableHeader,
    TableCell,
    RawMarkdownHtmlInline,
    RawMarkdownHtmlBlock,
    MarkdownDocLink,
    DragSelectionGuard,
    Markdown.configure({
      markedOptions: {
        gfm: true
      }
    })
  ]

  if (includePlaceholder) {
    extensions.push(
      Placeholder.configure({
        placeholder: RICH_MARKDOWN_PLACEHOLDER
      })
    )
  }

  return extensions
}
