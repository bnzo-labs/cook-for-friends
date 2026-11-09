/**
 * Which reminder window an attendee is in right now: the smallest configured
 * offset `o` with `hoursUntil ≤ o`. Returns null when out of every window
 * (too early), or when the seat was booked less than `o` h before the start
 * (its confirmation email is enough — the later window still applies).
 */
export function pickReminderOffset(offsets: readonly number[], hoursUntil: number, hoursBookedBefore: number): number | null {
  if (!(hoursUntil > 0)) return null
  const valid = [...new Set(offsets.filter((o) => Number.isInteger(o) && o >= 1))].sort((a, b) => a - b)
  const o = valid.find((x) => hoursUntil <= x)
  if (o === undefined) return null
  if (hoursBookedBefore < o) return null
  return o
}
