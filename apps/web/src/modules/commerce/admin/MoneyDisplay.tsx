import type { NumberFieldServerComponent } from "payload"

/** Server-side copy of `MoneyCell.formatCents` (a "use client" module cannot be called from here). */
function formatCents(value: unknown, locale: string): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—"
  return new Intl.NumberFormat(locale, { style: "currency", currency: "CAD" }).format(value / 100)
}

type Label = string | Record<string, string> | false | undefined

function labelText(label: Label, lang: "fr" | "en", fallback: string): string {
  if (!label) return fallback
  if (typeof label === "string") return label
  return label[lang] ?? label.fr ?? fallback
}

/**
 * W4-07: read-only money (cents) in the edit view, formatted in dollars ("45,00 $").
 * Commerce amounts are written by the webhook / seat logic, never typed by staff; the value
 * stays in the form state untouched.
 */
export const MoneyDisplay: NumberFieldServerComponent = ({ field, siblingData, i18n }) => {
  const lang = i18n?.language === "en" ? "en" : "fr"
  const name = field.name
  const value = (siblingData as Record<string, unknown> | undefined)?.[name]
  return (
    <div className="field-type number read-only" style={{ marginBottom: 16 }} data-testid={`money-${name}`}>
      <span className="field-label" style={{ display: "block", marginBottom: 4 }}>
        {labelText(field.label as Label, lang, name)}
      </span>
      <output style={{ fontVariantNumeric: "tabular-nums", fontSize: 16 }}>{formatCents(value, lang === "en" ? "en-CA" : "fr-CA")}</output>
    </div>
  )
}

export default MoneyDisplay
