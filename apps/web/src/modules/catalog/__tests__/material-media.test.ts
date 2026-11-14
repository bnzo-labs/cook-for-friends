import type { Payload, PayloadRequest } from "payload"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  MATERIAL_MEDIA_TTL_MS,
  invalidateMaterialMediaIds,
  materialMediaIds,
  mediaReadAccess,
  publicMediaWhere,
} from "../server/material-media"

function fakePayload(docs: unknown[] | Error) {
  const find = vi.fn(async () => {
    if (docs instanceof Error) throw docs
    return { docs }
  })
  const error = vi.fn()
  return { payload: { find, logger: { error } } as unknown as Payload, find, error }
}

function read(user: unknown, payload: Payload) {
  return mediaReadAccess({ req: { user, payload } as unknown as PayloadRequest })
}

describe("material-media (W3-13)", () => {
  beforeEach(() => invalidateMaterialMediaIds())

  it("publicMediaWhere: images only when no material file exists (no empty not_in)", () => {
    expect(publicMediaWhere([])).toEqual({ mimeType: { like: "image/" } })
    expect(publicMediaWhere([3, 7])).toEqual({
      and: [{ mimeType: { like: "image/" } }, { id: { not_in: [3, 7] } }],
    })
  })

  it("collects distinct file ids (number or populated), skips missing", async () => {
    const { payload, find } = fakePayload([{ file: 3 }, { file: { id: 7 } }, { file: 3 }, { file: null }, {}])
    expect(await materialMediaIds(payload)).toEqual([3, 7])
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "materials", overrideAccess: true, depth: 0, select: { file: true } }),
    )
  })

  it("caches within the TTL, reloads after it, and after invalidation", async () => {
    const { payload, find } = fakePayload([{ file: 1 }])
    await materialMediaIds(payload)
    await materialMediaIds(payload)
    expect(find).toHaveBeenCalledTimes(1)
    await materialMediaIds(payload, Date.now() + MATERIAL_MEDIA_TTL_MS + 1)
    expect(find).toHaveBeenCalledTimes(2)
    invalidateMaterialMediaIds()
    await materialMediaIds(payload)
    expect(find).toHaveBeenCalledTimes(3)
  })

  it("concurrent callers share one lookup", async () => {
    const { payload, find } = fakePayload([{ file: 1 }])
    const [a, b] = await Promise.all([materialMediaIds(payload), materialMediaIds(payload)])
    expect(a).toEqual([1])
    expect(b).toEqual([1])
    expect(find).toHaveBeenCalledTimes(1)
  })

  it("staff read everything without a lookup", async () => {
    const { payload, find } = fakePayload([{ file: 1 }])
    expect(await read({ id: 1, collection: "users", role: "staff" }, payload)).toBe(true)
    expect(find).not.toHaveBeenCalled()
  })

  it("anonymous and customers get images minus material files", async () => {
    const { payload } = fakePayload([{ file: 9 }])
    const expected = { and: [{ mimeType: { like: "image/" } }, { id: { not_in: [9] } }] }
    expect(await read(null, payload)).toEqual(expected)
    expect(await read({ id: 2, collection: "customers" }, payload)).toEqual(expected)
  })

  it("fails closed and logs when the lookup fails; next call retries", async () => {
    const { payload, error, find } = fakePayload(new Error("db down"))
    expect(await read(null, payload)).toBe(false)
    expect(error).toHaveBeenCalledTimes(1)
    expect(await read(null, payload)).toBe(false)
    expect(find).toHaveBeenCalledTimes(2)
  })
})
