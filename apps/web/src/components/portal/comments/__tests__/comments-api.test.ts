import { afterEach, describe, expect, it, vi } from "vitest"

import { commentErrorKind, postComment } from "../comments-api"

afterEach(() => vi.unstubAllGlobals())

describe("commentErrorKind", () => {
  it.each([
    [400, "validation"],
    [401, "unauthorized"],
    [403, "forbidden"],
    [429, "rate_limited"],
    [500, "generic"],
    [502, "generic"],
  ] as const)("maps %i to %s", (status, kind) => {
    expect(commentErrorKind(status)).toBe(kind)
  })
})

describe("postComment", () => {
  it("returns ok on 201 and sends JSON", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 201 }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(postComment({ lessonId: 3, body: "hi", parentId: 9 })).resolves.toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("/api/comments")
    expect(JSON.parse(String(init.body))).toEqual({ lessonId: 3, body: "hi", parentId: 9 })
  })

  it("maps a 429 and a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })))
    await expect(postComment({ lessonId: 3, body: "x" })).resolves.toEqual({ ok: false, kind: "rate_limited" })
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline") }))
    await expect(postComment({ lessonId: 3, body: "x" })).resolves.toEqual({ ok: false, kind: "generic" })
  })
})
