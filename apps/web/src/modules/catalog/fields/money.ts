import type { NumberField } from "payload"

/** C-1 (W4-03c): $100,000 cap in cents (mirrors validateDollars MAX_DOLLARS). Staff-only but
 * enforceable here since the dollars max was dead code (the mirror strips the virtual field
 * before Payload field validation runs). Max 10_000_000 cents = $100,000 CAD.
 */
export const MAX_CENTS = 10_000_000

/** Validates an integer amount in cents ≥ 0, max MAX_CENTS. Exported for unit tests. */
export function validateCents(value: unknown): true | string {
  if (value === null || value === undefined) return true
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return "Montant entier en cents requis / Amount must be an integer in cents"
  }
  if (value < 0) return "Le montant doit être ≥ 0 / Amount must be ≥ 0"
  if (value > MAX_CENTS) return `Montant trop élevé (max. ${MAX_CENTS / 100} $) / Amount too high (max $${MAX_CENTS / 100})`
  return true
}

/** Integer validator for counts, positions, etc. */
export function validateInteger(min: number) {
  return (value: unknown): true | string => {
    if (value === null || value === undefined) return true
    if (typeof value !== "number" || !Number.isInteger(value)) {
      return "Nombre entier requis / Integer required"
    }
    if (value < min) return `Doit être ≥ ${min} / Must be ≥ ${min}`
    return true
  }
}

type MoneyOpts = Omit<NumberField, "type" | "name" | "hasMany" | "validate"> & { name: string }

/** Money in cents (CAD, integer, ≥ 0) with a `$` formatted admin cell. */
export function moneyField({ admin, ...rest }: MoneyOpts): NumberField {
  return {
    type: "number",
    min: 0,
    ...rest,
    validate: (value: unknown) => validateCents(value),
    admin: {
      step: 1,
      description: { fr: "Montant en cents (CAD), utilisé par l’API. Ex. : 4500 = 45,00 $", en: "Amount in cents (CAD), API use. E.g. 4500 = $45.00" },
      ...admin,
      components: {
        Cell: "/modules/catalog/admin/MoneyCell#MoneyCell",
        ...admin?.components,
      },
    },
  } as NumberField
}

// ---------- W4-07: money entered / shown in dollars, stored in cents ----------

const MAX_DOLLARS = 100_000

/**
 * Dollars (≥ 0, at most 2 decimals) → integer cents without float drift.
 * `null` when empty; `NaN` when not a valid amount.
 */
export function dollarsToCents(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return Number.NaN
  const cents = Math.round(value * 100)
  return Math.abs(value * 100 - cents) > 1e-6 ? Number.NaN : cents
}

type DollarsOpts = { required?: boolean; cents?: string }

/** Validates a dollars mirror field. Required only when the cents value is missing too (API writes send cents). */
export function validateDollars(
  value: unknown,
  { siblingData }: { siblingData: Record<string, unknown> },
  opts: DollarsOpts = {},
): true | string {
  if (value === null || value === undefined) {
    const centsMissing = opts.cents ? siblingData?.[opts.cents] === null || siblingData?.[opts.cents] === undefined : true
    return opts.required && centsMissing ? "Montant requis / Amount required" : true
  }
  const cents = dollarsToCents(value)
  if (cents === null || Number.isNaN(cents)) return "Montant en dollars, 2 décimales max. (ex. 45,50) / Dollar amount, 2 decimals max (e.g. 45.50)"
  if (cents > MAX_DOLLARS * 100) return `Montant trop élevé (max. ${MAX_DOLLARS} $) / Amount too high (max $${MAX_DOLLARS})`
  return true
}

type Row = Record<string, unknown>

/**
 * Copies admin-entered dollars into the cents field; the dollars key is removed (virtual).
 * Dollars win only when they differ from the stored cents (an admin edit); an API write that
 * changes cents and echoes a stale dollars value keeps its cents. Invalid dollars are copied
 * as-is so the cents validator rejects the save. Returns a new object.
 */
export function applyDollarMirror(data: Row, originalDoc: Row | undefined, pairs: [dollars: string, cents: string][]): Row {
  let out: Row = { ...data }
  for (const [d, c] of pairs) {
    if (!(d in out)) continue
    const { [d]: dollars, ...rest } = out
    out = rest
    const cents = dollarsToCents(dollars)
    const stored = originalDoc?.[c]
    if (cents === null) continue
    if (Number.isNaN(cents)) out = { ...out, [c]: dollars }
    else if (cents !== stored) out = { ...out, [c]: cents }
  }
  return out
}

type DollarsFieldOpts = {
  name: string
  /** The cents field this mirrors. */
  cents: string
  label: { fr: string; en: string }
  required?: boolean
  description?: { fr: string; en: string }
  /** Show (and read) the mirror only when this holds for the sibling data. */
  when?: (sibling: Row) => boolean
}

/** Virtual (no column) number field in dollars mirroring a cents field; staff type 45 or 45,50. */
export function dollarsField(o: DollarsFieldOpts): NumberField {
  const when = o.when
  return {
    name: o.name,
    type: "number",
    virtual: true,
    min: 0,
    label: o.label,
    admin: {
      step: 0.01,
      description: o.description ?? { fr: "En dollars canadiens. Ex. : 45 ou 45,50", en: "In Canadian dollars. E.g. 45 or 45.50" },
      ...(when ? { condition: (_data: unknown, sibling: Row) => when(sibling ?? {}) } : {}),
    },
    hooks: {
      afterRead: [
        ({ siblingData }: { siblingData: Row }) => {
          if (when && !when(siblingData ?? {})) return null
          const v = siblingData?.[o.cents]
          return typeof v === "number" && Number.isFinite(v) ? v / 100 : null
        },
      ],
    },
    validate: ((value: unknown, args: { siblingData: Row }) => {
      if (when && !when(args?.siblingData ?? {})) return true
      return validateDollars(value, { siblingData: args?.siblingData ?? {} }, { required: o.required, cents: o.cents })
    }) as NumberField["validate"],
  } as NumberField
}
