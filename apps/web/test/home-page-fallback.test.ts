/**
 * Unit tests for pickHomePage — the pure "page or fallback" decision function.
 *
 * These tests run in CI without a DB connection; they assert only on the
 * pure function that decides whether the home page renders CMS content or
 * the minimal fallback.
 *
 * E2E note: the fallback branch (empty docs) is covered by the staging
 * environment (no seed content) which is validated separately. The seeded
 * dev environment exercises the CMS-content branch.
 */
import { describe, it, expect } from "vitest"
import { pickHomePage } from "../src/lib/storefront/pick-home-page"
import type { Page } from "../src/payload-types"

/** Minimal stub — only the fields pickHomePage inspects (none). */
const stubPage = { id: "1", slug: "home" } as unknown as Page

describe("pickHomePage", () => {
  it("returns the first doc when docs array is non-empty", () => {
    const result = pickHomePage([stubPage])
    expect(result).toBe(stubPage)
  })

  it("returns the first doc when multiple docs are present", () => {
    const second = { id: "2", slug: "home-alt" } as unknown as Page
    const result = pickHomePage([stubPage, second])
    expect(result).toBe(stubPage)
  })

  it("returns null when docs array is empty (CMS not seeded)", () => {
    const result = pickHomePage([])
    expect(result).toBeNull()
  })
})
