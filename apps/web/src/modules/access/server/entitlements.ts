import type { Payload, PayloadRequest, Where } from "payload"

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

const isUniqueViolation = (e: unknown): boolean => {
  const err = e as { code?: string; cause?: { code?: string }; message?: string } | null
  return err?.code === "23505" || err?.cause?.code === "23505" || /duplicate key|unique/i.test(err?.message ?? "")
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
    if (!isUniqueViolation(error)) throw error
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
