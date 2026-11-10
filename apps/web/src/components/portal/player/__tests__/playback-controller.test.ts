import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  BACKOFF_MS,
  MAX_RETRIES,
  REFRESH_LEAD_MS,
  createPlaybackController,
  type PlaybackState,
} from "../playback-controller"

const okResponse = (expiresInMs: number, url = "https://stream.example/a.m3u8?token=t") =>
  new Response(
    JSON.stringify({ ok: true, data: { url, expiresAt: new Date(Date.now() + expiresInMs).toISOString() } }),
    { status: 200 },
  )

function setup(responses: Array<() => Response>) {
  const states: PlaybackState[] = []
  const queue = [...responses]
  const fetchImpl = vi.fn(async () => {
    const next = queue.shift() ?? (() => new Response("{}", { status: 500 }))
    return next()
  }) as unknown as typeof fetch
  const controller = createPlaybackController({ lessonId: 7, onState: (s) => states.push(s), fetchImpl })
  return { controller, states, fetchImpl: fetchImpl as unknown as ReturnType<typeof vi.fn> }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("createPlaybackController", () => {
  it("fetches on start and reports ready", async () => {
    const { controller, states, fetchImpl } = setup([() => okResponse(3_600_000)])
    controller.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe("/api/video/playback?lessonId=7")
    expect(states.map((s) => s.status)).toEqual(["loading", "ready"])
    controller.stop()
  })

  it("refetches REFRESH_LEAD_MS before expiry, not earlier", async () => {
    const ttl = 600_000
    const { controller, fetchImpl } = setup([() => okResponse(ttl), () => okResponse(ttl)])
    controller.start()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(ttl - REFRESH_LEAD_MS - 1_000)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    controller.stop()
  })

  it("floors a tiny TTL so it cannot storm", async () => {
    const { controller, fetchImpl } = setup([() => okResponse(10_000), () => okResponse(10_000)])
    controller.start()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(4_000)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_500)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    controller.stop()
  })

  it("backs off on 403 and stops after MAX_RETRIES retries", async () => {
    const forbidden = () => new Response("{}", { status: 403 })
    const { controller, states, fetchImpl } = setup([forbidden, forbidden, forbidden, forbidden, forbidden])
    controller.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    for (let i = 0; i < MAX_RETRIES; i++) {
      const delay = BACKOFF_MS[i] as number
      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(fetchImpl).toHaveBeenCalledTimes(1 + i)
      await vi.advanceTimersByTimeAsync(1)
      expect(fetchImpl).toHaveBeenCalledTimes(2 + i)
    }
    expect(states.at(-1)).toEqual({ status: "error", reason: "forbidden" })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchImpl).toHaveBeenCalledTimes(1 + MAX_RETRIES)
    controller.stop()
  })

  it("does not retry 401 or 404", async () => {
    for (const [status, reason] of [
      [401, "unauthorized"],
      [404, "unavailable"],
    ] as const) {
      const { controller, states, fetchImpl } = setup([() => new Response("{}", { status })])
      controller.start()
      await vi.advanceTimersByTimeAsync(30_000)
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(states.at(-1)).toEqual({ status: "error", reason })
      controller.stop()
    }
  })

  it("retries a network error with backoff then recovers", async () => {
    const { controller, states, fetchImpl } = setup([
      () => {
        throw new TypeError("network")
      },
      () => okResponse(3_600_000),
    ])
    controller.start()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(states.at(-1)?.status).toBe("ready")
    controller.stop()
  })

  it("retry() resets the budget after a terminal failure", async () => {
    const f = () => new Response("{}", { status: 503 })
    const { controller, states, fetchImpl } = setup([f, f, f, f, () => okResponse(3_600_000)])
    controller.start()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(states.at(-1)).toEqual({ status: "error", reason: "failed" })
    controller.retry()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchImpl).toHaveBeenCalledTimes(5)
    expect(states.at(-1)?.status).toBe("ready")
    controller.stop()
  })

  it("stop() cancels the pending refresh", async () => {
    const { controller, fetchImpl } = setup([() => okResponse(120_000)])
    controller.start()
    await vi.advanceTimersByTimeAsync(0)
    controller.stop()
    await vi.advanceTimersByTimeAsync(600_000)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
