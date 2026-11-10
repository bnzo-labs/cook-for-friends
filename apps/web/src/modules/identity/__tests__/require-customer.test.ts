import { beforeEach, describe, expect, it, vi } from "vitest"

const auth = vi.fn()
vi.mock("../server/payload", () => ({ getPayload: async () => ({ auth }) }))

import { requireCustomer } from "../server/session"
import { toCustomerView } from "../server/magic-link"

const digestOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p
  } catch (e) {
    return String((e as { digest?: string }).digest)
  }
  throw new Error("expected redirect")
}

describe("requireCustomer (unit)", () => {
  beforeEach(() => auth.mockResolvedValue({ user: null }))

  it("redirects FR to the localized login path", async () => {
    const d = await digestOf(requireCustomer(new Headers({ "x-next-intl-locale": "fr" })))
    expect(d).toContain("/fr/connexion")
    expect(d).not.toContain("/auth/login")
  })

  it("redirects EN to /en/auth/login; default locale is fr", async () => {
    expect(await digestOf(requireCustomer(new Headers({ "x-next-intl-locale": "en" })))).toContain("/en/auth/login")
    expect(await digestOf(requireCustomer(new Headers()))).toContain("/fr/connexion")
  })

  it("keeps a sanitized next param, drops unsafe ones", async () => {
    const h = new Headers({ "x-next-intl-locale": "fr" })
    expect(await digestOf(requireCustomer(h, { next: "/fr/compte" }))).toContain("/fr/connexion?next=%2Ffr%2Fcompte")
    expect(await digestOf(requireCustomer(h, { next: "//evil.com" }))).not.toContain("next=")
  })
})

describe("toCustomerView dietaryNotes", () => {
  const base = { id: 1, email: "a@b.co", preferredLocale: "fr" } as Parameters<typeof toCustomerView>[0]
  it("exposes notes, null when absent", () => {
    expect(toCustomerView({ ...base, dietaryNotes: "no nuts" }).dietaryNotes).toBe("no nuts")
    expect(toCustomerView(base).dietaryNotes).toBeNull()
  })
})
