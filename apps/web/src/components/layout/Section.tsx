import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const sectionVariants = cva("", {
  variants: {
    tone: {
      bg: "bg-bg",
      surface: "bg-surface",
      muted: "bg-surface-muted",
    },
    /** Deliberately uneven rhythm: hero/editorial get more air than lists. */
    spacing: {
      hero: "py-(--space-section) lg:pt-[calc(var(--space-section)*1.25)]",
      default: "py-(--space-section)",
      tight: "py-(--space-12)",
    },
  },
  defaultVariants: { tone: "bg", spacing: "default" },
})

export interface SectionProps
  extends Omit<React.ComponentProps<"section">, "children">,
    VariantProps<typeof sectionVariants> {
  children?: React.ReactNode
}

/** Full-bleed band. Pass `aria-labelledby` (or `aria-label`) so it becomes a landmark. */
export function Section({ className, tone, spacing, ...props }: SectionProps) {
  return <section className={cn(sectionVariants({ tone, spacing }), className)} {...props} />
}
