import type { Payload } from "payload"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { makeCourse, makeSession } from "../../../../test/fixtures"
import { getTestPayload, hasTestDb, uid } from "../../../../test/integration"

describe.skipIf(!hasTestDb)("scheduling.onSeatReleased (integration)", () => {
  let payload: Payload
  let onSeatReleased: typeof import("../index").onSeatReleased
  vi.setConfig({ testTimeout: 30_000 })

  beforeAll(async () => {
    payload = await getTestPayload()
    ;({ onSeatReleased } = await import("../index"))
  }, 60_000)
  afterEach(() => vi.restoreAllMocks())

  const addWaiting = (session: number, status: "waiting" | "notified") =>
    payload.create({
      collection: "waitlist-entries",
      data: { session, email: `w-${uid()}@example.com`, locale: "fr", status },
      overrideAccess: true,
    })

  it("no waiting entries -> silent", async () => {
    const course = await makeCourse(payload, "in_person")
    const session = await makeSession(payload, course.id as number)
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    await expect(onSeatReleased(session.id)).resolves.toBeUndefined()
    expect(warn).not.toHaveBeenCalled()
  })

  it("waiting entries -> warn waitlist.notify.pending with count, no PII", async () => {
    const course = await makeCourse(payload, "in_person")
    const session = await makeSession(payload, course.id as number)
    await addWaiting(session.id as number, "waiting")
    await addWaiting(session.id as number, "waiting")
    await addWaiting(session.id as number, "notified")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    await onSeatReleased(session.id)
    expect(warn).toHaveBeenCalledTimes(1)
    const line = String(warn.mock.calls[0]?.[0])
    const parsed = JSON.parse(line)
    expect(parsed).toMatchObject({ event: "waitlist.notify.pending", sessionId: session.id, count: 2 })
    expect(line).not.toContain("@")
  })

  it("never throws on unknown session", async () => {
    await expect(onSeatReleased(999_999_999)).resolves.toBeUndefined()
  })
})
