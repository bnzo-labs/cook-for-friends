import * as React from "react"
import { cn } from "@/lib/utils"

export type InputProps = React.ComponentProps<"input"> & {
  /** Marks the field invalid (red border + aria-invalid). */
  invalid?: boolean
}

export function Input({ className, type = "text", invalid, ...props }: InputProps) {
  return (
    <input
      type={type}
      aria-invalid={invalid || props["aria-invalid"]}
      className={cn(
        "h-11 w-full min-w-0 rounded-control border border-border bg-surface px-3 text-base text-fg",
        "placeholder:text-fg-muted",
        "transition-[border-color,box-shadow] duration-(--duration-fast) ease-out",
        "hover:border-fg-subtle",
        "focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-60",
        "aria-invalid:border-danger aria-invalid:focus-visible:outline-danger",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className,
      )}
      {...props}
    />
  )
}
