import type { Payload } from "payload"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { grantEntitlement } from "@/modules/access"
import { makeCourse, makeCustomer, makeLesson, makeStaff } from "../../../../../test/fixtures"
import { asUser, getTestPayload, hasTestDb, uid } from "../../../../../test/integration"
import { listLessonComments, postComment } from "../index"

/** W3-04 comments + moderation (real Postgres). Fictional data, @example.com only. */
describe.skipIf(!hasTestDb)("W3-04 comments (integration)", () => {
  let payload: Payload
  let route: typeof import("@/app/api/comments/route")
  let identity: typeof import("@/modules/identity")
  const links: { to: string; link: string }[] = []
  vi.setConfig({ testTimeout: 120_000 })

  beforeAll(async () => {
    payload = await getTestPayload()
    route = await import("@/app/api/comments/route")
    identity = await import("@/modules/identity")
    identity.setMagicLinkEmailSender(async (mail) => {
      links.push({ to: mail.to, link: mail.link })
    })
  }, 60_000)
  afterAll(() => identity?.resetMagicLinkEmailSender())

  async function cookieFor(email: string): Promise<string> {
    const ip = `10.4.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`
    expect((await identity.requestMagicLink({ email, locale: "fr", ip })).ok).toBe(true)
    const mail = [...links].reverse().find((m) => m.to === email)!
    const v = await identity.verifyMagicLink(new URL(mail.link).searchParams.get("token") as string)
    if (!v.ok) throw new Error(JSON.stringify(v.error))
    return v.data.setCookie.split(";")[0]!
  }

  async function setup() {
    const course = await makeCourse(payload, "online")
    const lesson = await makeLesson(payload, course.id)
    const author = await makeCustomer(payload)
    await payload.update({ collection: "customers", id: author.id, data: { firstName: "Marie", lastName: "Dubois", preferredLocale: "en" }, overrideAccess: true })
    const other = await makeCustomer(payload)
    for (const c of [author, other]) {
      await grantEntitlement({ customerId: c.id, courseId: course.id, source: "manual", sourceRef: `t-${uid()}` })
    }
    const outsider = await makeCustomer(payload)
    return { course, lesson, author, other, outsider }
  }

  const post = (body: unknown, cookie?: string, headers: Record<string, string> = {}) =>
    route.POST(
      new Request("http://localhost:3000/api/comments", {
        method: "POST",
        headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
        body: JSON.stringify(body),
      }),
    )

  const commentsOf = async (lessonId: number) =>
    (await payload.find({ collection: "comments", where: { lesson: { equals: lessonId } }, overrideAccess: true, pagination: false, sort: "createdAt" })).docs

  const jobsFor = async (key: string) =>
    (await payload.find({ collection: "payload-jobs", where: { "input.idempotencyKey": { equals: key } }, overrideAccess: true, pagination: false })).docs

  async function moderate(staffUser: { id: number }, id: number | string, status: "approved" | "rejected" | "pending") {
    return payload.update({ collection: "comments", id, data: { status }, user: asUser(staffUser, "users"), overrideAccess: false, depth: 0 })
  }

  it("postComment: pending, trimmed; unentitled → FORBIDDEN; validation", async () => {
    const { lesson, author, outsider } = await setup()
    expect((await postComment({ customerId: author.id, lessonId: lesson.id, body: "  Bonjour  " })).ok).toBe(true)
    const [c] = await commentsOf(lesson.id)
    expect(c).toMatchObject({ body: "Bonjour", status: "pending" })
    expect(await postComment({ customerId: outsider.id, lessonId: lesson.id, body: "hi" })).toEqual({ ok: false, error: { code: "FORBIDDEN" } })
    const empty = await postComment({ customerId: author.id, lessonId: lesson.id, body: "   " })
    expect(empty.ok === false && empty.error.code).toBe("VALIDATION")
    const unknown = await postComment({ customerId: author.id, lessonId: 999_999_999, body: "hi" })
    expect(unknown.ok === false && unknown.error.code).toBe("FORBIDDEN")
  })

  it("replies: only to an approved, same-lesson, top-level comment", async () => {
    const a = await setup()
    const b = await setup()
    const staff = await makeStaff(payload, "staff")
    await postComment({ customerId: a.author.id, lessonId: a.lesson.id, body: "root" })
    const root = (await commentsOf(a.lesson.id))[0]!
    const reply = (parentId: number | string) => postComment({ customerId: a.other.id, lessonId: a.lesson.id, body: "re", parentId })
    const code = async (p: ReturnType<typeof reply>) => {
      const r = await p
      return r.ok ? "ok" : r.error.code
    }
    expect(await code(reply(root.id))).toBe("VALIDATION") // pending parent
    await moderate(staff, root.id, "rejected")
    expect(await code(reply(root.id))).toBe("VALIDATION") // rejected parent
    await moderate(staff, root.id, "approved")
    // other lesson (b's lesson, a.other not entitled there) → entitlement first; use an entitled lesson of another course
    await grantEntitlement({ customerId: a.other.id, courseId: b.course.id, source: "manual", sourceRef: `t-${uid()}` })
    const cross = await postComment({ customerId: a.other.id, lessonId: b.lesson.id, body: "re", parentId: root.id })
    expect(cross.ok === false && cross.error.code).toBe("VALIDATION")
    expect(await code(reply(root.id))).toBe("ok")
    const child = (await commentsOf(a.lesson.id)).find((c) => c.parent)!
    await moderate(staff, child.id, "approved")
    expect(await code(reply(child.id))).toBe("VALIDATION") // nested
    expect(await code(reply(987_654_321))).toBe("VALIDATION") // unknown parent
  })

  it("listLessonComments: others see approved only; author sees own pending flagged; threaded; no PII", async () => {
    const { lesson, author, other, outsider } = await setup()
    const staff = await makeStaff(payload, "staff")
    await postComment({ customerId: author.id, lessonId: lesson.id, body: "approved root" })
    await postComment({ customerId: author.id, lessonId: lesson.id, body: "still pending" })
    await postComment({ customerId: author.id, lessonId: lesson.id, body: "rejected one" })
    const [r1, , r3] = await commentsOf(lesson.id)
    await moderate(staff, r1!.id, "approved")
    await moderate(staff, r3!.id, "rejected")
    await postComment({ customerId: other.id, lessonId: lesson.id, body: "a reply", parentId: r1!.id })
    const reply = (await commentsOf(lesson.id)).find((c) => c.parent)!
    await moderate(staff, reply.id, "approved")

    const seenByOther = await listLessonComments({ lessonId: lesson.id, customerId: other.id, locale: "en" })
    expect(seenByOther.ok).toBe(true)
    if (!seenByOther.ok) return
    expect(seenByOther.data).toHaveLength(1)
    expect(seenByOther.data[0]).toMatchObject({ body: "approved root", status: "approved", isOwn: false, authorDisplay: "Marie D." })
    expect(seenByOther.data[0]!.replies).toHaveLength(1)
    expect(seenByOther.data[0]!.replies[0]).toMatchObject({ body: "a reply", isOwn: true, authorDisplay: "Participant" })
    const dump = JSON.stringify(seenByOther.data)
    expect(dump).not.toContain("@example.com")
    expect(dump).not.toContain("customer")

    const seenByAuthor = await listLessonComments({ lessonId: lesson.id, customerId: author.id })
    expect(seenByAuthor.ok && seenByAuthor.data.map((c) => [c.body, c.status, c.isOwn])).toEqual([
      ["approved root", "approved", true],
      ["still pending", "pending", true],
      ["rejected one", "rejected", true],
    ])

    expect(await listLessonComments({ lessonId: lesson.id, customerId: outsider.id })).toEqual({ ok: false, error: { code: "FORBIDDEN" } })
  })

  it("moderation: approve → one send-email job, moderatedBy set, no body in job; re-approve → still one; reject → none", async () => {
    const { lesson, author } = await setup()
    const staff = await makeStaff(payload, "staff")
    const secret = `private-words-${uid()}`
    await postComment({ customerId: author.id, lessonId: lesson.id, body: secret })
    await postComment({ customerId: author.id, lessonId: lesson.id, body: "to reject" })
    const [c1, c2] = await commentsOf(lesson.id)
    expect(c1!.moderatedBy ?? null).toBeNull()

    const approved = await moderate(staff, c1!.id, "approved")
    expect(approved.moderatedBy).toBe(staff.id)
    const key = `comment-approved-${c1!.id}`
    const jobs = await jobsFor(key)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.taskSlug).toBe("send-email")
    const input = jobs[0]!.input as { to: string; locale: string; data: Record<string, string> }
    expect(input).toMatchObject({ to: author.email, locale: "en" })
    expect(input.data.lessonUrl).toMatch(/\/en\/account\/courses\/.+\/\d+$/)
    expect(input.data.customerFirstName).toBe("Marie")
    expect(JSON.stringify(jobs[0])).not.toContain(secret)

    await moderate(staff, c1!.id, "approved") // double approve save
    expect(await jobsFor(key)).toHaveLength(1)
    await moderate(staff, c1!.id, "pending")
    await moderate(staff, c1!.id, "approved") // approved → pending → approved
    expect(await jobsFor(key)).toHaveLength(1)

    const rejected = await moderate(staff, c2!.id, "rejected")
    expect(rejected.moderatedBy).toBe(staff.id)
    expect(await jobsFor(`comment-approved-${c2!.id}`)).toHaveLength(0)
  })

  it("customer cannot PATCH a comment, cannot set status/moderatedBy on create", async () => {
    const { lesson, author } = await setup()
    await postComment({ customerId: author.id, lessonId: lesson.id, body: "mine" })
    const [c] = await commentsOf(lesson.id)
    const customerUser = asUser(author, "customers")
    await expect(
      payload.update({ collection: "comments", id: c!.id, data: { body: "edited" }, user: customerUser, overrideAccess: false }),
    ).rejects.toThrow()
    const created = await payload.create({
      collection: "comments",
      data: { lesson: lesson.id, customer: author.id, body: "sneaky", status: "approved" },
      user: customerUser,
      overrideAccess: false,
    })
    expect(created.status).toBe("pending")
  })

  it("XSS payload is stored verbatim and returned as a plain string", async () => {
    const { lesson, author, other } = await setup()
    const staff = await makeStaff(payload, "staff")
    const body = "<img src=x onerror=alert(1)>"
    expect((await postComment({ customerId: author.id, lessonId: lesson.id, body })).ok).toBe(true)
    const [c] = await commentsOf(lesson.id)
    expect(c!.body).toBe(body)
    await moderate(staff, c!.id, "approved")
    const listed = await listLessonComments({ lessonId: lesson.id, customerId: other.id })
    expect(listed.ok && listed.data[0]!.body).toBe(body)
  })

  describe("POST /api/comments", () => {
    it("anonymous → 401; bad Origin → 403", async () => {
      const { lesson } = await setup()
      expect((await post({ lessonId: lesson.id, body: "x" })).status).toBe(401)
      const cookie = await cookieFor((await makeCustomer(payload)).email)
      expect((await post({ lessonId: lesson.id, body: "x" }, cookie, { origin: "https://evil.example.com" })).status).toBe(403)
    })

    it("201 pending; no entitlement → 403; > 2000 → 400; bad parents → 400", async () => {
      const { lesson, author, outsider, other } = await setup()
      const staff = await makeStaff(payload, "staff")
      const cookie = await cookieFor(author.email)
      const res = await post({ lessonId: lesson.id, body: "Bonjour" }, cookie)
      expect(res.status).toBe(201)
      expect(await res.json()).toEqual({ ok: true, data: { status: "pending" } })
      expect((await commentsOf(lesson.id))[0]!.status).toBe("pending")

      expect((await post({ lessonId: lesson.id, body: "hi" }, await cookieFor(outsider.email))).status).toBe(403)
      expect((await post({ lessonId: lesson.id, body: "a".repeat(2001) }, cookie)).status).toBe(400)
      expect((await post({ lessonId: "nope", body: "hi" }, cookie)).status).toBe(400)

      const root = (await commentsOf(lesson.id))[0]!
      const otherCookie = await cookieFor(other.email)
      const pendingParent = await post({ lessonId: lesson.id, body: "re", parentId: root.id }, otherCookie)
      expect(pendingParent.status).toBe(400)
      expect((await pendingParent.json()).error.code).toBe("VALIDATION")
      await moderate(staff, root.id, "approved")
      expect((await post({ lessonId: lesson.id, body: "re", parentId: root.id }, otherCookie)).status).toBe(201)
      const child = (await commentsOf(lesson.id)).find((c) => c.parent)!
      await moderate(staff, child.id, "approved")
      expect((await post({ lessonId: lesson.id, body: "deep", parentId: child.id }, otherCookie)).status).toBe(400)
    })

    it("11th comment in an hour → 429", async () => {
      const { lesson, author } = await setup()
      const cookie = await cookieFor(author.email)
      for (let n = 0; n < 10; n++) {
        expect((await post({ lessonId: lesson.id, body: `c${n}` }, cookie)).status).toBe(201)
      }
      expect((await post({ lessonId: lesson.id, body: "c10" }, cookie)).status).toBe(429)
    })
  })
})
