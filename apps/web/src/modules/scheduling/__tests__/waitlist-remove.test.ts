/** W4-08 integration: POST /api/waitlist/remove — removes the entry, idempotent, generic 400, origin, rate limit. */
import type { Payload } from "payload"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { getTestPayload, hasTestDb, uid } from "../../../../test/integration"
import { makeBookableSession } from "../../commerce/__tests__/helpers"

describe.skipIf(!hasTestDb)("W4-08 waitlist remove (integration)", () => {
  let payload: Payload
  let scheduling: typeof import("../index")
  vi.setConfig({ testTimeout: 120_000 })

  beforeAll(async () => {
    payload = await getTestPayload()
    scheduling = await import("../index")
  }, 60_000)

  const ipHeader = () => ({
    "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
  })
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    new Request("http://localhost:3000/api/waitlist/remove", {
      method: "POST",
      headers: { "content-type": "application/json", ...ipHeader(), ...headers },
      body: JSON.stringify(body),
    })
  const exists = async (id: number) =>
    (await payload.count({ collection: "waitlist-entries", where: { id: { equals: id } }, overrideAccess: true })).totalDocs > 0
  const mk = async (status: "waiting" | "notified" = "notified") => {
    const { session } = await makeBookableSession(payload, 1)
    return payload.create({
      collection: "waitlist-entries",
      data: { session: session.id, email: `rm-${uid()}@example.com`, locale: "fr", status },
      overrideAccess: true,
    })
  }

  it("valid token → 200 and the entry is gone; second POST is idempotent 200", async () => {
    const e = await mk()
    const token = scheduling.signWaitlistRemoveToken(e.id)
    const a = await scheduling.handleWaitlistRemove(post({ token }))
    expect(a.status).toBe(200)
    expect(await a.json()).toEqual({ ok: true })
    expect(await exists(e.id)).toBe(false)
    const b = await scheduling.handleWaitlistRemove(post({ token }))
    expect(b.status).toBe(200)
    expect(await b.json()).toEqual({ ok: true })
  })

  it("removes a waiting entry too, and leaves other entries alone", async () => {
    const mine = await mk("waiting")
    const other = await mk("waiting")
    expect((await scheduling.handleWaitlistRemove(post({ token: scheduling.signWaitlistRemoveToken(mine.id) }))).status).toBe(200)
    expect(await exists(mine.id)).toBe(false)
    expect(await exists(other.id)).toBe(true)
  })

  it("bad / tampered / expired / missing token → generic 400 INVALID_TOKEN, nothing deleted", async () => {
    const e = await mk()
    const good = scheduling.signWaitlistRemoveToken(e.id)
    const expired = scheduling.signWaitlistRemoveToken(e.id, new Date(Date.now() - 100 * 24 * 3600 * 1000))
    const tampered = good.replace(/\.[^.]+$/, ".AAAA")
    const bodies = [{ token: expired }, { token: tampered }, { token: "garbage" }, {}, { token: 5 }, null]
    const results = []
    for (const b of bodies) {
      const r = await scheduling.handleWaitlistRemove(post(b))
      results.push([r.status, ((await r.json()) as { error: { code: string } }).error.code])
    }
    expect(results).toEqual(bodies.map(() => [400, "INVALID_TOKEN"]))
    expect(await exists(e.id)).toBe(true)
  })

  it("foreign origin → 403, nothing deleted", async () => {
    const e = await mk()
    const r = await scheduling.handleWaitlistRemove(post({ token: scheduling.signWaitlistRemoveToken(e.id) }, { origin: "https://evil.example" }))
    expect(r.status).toBe(403)
    expect(await exists(e.id)).toBe(true)
  })

  it("11th request from one IP in an hour → 429 with retry-after", async () => {
    const ip = { "x-forwarded-for": `172.20.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }
    const statuses: number[] = []
    for (let i = 0; i < 11; i += 1) statuses.push((await scheduling.handleWaitlistRemove(post({ token: "x" }, ip))).status)
    expect(statuses).toEqual([...Array(10).fill(400), 429])
    const limited = await scheduling.handleWaitlistRemove(post({ token: "x" }, ip))
    expect(limited.headers.get("retry-after")).toBeTruthy()
  })
})
