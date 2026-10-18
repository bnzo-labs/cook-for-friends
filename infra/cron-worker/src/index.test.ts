import { afterEach, describe, expect, it, vi } from "vitest"
import worker, { runCron, type Env } from "./index"

const env: Env = {
  TARGET_URL: "https://example.test",
  CRON_SECRET: "test-cron-secret-xyz",
  VERCEL_BYPASS_SECRET: "test-bypass-secret-abc",
}

function mockFetch(status = 200) {
  return vi.fn(
    async (_url: string, _init?: RequestInit) => new Response("{}", { status }),
  )
}

afterEach(() => vi.restoreAllMocks())

describe("runCron", () => {
  it("*/5 calls expire-holds and jobs", async () => {
    const f = mockFetch()
    await runCron("*/5 * * * *", env, f)
    const urls = f.mock.calls.map((c) => c[0]).sort()
    expect(urls).toEqual([
      "https://example.test/api/cron/expire-holds",
      "https://example.test/api/cron/jobs",
    ])
  })

  it("hourly calls reminders only", async () => {
    const f = mockFetch()
    await runCron("0 * * * *", env, f)
    expect(f.mock.calls.map((c) => c[0])).toEqual([
      "https://example.test/api/cron/reminders",
    ])
  })

  it("sends auth + bypass headers, manual redirect, abort signal", async () => {
    const f = mockFetch()
    await runCron("0 * * * *", env, f)
    const init = f.mock.calls[0]![1]!
    const h = init.headers as Record<string, string>
    expect(h.Authorization).toBe(`Bearer ${env.CRON_SECRET}`)
    expect(h["x-vercel-protection-bypass"]).toBe(env.VERCEL_BYPASS_SECRET)
    expect(init.redirect).toBe("manual")
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it.each([401, 500, 302])("throws on non-2xx (%i)", async (status) => {
    await expect(runCron("0 * * * *", env, mockFetch(status))).rejects.toThrow(
      /reminders/,
    )
  })

  it("still calls every route, then throws, when one fails", async () => {
    const f = vi.fn(async (url: string, _init?: RequestInit) =>
      url.endsWith("/jobs") ? new Response("", { status: 500 }) : new Response("{}"),
    )
    await expect(runCron("*/5 * * * *", env, f)).rejects.toThrow(/jobs/)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it("throws on network error", async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit): Promise<Response> => {
      throw new Error("boom")
    })
    await expect(runCron("0 * * * *", env, f)).rejects.toThrow()
  })

  it("throws on unknown cron", async () => {
    await expect(runCron("1 2 3 4 5", env, mockFetch())).rejects.toThrow(
      /unknown cron/,
    )
  })

  it("never leaks secrets to logs or errors", async () => {
    const spies = (["log", "error", "warn", "info"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    )
    let msg = ""
    try {
      await runCron("*/5 * * * *", env, mockFetch(500))
    } catch (e) {
      msg = String(e)
    }
    await runCron("0 * * * *", env, mockFetch(200))
    const out =
      JSON.stringify(spies.flatMap((s) => s.mock.calls)) + msg
    expect(out).toContain("200")
    expect(out).not.toContain(env.CRON_SECRET)
    expect(out).not.toContain(env.VERCEL_BYPASS_SECRET)
  })
})

describe("worker handlers", () => {
  it("fetch returns 404", async () => {
    const res = await (worker.fetch as () => Promise<Response>)()
    expect(res.status).toBe(404)
  })

  it("scheduled propagates failure", async () => {
    vi.stubGlobal("fetch", mockFetch(503))
    await expect(
      worker.scheduled!({ cron: "0 * * * *" } as never, env),
    ).rejects.toThrow()
    vi.unstubAllGlobals()
  })
})
