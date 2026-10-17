import type { Payload } from "payload"
import { beforeAll, describe, expect, it } from "vitest"

import { makeCourse, makeSession } from "../../../../test/fixtures"
import { getTestPayload, hasTestDb, uid } from "../../../../test/integration"

describe.skipIf(!hasTestDb)("scheduling schema (integration)", () => {
  let payload: Payload
  beforeAll(async () => {
    payload = await getTestPayload()
  }, 60_000)

  it("UNIQUE (session, email) on waitlist-entries, case-insensitive", async () => {
    const course = await makeCourse(payload, "in_person")
    const session = await makeSession(payload, course.id, 1)
    const email = `wait-${uid()}@example.com`
    await payload.create({ collection: "waitlist-entries", data: { session: session.id, email, locale: "fr", status: "waiting" } })
    await expect(
      payload.create({ collection: "waitlist-entries", data: { session: session.id, email: email.toUpperCase(), locale: "fr", status: "waiting" } }),
    ).rejects.toThrow()
  })

  it("anonymous cannot read waitlist-entries", async () => {
    await expect(payload.find({ collection: "waitlist-entries", overrideAccess: false })).rejects.toThrow()
  })
})
