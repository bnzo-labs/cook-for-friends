"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

/**
 * Global toast host. Toast messages must come from i18n keys at call sites.
 * Colors reference tokens only.
 */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "!rounded-card !border !border-border !bg-surface !text-fg !shadow-raised !font-body",
          description: "!text-fg-muted",
          actionButton: "!bg-primary !text-primary-fg !rounded-control",
          cancelButton: "!bg-surface-muted !text-fg !rounded-control",
          success: "[&_[data-icon]]:!text-success",
          error: "[&_[data-icon]]:!text-danger",
        },
      }}
      {...props}
    />
  )
}

export { toast } from "sonner"
