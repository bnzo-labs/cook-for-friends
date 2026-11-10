import type { CancellationTier } from "@/modules/catalog"

/** DISCOVERY D1 default, used while the `cancellation-policy` global has no tiers. */
export const DEFAULT_TIERS: readonly CancellationTier[] = [
  { minHoursBefore: 72, outcome: "refund", percent: 100 },
  { minHoursBefore: 24, outcome: "credit", percent: 100 },
  { minHoursBefore: 0, outcome: "none", percent: 0 },
]

export type CancellationOutcome = {
  outcome: "refund" | "credit" | "none"
  percent: number
  /** Cents, floor(seatAmount × percent / 100). 0 for `none`. */
  amount: number
  /** `minHoursBefore` of the matching tier, null when none matched. */
  tierMinHours: number | null
}

const NONE: CancellationOutcome = { outcome: "none", percent: 0, amount: 0, tierMinHours: null }

/** Tiers to use: the configured ones, or the D1 default when the global is empty. */
export const effectiveTiers = (tiers: readonly CancellationTier[]): readonly CancellationTier[] =>
  tiers.length > 0 ? tiers : DEFAULT_TIERS

/**
 * D1: first tier (descending `minHoursBefore`) with `hoursBefore ≥ minHoursBefore`;
 * no match or empty → none. Sorts a copy, so an unsorted input cannot mis-order the match.
 */
export function evaluateTiers(tiers: readonly CancellationTier[], hoursBefore: number, seatAmount: number): CancellationOutcome {
  const sorted = [...tiers].sort((a, b) => b.minHoursBefore - a.minHoursBefore)
  const tier = sorted.find((t) => hoursBefore >= t.minHoursBefore)
  if (!tier) return NONE
  const percent = Math.min(100, Math.max(0, tier.percent))
  const amount = tier.outcome === "none" ? 0 : Math.floor((Math.max(0, seatAmount) * percent) / 100)
  // A refund/credit worth nothing is "none": nothing for commerce to execute.
  if (amount === 0) return { outcome: "none", percent: tier.outcome === "none" ? 0 : percent, amount: 0, tierMinHours: tier.minHoursBefore }
  return { outcome: tier.outcome, percent, amount, tierMinHours: tier.minHoursBefore }
}

export const hoursBetween = (from: Date, to: Date): number => (to.getTime() - from.getTime()) / 3_600_000
