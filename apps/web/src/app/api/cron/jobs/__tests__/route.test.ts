import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const run = vi.fn()
const state = { enabled: false }

vi.mock("@payload-config", () => ({ default: {} }))
vi.mock("payload", () => ({
  getPayload: async () => ({
    config: { jobs: { enabled: state.enabled } },
    jobs: { run },
  }),
}))

import { GET } from "../route"

const req = (auth?: string) =>
  new NextRequest("http://localhost/api/cron/jobs", {
    headers: auth ? { authorization: auth } : {},
  })

describe("GET /api/cron/jobs", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret"
    state.enabled = false
    run.mockReset()
  })

  it("401 without bearer", async () => {
    expect((await GET(req())).status).toBe(401)
    expect((await GET(req("Bearer nope"))).status).toBe(401)
    expect(run).not.toHaveBeenCalled()
  })

  it("401 when CRON_SECRET unset", async () => {
    delete process.env.CRON_SECRET
    expect((await GET(req("Bearer undefined"))).status).toBe(401)
  })

  it("200 ran 0 when jobs disabled, does not run", async () => {
    const res = await GET(req("Bearer s3cret"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, ran: 0 })
    expect(run).not.toHaveBeenCalled()
  })

  it("runs bounded queue when enabled", async () => {
    state.enabled = true
    run.mockResolvedValue({ jobStatus: { a: {}, b: {} } })
    const res = await GET(req("Bearer s3cret"))
    expect(await res.json()).toEqual({ ok: true, ran: 2 })
    expect(run).toHaveBeenCalledWith({ limit: 50 })
  })
})
