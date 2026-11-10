import { beforeEach, describe, expect, it, vi } from "vitest"

const auth = vi.fn()
vi.mock("../server/payload", () => ({ getPayload: async () => ({ auth }) }))

import { getRequestActor } from "../server/actor"

describe("getRequestActor", () => {
  beforeEach(() => auth.mockReset())
  const h = new Headers()

  it("anonymous → null", async () => {
    auth.mockResolvedValue({ user: null })
    expect(await getRequestActor(h)).toBeNull()
  })
  it("customer → customer actor", async () => {
    auth.mockResolvedValue({ user: { id: 7, collection: "customers" } })
    expect(await getRequestActor(h)).toEqual({ kind: "customer", id: 7 })
  })
  it("staff and admin → staff actor", async () => {
    auth.mockResolvedValue({ user: { id: 1, collection: "users", role: "staff" } })
    expect(await getRequestActor(h)).toEqual({ kind: "staff" })
    auth.mockResolvedValue({ user: { id: 1, collection: "users", role: "admin" } })
    expect(await getRequestActor(h)).toEqual({ kind: "staff" })
  })
  it("users without a staff role → null", async () => {
    auth.mockResolvedValue({ user: { id: 1, collection: "users", role: "nobody" } })
    expect(await getRequestActor(h)).toBeNull()
  })
})
