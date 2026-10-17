import type { Block } from "payload"

import { CtaBlock } from "./cta"
import { GalleryBlock } from "./gallery"
import { HeroBlock } from "./hero"
import { RichTextBlock } from "./rich-text"
import { TestimonialsBlock } from "./testimonials"

export const pageBlocks: Block[] = [HeroBlock, GalleryBlock, TestimonialsBlock, CtaBlock, RichTextBlock]
