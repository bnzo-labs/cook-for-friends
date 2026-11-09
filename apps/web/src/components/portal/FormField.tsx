import * as React from "react"

import { cn } from "@/lib/utils"

export interface FormFieldProps {
  id: string
  label: string
  help?: string
  error?: string
  className?: string
  /** Render the control; receives the ids/aria wiring to spread on it. */
  children: (control: { id: string; "aria-describedby"?: string; "aria-invalid"?: true }) => React.ReactNode
}

/** DESIGN_SPEC FormField: label above, help text, error in danger colour, wired with aria-describedby. */
export function FormField({ id, label, help, error, className, children }: FormFieldProps) {
  const helpId = help ? `${id}-help` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {help ? (
        <p id={helpId} className="text-sm text-fg-muted">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
