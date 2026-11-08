"use client"

import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  guestFieldId,
  type FieldError,
  type FieldErrors,
  type GuestDraft,
} from "./booking-validation"

type GuestFieldsProps = {
  index: number
  value: GuestDraft
  errors: FieldErrors
  disabled: boolean
  fieldMessage: (error: FieldError) => string
  onChange: (index: number, field: keyof GuestDraft, value: string) => void
}

const FIELDS: Array<{ field: keyof GuestDraft; labelKey: string; type: string; autoComplete: string }> = [
  { field: "firstName", labelKey: "first_name", type: "text", autoComplete: "off" },
  { field: "lastName", labelKey: "last_name", type: "text", autoComplete: "off" },
  { field: "email", labelKey: "guest_email", type: "email", autoComplete: "off" },
]

/** One fieldset per guest seat (index 0 = guest 1). */
export function GuestFields({ index, value, errors, disabled, fieldMessage, onChange }: GuestFieldsProps) {
  const t = useTranslations("storefront.booking")
  return (
    <fieldset className="grid gap-4 rounded-card border border-border bg-surface p-5 sm:grid-cols-2">
      <legend className="px-2 font-display text-lg font-semibold text-fg">
        {t("guest_legend", { n: index + 1 })}
      </legend>
      {FIELDS.map(({ field, labelKey, type, autoComplete }) => {
        const id = guestFieldId(index, field)
        const error = errors[`guests.${index}.${field}`]
        return (
          <div key={field} className={field === "email" ? "flex flex-col gap-2 sm:col-span-2" : "flex flex-col gap-2"}>
            <Label htmlFor={id}>{t(labelKey)}</Label>
            <Input
              id={id}
              name={id}
              type={type}
              value={value[field]}
              autoComplete={autoComplete}
              disabled={disabled}
              invalid={Boolean(error)}
              aria-describedby={error ? `${id}-error` : undefined}
              onChange={(e) => onChange(index, field, e.target.value)}
            />
            {error ? (
              <p id={`${id}-error`} className="text-sm text-danger">
                {fieldMessage(error)}
              </p>
            ) : null}
          </div>
        )
      })}
    </fieldset>
  )
}
