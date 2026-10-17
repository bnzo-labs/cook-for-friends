import * as React from "react"
import { Slot } from "radix-ui"
import { cva, type VariantProps } from "class-variance-authority"
import { SpinnerGap } from "@phosphor-icons/react/dist/ssr"
import { cn } from "@/lib/utils"

export const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-body font-medium",
    "rounded-control select-none cursor-pointer",
    "transition-[transform,opacity,background-color,color,box-shadow] duration-(--duration-fast) ease-out",
    "active:translate-y-px active:scale-[0.98]",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-fg shadow-card hover:bg-primary/90 hover:shadow-raised",
        secondary:
          "border border-fg/25 bg-transparent text-fg hover:border-fg hover:bg-surface-muted",
        ghost: "bg-transparent text-fg hover:bg-surface-muted",
        link: "rounded-sm px-0 text-primary underline underline-offset-4 decoration-primary/40 hover:decoration-primary",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-5 text-base",
        lg: "h-14 px-8 text-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
)

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Shows a spinner, blocks clicks, and keeps the button width. */
  loading?: boolean
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className)

  if (asChild) {
    return (
      <Slot.Root className={classes} {...props}>
        {children}
      </Slot.Root>
    )
  }

  return (
    <button
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>{children}</span>
      {loading ? (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <SpinnerGap className="size-5 animate-spin" />
        </span>
      ) : null}
    </button>
  )
}
