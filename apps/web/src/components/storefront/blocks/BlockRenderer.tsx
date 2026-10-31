import { HeroBlock } from "./HeroBlock"
import { GalleryBlock } from "./GalleryBlock"
import { TestimonialsBlock } from "./TestimonialsBlock"
import { CtaBlock } from "./CtaBlock"
import { RichTextBlock } from "./RichTextBlock"
import type { Page } from "@/payload-types"

type Block = NonNullable<Page["layout"]>[number]

export interface BlockRendererProps {
  blocks: Block[]
}

/**
 * Renders a Payload page layout block list.
 * One component per block type (CONTRACT DESIGN_SPEC §2).
 */
export function BlockRenderer({ blocks }: BlockRendererProps) {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.blockType) {
          case "hero":
            return <HeroBlock key={block.id ?? i} block={block} />
          case "gallery":
            return <GalleryBlock key={block.id ?? i} block={block} />
          case "testimonials":
            return <TestimonialsBlock key={block.id ?? i} block={block} />
          case "cta":
            return <CtaBlock key={block.id ?? i} block={block} />
          case "richText":
            return <RichTextBlock key={block.id ?? i} block={block} />
          default:
            return null
        }
      })}
    </>
  )
}
