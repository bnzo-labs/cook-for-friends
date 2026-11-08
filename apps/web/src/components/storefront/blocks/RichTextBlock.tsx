import { Section, Container } from "@/components/layout"
import { LexicalRenderer } from "../lexical/LexicalRenderer"
import type { RichTextBlock as RichTextBlockType } from "@/payload-types"
import type { RichTextDoc } from "@/modules/catalog"

export interface RichTextBlockProps {
  block: RichTextBlockType
}

export function RichTextBlock({ block }: RichTextBlockProps) {
  return (
    <Section tone="bg">
      <Container width="prose">
        <LexicalRenderer
          doc={block.content as unknown as RichTextDoc}
          className="text-fg"
        />
      </Container>
    </Section>
  )
}
