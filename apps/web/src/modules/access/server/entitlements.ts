import type { Payload, PayloadRequest, Where } from "payload"
import { ValidationError } from "payload"

import type { EntitlementSource, ID, Result, TxContext } from "@/modules/_shared/types"

import type { EntitlementView } from "../types"
import { getPayload } from "./payload"

type EntitlementDoc = {
  id: ID
  customer: ID | { id: ID }
  course: ID | { id: ID }
  source: EntitlementSource
  sourceRef: string
  validFrom: string
  validUntil?: string | null
  revokedAt?: string | null
  revokedReason?: string | null
}

const relId = (v: ID | { id: ID }): ID => (typeof v === "object" ? v.id : v)

export function toView(d: EntitlementDoc): EntitlementView {
  return {
    id: d.id,
    customerId: relId(d.customer),
    courseId: relId(d.course),
    source: d.source,
    sourceRef: d.sourceRef,
    validFrom: d.validFrom,
    validUntil: d.validUntil ?? null,
    revokedAt: d.revokedAt ?? null,
    revokedReason: d.revokedReason ?? null,
  }
}

/** Pure rule: validFrom <= at, (validUntil null or > at), not revoked. */
export function isActiveAt(d: Pick<EntitlementView, "validFrom" | "validUntil" | "revokedAt">, at: Date): boolean {
  if (d.revokedAt) return false
  const t = at.getTime()
  if (new Date(d.validFrom).getTime() > t) return false
  if (d.validUntil && new Date(d.validUntil).getTime() <= t) return false
  return true
}

const uniqueWhere = (i: { customerId: ID; courseId: ID; source: EntitlementSource; sourceRef: string }): Where => ({
  and: [
    { customer: { equals: i.customerId } },
    { course: { equals: i.courseId } },
    { source: { equals: i.source } },
    { sourceRef: { equals: i.sourceRef } },
  ],
})

