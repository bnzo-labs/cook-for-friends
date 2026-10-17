import type { Payload } from "payload"
import { beforeAll, describe, expect, it } from "vitest"

import { makeCourse, makeLesson, makeSession } from "../../../../test/fixtures"
import { getTestPayload, hasTestDb, uid } from "../../../../test/integration"

describe.skipIf(!hasTestDb)("catalog schema (integration)", () => {
  let payload: Payload
  beforeAll(async () => {
    payload = await getTestPayload()
  }, 60_000)

  it("anonymous cannot read lessons or materials", async () => {
    const course = await makeCourse(payload, "online")
    await makeLesson(payload, course.id)
    await expect(payload.find({ collection: "lessons", overrideAccess: false })).rejects.toThrow()
    await expect(payload.find({ collection: "materials", overrideAccess: false })).rejects.toThrow()
  })

  it("anonymous reads only published courses and their sessions", async () => {
    const pub = await makeCourse(payload, "in_person", "published")
    const draft = await makeCourse(payload, "in_person", "draft")
    const s1 = await makeSession(payload, pub.id)
    const s2 = await makeSession(payload, draft.id)
    const courses = await payload.find({
      collection: "courses",
      overrideAccess: false,
      where: { id: { in: [pub.id, draft.id] } },
    })
    expect(courses.docs.map((d) => d.id)).toEqual([pub.id])
    const sessions = await payload.find({
      collection: "sessions",
      overrideAccess: false,
      where: { id: { in: [s1.id, s2.id] } },
    })
    expect(sessions.docs.map((d) => d.id)).toEqual([s1.id])
  })

  it("sessions.course must be an in-person course", async () => {
    const online = await makeCourse(payload, "online")
    const err = await makeSession(payload, online.id).then(
      () => null,
      (e: unknown) => e as { data?: { errors?: { path: string }[] } },
    )
    expect(err?.data?.errors?.map((e) => e.path)).toContain("course")
  })

  it("sessions.capacity must be ≥ 1", async () => {
    const c = await makeCourse(payload, "in_person")
    await expect(makeSession(payload, c.id, 0)).rejects.toThrow()
  })

  it("courses.price must be integer cents", async () => {
    await expect(
      payload.create({
        collection: "courses",
        data: { title: "x", slug: `x-${uid()}`, format: "online", price: 12.5, status: "draft" },
      }),
    ).rejects.toThrow()
  })

  it("courses.slug is unique per locale", async () => {
    const slug = `dup-${uid()}`
    await payload.create({ collection: "courses", data: { title: "a", slug, format: "online", price: 0, status: "draft" } })
    await expect(
      payload.create({ collection: "courses", data: { title: "b", slug, format: "online", price: 0, status: "draft" } }),
    ).rejects.toThrow()
  })

  it("cancellation-policy rejects unsorted tiers", async () => {
    await expect(
      payload.updateGlobal({
        slug: "cancellation-policy",
        data: {
          tiers: [
            { minHoursBefore: 0, outcome: "none", percent: 0 },
            { minHoursBefore: 72, outcome: "refund", percent: 100 },
          ],
        },
      }),
    ).rejects.toThrow()
  })
})
