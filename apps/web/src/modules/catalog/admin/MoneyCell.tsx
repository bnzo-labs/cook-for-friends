"use client"

import type { DefaultCellComponentProps } from "payload"

/** Formats an integer amount in cents as CAD for the admin list view. */
export function formatCents(value: unknown, locale = "fr-CA"): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—"
  return new Intl.NumberFormat(locale, { style: "currency", currency: "CAD" }).format(value / 100)
}

export function MoneyCell({ cellData }: DefaultCellComponentProps) {
  return <span>{formatCents(cellData)}</span>
}
