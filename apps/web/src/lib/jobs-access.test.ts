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
  it("allows authenticated staff", async () => {
    expect(await call({ id: 1 })).toBe(true)
  })
})
