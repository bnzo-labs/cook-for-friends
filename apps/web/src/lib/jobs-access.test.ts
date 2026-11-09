import { describe, expect, it } from "vitest"
import type { PayloadRequest } from "payload"
import { jobsRunAccess } from "./jobs-access"

const call = (user: unknown) =>
  jobsRunAccess({ req: { user } as unknown as PayloadRequest })

describe("jobsRunAccess", () => {
  it("denies anonymous", async () => {
    expect(await call(null)).toBe(false)
    expect(await call(undefined)).toBe(false)
  })
  it("allows staff and admin (users collection)", async () => {
    expect(await call({ id: 1, collection: "users", role: "staff" })).toBe(true)
    expect(await call({ id: 2, collection: "users", role: "admin" })).toBe(true)
  })
  it("denies signed-in customers (L-1)", async () => {
    expect(await call({ id: 3, collection: "customers" })).toBe(false)
  })
  it("denies a users record without a staff role", async () => {
    expect(await call({ id: 4, collection: "users" })).toBe(false)
    expect(await call({ id: 5, collection: "users", role: "customer" })).toBe(false)
  })
})
