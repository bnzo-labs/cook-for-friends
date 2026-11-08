/** Human order number: `CFF-` + order id zero-padded to 6 (W2-07 decision; no sequence, no migration). */
export function formatOrderNumber(orderId: number | string): string {
  const id = Number(orderId)
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`[commerce] invalid order id ${String(orderId)}`)
  return `CFF-${String(id).padStart(6, "0")}`
}

/** Placeholder written on insert (the id is only known afterwards), replaced in the same transaction. */
export const pendingOrderNumber = (checkoutSessionId: string) => `PENDING-${checkoutSessionId}`

/**
 * Seat amounts (CONTRACT §3.4): `floor(total / N)` each, remainder cents on
 * index 0, sum = total.
 */
export function splitSeatAmounts(total: number, seats: number): number[] {
  if (!Number.isInteger(total) || total < 0) throw new Error("[commerce] total must be a non-negative integer")
  if (!Number.isInteger(seats) || seats < 1) throw new Error("[commerce] seats must be >= 1")
  const base = Math.floor(total / seats)
  const remainder = total - base * seats
  return Array.from({ length: seats }, (_, i) => (i === 0 ? base + remainder : base))
}
