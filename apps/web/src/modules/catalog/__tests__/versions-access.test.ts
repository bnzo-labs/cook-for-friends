/**
 * W4-03b (W2-11 L-8): draft versions of `courses` and `pages` are staff-only.
 * Payload's default `readVersions` is any signed-in user, so a customer could read
 * unpublished drafts via `/api/courses/versions`. Real Postgres (TEST_DATABASE_URL).
 */
import type { Payload } from "payload"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { makeCourse, makeCustomer, makeStaff } from "../../../../test/fixtures"
import { asUser, getTestPayload, hasTestDb } from "../../../../test/integration"

describe.skipIf(!hasTestDb)("W4-03b catalog readVersions (integration)", () => {
  let payload: Payload
  vi.setConfig({ testTimeout: 120_000 })

  beforeAll(async () => {
    payload = await getTestPayload()
  }, 60_000)

  it.each(["courses", "pages"] as const)("%s: customer and anonymous → forbidden; staff → allowed", async (collection) => {
    if (collection === "courses") await makeCourse(payload, "online", "draft")
    const customer = asUser(await makeCustomer(payload), "customers")
    const staff = asUser(await makeStaff(payload, "staff"), "users")

    await expect(payload.findVersions({ collection, overrideAccess: false, user: customer, limit: 1 })).rejects.toThrow()
    await expect(payload.findVersions({ collection, overrideAccess: false, limit: 1 })).rejects.toThrow()
    const ok = await payload.findVersions({ collection, overrideAccess: false, user: staff, limit: 1 })
    expect(Array.isArray(ok.docs)).toBe(true)
  })
})
