import type { ReactNode } from "react"
import React from "react"
import type { RichTextDoc } from "@/modules/catalog"

/**
 * Safe Lexical → React serializer.
 * No dangerouslySetInnerHTML. All content rendered as proper JSX.
 * Supports: paragraph, heading (h1-h6), text (bold/italic/underline/
 * strikethrough/code), list (bullet/number), listitem, link, quote, linebreak.
 */

// Lexical text format bitmask constants
const FMT_BOLD = 1
const FMT_ITALIC = 2
const FMT_STRIKETHROUGH = 4
const FMT_UNDERLINE = 8
const FMT_CODE = 16

type LexicalNode = {
  type: string
  version?: number
  children?: LexicalNode[]
  text?: string
  format?: number
  tag?: string
  listType?: "bullet" | "number" | "check"
  url?: string
  newTab?: boolean
  fields?: { url?: string; newTab?: boolean }
  [k: string]: unknown
}

type LexicalDoc = {
  root?: LexicalNode
}

/** Only allow safe URL schemes. Blocks javascript:, data:, vbscript:. */
function safeHref(url: unknown): string | undefined {
  if (typeof url !== "string" || url.trim() === "") return undefined
  const lower = url.toLowerCase().trim()
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:")
  )
    return undefined
  return url
}

function headingClass(tag: string | undefined): string {
  switch (tag) {
    case "h1":
      return "font-display text-2xl font-semibold leading-tight mb-4 mt-8 first:mt-0"
    case "h2":
      return "font-display text-xl font-semibold leading-tight mb-3 mt-6 first:mt-0"
    case "h3":
      return "font-display text-lg font-semibold leading-tight mb-2 mt-5 first:mt-0"
    default:
      return "font-display text-base font-semibold leading-tight mb-2 mt-4 first:mt-0"
  }
}

function renderChildren(children: LexicalNode[] | undefined, parentKey: string): ReactNode[] {
  if (!children) return []
  return children.map((child, i) => renderNode(child, `${parentKey}-${i}`))
}

function renderText(node: LexicalNode): ReactNode {
  const raw = node.text ?? ""
  if (!raw) return null
  const fmt = typeof node.format === "number" ? node.format : 0

  let content: ReactNode = raw

  // Apply marks: code wraps first (innermost)
  if (fmt & FMT_CODE) {
    content = (
      <code className="rounded-sm bg-surface-muted px-1 font-body text-sm">{content}</code>
    )
  }
  if (fmt & FMT_BOLD) content = <strong className="font-semibold">{content}</strong>
  if (fmt & FMT_ITALIC) content = <em>{content}</em>
  if (fmt & FMT_STRIKETHROUGH) content = <s>{content}</s>
  if (fmt & FMT_UNDERLINE) content = <u className="underline underline-offset-2">{content}</u>

  return content
}

function renderNode(node: LexicalNode, key: string): ReactNode {
  switch (node.type) {
    case "root":
      return (
        <>{renderChildren(node.children, key)}</>
      )

    case "paragraph": {
      const kids = renderChildren(node.children, key)
      // Empty paragraph → spacing element
      const allEmpty = !node.children?.length
      if (allEmpty) return <p key={key} className="my-2" aria-hidden="true" />
      return (
        <p key={key} className="mb-4 leading-[var(--leading-body)] last:mb-0">
          {kids}
        </p>
      )
    }

    case "heading": {
      const HEADING_TAGS: Record<string, React.ElementType> = {
        h1: "h1",
        h2: "h2",
        h3: "h3",
        h4: "h4",
        h5: "h5",
        h6: "h6",
      }
      const Tag: React.ElementType = HEADING_TAGS[node.tag ?? ""] ?? "h2"
      return (
        <Tag key={key} className={headingClass(node.tag)}>
          {renderChildren(node.children, key)}
        </Tag>
      )
    }

    case "text":
      return <span key={key}>{renderText(node)}</span>

    case "linebreak":
      return <br key={key} />

    case "quote":
      return (
        <blockquote
          key={key}
          className="my-4 border-l-2 border-primary pl-4 italic text-fg-muted"
        >
          {renderChildren(node.children, key)}
        </blockquote>
      )

    case "list": {
      const isOrdered = node.listType === "number"
      return isOrdered ? (
        <ol key={key} className="my-4 list-decimal space-y-1 pl-5">
          {renderChildren(node.children, key)}
        </ol>
      ) : (
        <ul key={key} className="my-4 list-disc space-y-1 pl-5">
          {renderChildren(node.children, key)}
        </ul>
      )
    }

    case "listitem":
      return (
        <li key={key} className="leading-[var(--leading-body)]">
          {renderChildren(node.children, key)}
        </li>
      )

    case "link": {
      // Payload Lexical link: url in node.url or node.fields.url
      const rawUrl = node.url ?? (node.fields as { url?: string } | undefined)?.url
      const href = safeHref(rawUrl)
      if (!href) return <>{renderChildren(node.children, key)}</>
      const isNewTab = node.newTab ?? (node.fields as { newTab?: boolean } | undefined)?.newTab
      return (
        <a
          key={key}
          href={href}
          target={isNewTab ? "_blank" : undefined}
          rel={isNewTab ? "noopener noreferrer" : undefined}
          className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
        >
          {renderChildren(node.children, key)}
        </a>
      )
    }

    // Unknown node types → render children if any
    default:
      if (node.children?.length) {
        return <span key={key}>{renderChildren(node.children, key)}</span>
      }
      return null
  }
}

export interface LexicalRendererProps {
  doc: RichTextDoc | null | undefined
  className?: string
}

export function LexicalRenderer({ doc, className }: LexicalRendererProps) {
  if (!doc) return null

  const lexDoc = doc as LexicalDoc
  const root = lexDoc.root

  if (!root) return null

  return (
    <div className={className ?? "text-fg"}>
      {renderChildren(root.children, "root")}
    </div>
  )
}
