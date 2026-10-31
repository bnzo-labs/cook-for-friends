import type { EntitlementSource, ID, ISODate } from "@/modules/_shared/types"

/** Module view of an entitlement row. Never leaks Payload internals. */
export type EntitlementView = {
  id: ID
  customerId: ID
  courseId: ID
  source: EntitlementSource
  sourceRef: string
  validFrom: ISODate
  validUntil: ISODate | null
  revokedAt: ISODate | null
  revokedReason: string | null
}
