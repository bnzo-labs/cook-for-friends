import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

export const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium tracking-wide",
  {
    variants: {
      variant: {
        neutral: "bg-surface-muted text-fg-muted",
        accent: "bg-primary text-primary-fg",
        outline: "border border-border text-fg",
        ok: "bg-seats-ok/12 text-seats-ok",
        low: "bg-seats-low/20 text-fg",
        full: "bg-surface-muted text-seats-full",
        danger: "bg-danger/12 text-danger",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
)

export interface BadgeProps extends React.ComponentProps<"span">, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
