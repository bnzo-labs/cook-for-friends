import type { Payload } from "payload"
import { beforeAll, describe, expect, it } from "vitest"

import { makeCourse, makeCustomer, makeLesson } from "../../../../test/fixtures"
import { asUser, getTestPayload, hasTestDb, uid } from "../../../../test/integration"
import { validateVerificationCode } from "../collections/certificates"

function code(): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
  return Array.from({ length: 10 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("")
}

describe("learning validators", () => {
  it("verification code is 10 Crockford base32 chars", () => {
    expect(validateVerificationCode("0123456789")).toBe(true)
    expect(validateVerificationCode("ABCDEFGHJK")).toBe(true)
    expect(validateVerificationCode("ABCDEFGHIK")).toBeTypeOf("string") // I excluded
    expect(validateVerificationCode("SHORT")).toBeTypeOf("string")
    expect(validateVerificationCode(42)).toBeTypeOf("string")
  })
})

describe.skipIf(!hasTestDb)("learning schema (integration)", () => {
  let payload: Payload
  beforeAll(async () => {
    payload = await getTestPayload()
  }, 60_000)

  it("UNIQUE (customer, lesson) on lesson-progress", async () => {
    const c = await makeCustomer(payload)
    const course = await makeCourse(payload, "online")
    const lesson = await makeLesson(payload, course.id)
    const data = { customer: c.id, lesson: lesson.id, course: course.id }
    await payload.create({ collection: "lesson-progress", data })
    await expect(payload.create({ collection: "lesson-progress", data })).rejects.toThrow()
  })

  it("UNIQUE (customer, course) and verificationCode on certificates", async () => {
    const c = await makeCustomer(payload)
    const course = await makeCourse(payload, "online")
    const course2 = await makeCourse(payload, "online")
    const base = {
      customer: c.id,
      issuedAt: new Date().toISOString(),
      customerNameSnapshot: "Test Person",
      locale: "fr" as const,
      courseTitleSnapshot: { fr: "Cours", en: "Course" },
    }
    const first = await payload.create({
      collection: "certificates",
      data: { ...base, course: course.id, verificationCode: code() },
    })
    await expect(
      payload.create({ collection: "certificates", data: { ...base, course: course.id, verificationCode: code() } }),
    ).rejects.toThrow()
    await expect(
      payload.create({
        collection: "certificates",
        data: { ...base, course: course2.id, verificationCode: first.verificationCode },
      }),
    ).rejects.toThrow()
  })

  it("lesson-progress and certificates are private", async () => {
    await expect(payload.find({ collection: "lesson-progress", overrideAccess: false })).rejects.toThrow()
    await expect(payload.find({ collection: "certificates", overrideAccess: false })).rejects.toThrow()
  })

  it("a customer comment is forced to pending and to its author", async () => {
    const a = await makeCustomer(payload)
    const b = await makeCustomer(payload)
    const course = await makeCourse(payload, "online")
    const lesson = await makeLesson(payload, course.id)
    const doc = await payload.create({
      collection: "comments",
      overrideAccess: false,
      user: asUser(a, "customers"),
      depth: 0,
      data: { lesson: lesson.id, customer: b.id, body: `hello ${uid()}`, status: "approved" as const },
    })
    expect(doc.status).toBe("pending")
    expect(doc.customer).toBe(a.id)
    const anon = await payload.find({
      collection: "comments",
      overrideAccess: false,
      where: { id: { equals: doc.id } },
    })
    expect(anon.totalDocs).toBe(0)
  })

  it("comments are one level deep", async () => {
    const a = await makeCustomer(payload)
    const course = await makeCourse(payload, "online")
    const lesson = await makeLesson(payload, course.id)
    const root = await payload.create({ collection: "comments", data: { lesson: lesson.id, customer: a.id, body: "root", status: "pending" as const } })
    const reply = await payload.create({
      collection: "comments",
      data: { lesson: lesson.id, customer: a.id, body: "reply", parent: root.id, status: "pending" as const },
    })
    await expect(
      payload.create({ collection: "comments", data: { lesson: lesson.id, customer: a.id, body: "deep", parent: reply.id, status: "pending" as const } }),
    ).rejects.toThrow()
  })
})
