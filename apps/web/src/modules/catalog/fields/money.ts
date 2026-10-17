import type { NumberField } from "payload"

/** Validates an integer amount in cents ≥ 0. Exported for unit tests. */
export function validateCents(value: unknown): true | string {
  if (value === null || value === undefined) return true
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return "Montant entier en cents requis / Amount must be an integer in cents"
  }
  if (value < 0) return "Le montant doit être ≥ 0 / Amount must be ≥ 0"
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
      description: { fr: "Montant en cents (CAD). Ex. : 4500 = 45,00 $", en: "Amount in cents (CAD). E.g. 4500 = $45.00" },
      ...admin,
      components: {
        Cell: "/modules/catalog/admin/MoneyCell#MoneyCell",
        ...admin?.components,
      },
    },
  } as NumberField
}
