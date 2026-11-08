/**
 * Unit tests for assertLocale helper.
 *
 * assertLocale(l) must:
 *   - return the locale string when it is a valid locale ("fr" | "en")
 *   - call notFound() (throw) for any other string
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock next/navigation before importing the module under test.
// notFound() in Next.js throws an Error with digest NEXT_NOT_FOUND.
// We replicate the throw so our unit tests can assert on it.
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    const err = new Error("NEXT_NOT_FOUND")
    ;(err as unknown as Record<string, unknown>).digest = "NEXT_NOT_FOUND"
    throw err
  }),
}))

// Also mock next-intl and routing so the module resolves cleanly in Vitest.
vi.mock("next-intl", () => ({
  hasLocale: (locales: readonly string[], locale: string) => locales.includes(locale),
}))

vi.mock("@/i18n/routing", () => ({
  routing: { locales: ["fr", "en"] as const },
}))

// Import AFTER mocks are in place.
import { assertLocale } from "../src/i18n/locale"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("assertLocale — valid locales", () => {
  it('returns "fr" unchanged', () => {
    expect(assertLocale("fr")).toBe("fr")
  })

  it('returns "en" unchanged', () => {
    expect(assertLocale("en")).toBe("en")
  })
})

describe("assertLocale — invalid locales trigger notFound", () => {
  const INVALID = [
    "favicon.ico",
    "robots.txt",
    "apple-touch-icon.png",
    "x.y",
    "de",
    "__next",
    "",
    "FR", // case-sensitive
  ]

  for (const bogus of INVALID) {
    it(`throws for "${bogus}"`, () => {
      expect(() => assertLocale(bogus)).toThrow()
    })
  }
})