async function findByKey(
  payload: Payload,
  i: { customerId: ID; courseId: ID; source: EntitlementSource; sourceRef: string },
  req?: PayloadRequest,
): Promise<EntitlementDoc | null> {
  const { docs } = await payload.find({
    collection: "entitlements",
    where: uniqueWhere(i),
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  return (docs[0] as unknown as EntitlementDoc | undefined) ?? null
}

/** True when the customer has a currently valid, non-revoked entitlement for the course. */
export async function hasActiveEntitlement(customerId: ID, courseId: ID, at: Date = new Date()): Promise<boolean> {
  const payload = await getPayload()
  const { docs } = await payload.find({
    collection: "entitlements",
    where: { and: [{ customer: { equals: customerId } }, { course: { equals: courseId } }] },
    limit: 100,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  return (docs as unknown as EntitlementDoc[]).some((d) => isActiveAt(toView(d), at))
}

/** All currently active entitlements of a customer. */
export async function listActiveEntitlements(customerId: ID): Promise<EntitlementView[]> {
  const payload = await getPayload()
  const now = new Date()
  const { docs } = await payload.find({
    collection: "entitlements",
    where: { customer: { equals: customerId } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  return (docs as unknown as EntitlementDoc[]).map(toView).filter((v) => isActiveAt(v, now))
}

/**
 * SQL column names that form the entitlement unique key.
 * Matches what @payloadcms/drizzle handleUpsertError places in `ValidationFieldError.path`
 * when it converts a PG 23505 on this index.
 */
const ENTITLEMENT_UNIQUE_COLS = new Set(["customer_id", "course_id", "source", "source_ref"])

/**
 * Returns true when a single `ValidationFieldError.path` token (which may be a
 * comma-separated list of SQL column names for a composite constraint) consists
 * exclusively of columns that belong to the entitlement unique key.
 */
function pathInUniqueKey(path: string | null | undefined): boolean {
  if (!path) return false
  const parts = path
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
  return parts.length > 0 && parts.every((p) => ENTITLEMENT_UNIQUE_COLS.has(p))
}

/**
 * Returns true when `error` represents a unique-key conflict on the entitlement
 * composite index `(customer, course, source, sourceRef)`.
 *
 * Handles three shapes:
 * 1. Raw PG error (code "23505") anywhere up to two levels deep in the cause chain.
 * 2. Payload `ValidationError` produced by `@payloadcms/drizzle` `handleUpsertError`,
 *    detected via `instanceof` / `.name` and by inspecting `data.errors[].path`.
 *    Language-independent — does NOT rely on localized message text.
 *
 * @internal visible for testing
 */
export function isUniqueConflict(error: unknown): boolean {
  // 1. Raw PG 23505 anywhere in the cause chain (up to depth 2)
  const e = error as { code?: string; cause?: { code?: string; cause?: { code?: string } } } | null
  if (e?.code === "23505" || e?.cause?.code === "23505" || e?.cause?.cause?.code === "23505") {
    return true
  }

  // 2. Payload ValidationError wrapping the unique violation
  //    Use instanceof as primary; name check as fallback for edge cases.
  if (error instanceof ValidationError || (error instanceof Error && error.name === "ValidationError")) {
    const ve = error as ValidationError
    const errors = ve.data?.errors
    if (Array.isArray(errors) && errors.length > 0) {
      return errors.every((f) => pathInUniqueKey(f?.path))
    }
  }

  return false
}

/**
 * Idempotent on `(customer, course, source, sourceRef)`: repeat or concurrent calls
 * return the same row and leave exactly one. An existing row is returned AS-IS —
 * in particular a revoked row is NOT un-revoked and its dates are not changed.
 * With `tx`, writes join the caller's transaction. Note: inside a transaction a
 * unique violation aborts that transaction in Postgres, so concurrent grants of
 * the same key must be serialized by the caller (commerce does: one order, one webhook).
 */
export async function grantEntitlement(i: {
  customerId: ID
  courseId: ID
  source: EntitlementSource
  sourceRef: string
  validFrom?: Date
  validUntil?: Date | null
  grantedBy?: ID
  tx?: TxContext
}): Promise<Result<EntitlementView>> {
  const payload = await getPayload()
  const req = i.tx?.req
  const existing = await findByKey(payload, i, req)
  if (existing) return { ok: true, data: toView(existing) }

  try {
    const created = await payload.create({
      collection: "entitlements",
      data: {
        customer: i.customerId as number,
        course: i.courseId as number,
        source: i.source,
        sourceRef: i.sourceRef,
        validFrom: (i.validFrom ?? new Date()).toISOString(),
        validUntil: i.validUntil ? i.validUntil.toISOString() : null,
        grantedBy: i.grantedBy as number | undefined,
      },
      depth: 0,
      overrideAccess: true,
      req,
    })
    return { ok: true, data: toView(created as unknown as EntitlementDoc) }
  } catch (error) {
    if (!isUniqueConflict(error)) throw error
    const winner = await findByKey(payload, i, req)
    if (!winner) throw error
    return { ok: true, data: toView(winner) }
  }
}

/** Sets `revokedAt` + `revokedReason`. Idempotent (first revocation wins). Missing row → NOT_FOUND. */
export async function revokeEntitlement(i: {
  customerId: ID
  courseId: ID
  source: EntitlementSource
  sourceRef: string
  reason: string
  tx?: TxContext
}): Promise<Result<void>> {
  const payload = await getPayload()
  const req = i.tx?.req
  const existing = await findByKey(payload, i, req)
  if (!existing) return { ok: false, error: { code: "NOT_FOUND", entity: "entitlement" } }
  if (existing.revokedAt) return { ok: true, data: undefined }
  await payload.update({
    collection: "entitlements",
    id: existing.id,
    data: { revokedAt: new Date().toISOString(), revokedReason: i.reason },
    depth: 0,
    overrideAccess: true,
    req,
  })
  return { ok: true, data: undefined }
}
