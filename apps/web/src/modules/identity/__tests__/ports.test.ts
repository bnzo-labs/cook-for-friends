import { describe, expect, it } from "vitest"

import { renderMagicLinkEmail } from "../server/ports"

const base = { to: "a@example.com", link: "https://example.com/fr/auth/verify?token=abc_-123", expiresInMinutes: 15 }

describe("renderMagicLinkEmail", () => {
  it("renders French", () => {
    const mail = renderMagicLinkEmail({ ...base, locale: "fr" })
    expect(mail.subject).toContain("connexion")
    expect(mail.text).toContain(base.link)
    expect(mail.text).toContain("15 minutes")
    expect(mail.html).toContain(`href="${base.link}"`)
  })

  it("renders English", () => {
    const mail = renderMagicLinkEmail({ ...base, locale: "en" })
    expect(mail.subject).toContain("sign-in")
    expect(mail.text).toContain("expires in 15 minutes")
  })

  it("escapes the link in HTML", () => {
    const mail = renderMagicLinkEmail({ ...base, locale: "en", link: 'https://example.com/?a=1&b="2"' })
    expect(mail.html).toContain("a=1&amp;b=&quot;2&quot;")
  })
})
