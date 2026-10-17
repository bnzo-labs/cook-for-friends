"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "radix-ui"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "@phosphor-icons/react/dist/ssr"
import { cn } from "@/lib/utils"

export const Sheet = SheetPrimitive.Root
export const SheetTrigger = SheetPrimitive.Trigger
export const SheetClose = SheetPrimitive.Close

const sheetVariants = cva(
  [
    "fixed z-50 flex flex-col gap-4 bg-surface p-6 shadow-raised",
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
    "data-[state=open]:duration-(--duration-normal) data-[state=closed]:duration-(--duration-fast)",
  ],
  {
    variants: {
      side: {
        right:
          "inset-y-0 right-0 h-full w-[min(22rem,88vw)] border-l border-border data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
        left:
          "inset-y-0 left-0 h-full w-[min(22rem,88vw)] border-r border-border data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
        top: "inset-x-0 top-0 border-b border-border data-[state=open]:slide-in-from-top data-[state=closed]:slide-out-to-top",
        bottom:
          "inset-x-0 bottom-0 rounded-t-card border-t border-border data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
      },
    },
    defaultVariants: { side: "right" },
  },
)

export function SheetContent({
  className,
  children,
  side,
  closeLabel,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> &
  VariantProps<typeof sheetVariants> & {
    /** Localized accessible name for the close button (from i18n). */
    closeLabel: string
  }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-50 bg-fg/45 backdrop-blur-[2px]",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        )}
      />
      <SheetPrimitive.Content className={cn(sheetVariants({ side }), className)} {...props}>
        {children}
        <SheetPrimitive.Close
          className={cn(
            "absolute right-4 top-4 inline-flex size-10 items-center justify-center rounded-control text-fg-muted",
            "transition-colors duration-(--duration-fast) hover:bg-surface-muted hover:text-fg",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          )}
        >
          <X className="size-5" aria-hidden="true" />
          <span className="sr-only">{closeLabel}</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  )
}

export function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5 pr-10", className)} {...props} />
}

export function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mt-auto flex flex-col gap-2", className)} {...props} />
}

export function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title className={cn("font-display text-xl font-semibold", className)} {...props} />
}

export function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description className={cn("text-sm text-fg-muted", className)} {...props} />
}
