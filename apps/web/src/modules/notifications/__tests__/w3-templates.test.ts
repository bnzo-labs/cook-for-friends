/**
 * Render tests for the Wave 3 templates (CCR-W3-3), FR + EN, via sendEmail.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { sendEmail } from "../server/send"
import { buildTestTransport, setEmailTransportForTests } from "../server/transport"
import type { EmailData } from "../types"
import frMsg from "@/i18n/messages/fr.json"
import enMsg from "@/i18n/messages/en.json"

const location = {
  name: "Atelier Cook for Friends",
  address: "123 rue Saint-Denis",
  city: "Montréal",
  postalCode: "H2X 1K1",
  mapsUrl: "https://maps.google.com/?q=atelier",
}
// 2026-12-05 15:00 UTC = 10:00 America/Toronto (EST)
const startsAt = "2026-12-05T15:00:00.000Z"
const endsAt = "2026-12-05T18:00:00.000Z"
const MONEY = /\d\s?\$|\$\s?\d|CAD/ // fr-CA "125,00 $" / en-CA "$125.00"
const stripComments = (h: string) => h.replace(/<!--[\s\S]*?-->/g, "")
const XSS = '<script>alert(1)</script>'

const reminder: EmailData["reminder"] = {
  attendeeFirstName: XSS,
  courseTitle: "Croissants",
  sessionStartsAt: startsAt,
  sessionEndsAt: endsAt,
  location,
  hoursBefore: 24,
  accountUrl: "https://example.com/fr/connexion",
  contactEmail: "hello@example.com",
}
const waitlist: EmailData["waitlist-seat-available"] = {
  courseTitle: "Croissants",
  sessionStartsAt: startsAt,
  location,
  bookUrl: "https://example.com/fr/cours/croissants",
}
const cancelBuyer: EmailData["cancellation-confirmation"] = {
  recipient: "buyer",
  attendeeName: XSS,
  courseTitle: "Croissants",
  sessionStartsAt: startsAt,
  outcome: "credit",
  amount: 12500,
  currency: "cad",
  creditCode: "CFF-CRED-ABCD1234",
  creditExpiresAt: "2027-12-05T15:00:00.000Z",
  orderNumber: "CFF-000123",
}
const cancelAttendee: EmailData["cancellation-confirmation"] = {
  ...cancelBuyer,
  recipient: "attendee",
  cancelledByName: XSS,
}
const cert: EmailData["certificate-issued"] = {
  customerFirstName: "Marie",
  courseTitle: "Pâte feuilletée",
  verificationCode: "VERIFY-9X7Q",
  downloadUrl: "https://example.com/fr/compte/certificats/1",
  verifyUrl: "https://example.com/fr/certificats/verifier?code=VERIFY-9X7Q",
}
const comment: EmailData["comment-approved"] = {
  customerFirstName: "Marie",
  courseTitle: "Pâte feuilletée",
  lessonTitle: "Le tourage",
  lessonUrl: "https://example.com/fr/compte/cours/1/lecons/2",
}

type Case = { template: string; data: unknown; subjectHas: Record<"fr" | "en", string> }
const cases: Case[] = [
  { template: "reminder", data: reminder, subjectHas: { fr: "24 heures", en: "24 hours" } },
  { template: "waitlist-seat-available", data: waitlist, subjectHas: { fr: "place", en: "seat" } },
  { template: "cancellation-confirmation", data: cancelBuyer, subjectHas: { fr: "annulée", en: "cancelled" } },
  { template: "certificate-issued", data: cert, subjectHas: { fr: "certificat", en: "certificate" } },
  { template: "comment-approved", data: comment, subjectHas: { fr: "commentaire", en: "comment" } },
]

describe("Wave 3 templates", () => {
  let captured: ReturnType<typeof buildTestTransport>["captured"]
  beforeEach(() => {
    const tb = buildTestTransport()
    captured = tb.captured
    setEmailTransportForTests(tb.transport)
  })
  afterEach(() => setEmailTransportForTests(null))

  const send = (template: string, locale: "fr" | "en", data: unknown) =>
    sendEmail({
      template: template as never,
      to: "u@example.com",
      locale,
      data: data as never,
      idempotencyKey: `${template}-${locale}`,
    })

  for (const locale of ["fr", "en"] as const) {
    for (const c of cases) {
      it(`${c.template} renders ${locale} (html + text, no raw ICU, no HTML injection)`, async () => {
        const r = await send(c.template, locale, c.data)
        expect(r.ok).toBe(true)
        const e = captured[0]!
        expect(e.subject.toLowerCase()).toContain(c.subjectHas[locale])
        for (const out of [e.html, e.text, e.subject]) {
          expect(out).not.toMatch(/\{[a-zA-Z]+[,}]/) // unresolved ICU placeholder
        }
        expect(e.html).not.toContain("<script>") // plain text may show it literally
        expect(e.html).toContain(`lang="${locale}"`)
        // no names in subject lines
        expect(e.subject).not.toContain("script")
        expect(e.subject).not.toContain("Marie")
      })
    }
  }

  it("reminder: plural hours, Toronto time, calendar + maps + account link", async () => {
    await send("reminder", "en", { ...reminder, hoursBefore: 1 })
    let e = captured[0]!
    expect(e.subject).toContain("1 hour")
    expect(e.subject).not.toContain("1 hours")
    await send("reminder", "en", reminder)
    e = captured[1]!
    expect(e.html).toContain("10:00") // Toronto, not 15:00 UTC
    expect(e.html).toContain("google.com/calendar/render")
    expect(e.html).toContain(reminder.location.mapsUrl!)
    expect(e.html).toContain(reminder.accountUrl)
    expect(e.html).toContain("hello@example.com")
    await send("reminder", "fr", { ...reminder, hoursBefore: 1 })
    expect(captured[2]!.subject).toContain("1 heure")
    expect(captured[2]!.subject).not.toContain("1 heures")
  })

  it("waitlist: first-to-pay notice and book CTA", async () => {
    await send("waitlist-seat-available", "en", waitlist)
    const e = captured[0]!
    expect(e.html).toContain(waitlist.bookUrl)
    expect(e.text.toLowerCase()).toContain("first person to complete payment")
  })

  it("cancellation buyer credit: amount fr-CA/en-CA, mono code, expiry, order number", async () => {
    await send("cancellation-confirmation", "fr", cancelBuyer)
    const fr = captured[0]!
    expect(fr.text).toMatch(/125,00\s\$/)
    expect(fr.html).toContain("CFF-CRED-ABCD1234")
    expect(fr.html).toContain("monospace")
    expect(fr.text).toContain("CFF-000123")
    expect(fr.text).toContain("2027")
    await send("cancellation-confirmation", "en", cancelBuyer)
    expect(captured[1]!.text).toContain("$125.00")
  })

  it("cancellation buyer: refund and none outcomes", async () => {
    await send("cancellation-confirmation", "en", { ...cancelBuyer, outcome: "refund", creditCode: undefined })
    expect(captured[0]!.text).toContain("refund of $125.00")
    expect(captured[0]!.html).not.toContain("CFF-CRED")
    await send("cancellation-confirmation", "en", { ...cancelBuyer, outcome: "none", amount: 0, creditCode: undefined })
    expect(captured[1]!.text).toContain("no refund or credit applies")
    expect(captured[1]!.text).not.toMatch(MONEY)
  })

  for (const locale of ["fr", "en"] as const) {
    it(`cancellation attendee (${locale}): no currency, code or order number`, async () => {
      const data = { ...cancelAttendee, cancelledByName: "Jean Tremblay" }
      await send("cancellation-confirmation", locale, data)
      const e = captured[0]!
      for (const out of [stripComments(e.html), e.text]) {
        expect(out).not.toMatch(MONEY)
        expect(out).not.toContain("CFF-CRED")
        expect(out).not.toContain("CFF-000123")
      }
      expect(e.text).toContain("Jean Tremblay")
    })
  }

  it("cancellation attendee without cancelledByName uses the generic sentence", async () => {
    await send("cancellation-confirmation", "en", { ...cancelAttendee, cancelledByName: undefined })
    expect(captured[0]!.text).toContain("was cancelled.")
  })

  it("XSS: names are escaped in html", async () => {
    await send("cancellation-confirmation", "en", cancelAttendee)
    expect(captured[0]!.html).toContain("&lt;script&gt;")
    await send("reminder", "en", reminder)
    expect(captured[1]!.html).toContain("&lt;script&gt;")
  })

  it("certificate: download, verify link and code", async () => {
    await send("certificate-issued", "en", cert)
    const e = captured[0]!
    expect(e.html).toContain(cert.downloadUrl)
    expect(e.html).toContain(cert.verifyUrl)
    expect(e.html).toContain("VERIFY-9X7Q")
  })

  it("comment-approved: lesson link, no comment body field", async () => {
    await send("comment-approved", "fr", comment)
    const e = captured[0]!
    expect(e.html).toContain(comment.lessonUrl)
    expect(e.text).toContain("Le tourage")
  })

  it("invalid data returns VALIDATION, nothing sent", async () => {
    const r = await send("reminder", "en", { ...reminder, accountUrl: "not-a-url", hoursBefore: -1 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe("VALIDATION")
    expect(captured).toHaveLength(0)
  })

  describe("account link on Wave 2 confirmations", () => {
    const order: EmailData["order-confirmation"] = {
      orderNumber: "CFF-000123",
      items: [{ title: "Croissants", quantity: 1, amount: 12500 }],
      subtotal: 12500,
      discountTotal: 0,
      taxTotal: 0,
      total: 12500,
      currency: "cad",
    }
    const enrollment: EmailData["enrollment-confirmation"] = {
      buyerName: "Jean",
      courseTitle: "Croissants",
      sessionStartsAt: startsAt,
      sessionEndsAt: endsAt,
      location,
    }
    const url = "https://example.com/en/auth/login"

    for (const [tpl, base] of [
      ["order-confirmation", order],
      ["enrollment-confirmation", enrollment],
    ] as const) {
      it(`${tpl}: link only when accountUrl is set`, async () => {
        await send(tpl, "en", base)
        expect(captured[0]!.html).not.toContain(url)
        expect(captured[0]!.text).not.toContain("Access my account")
        await send(tpl, "en", { ...base, accountUrl: url })
        expect(captured[1]!.html).toContain(url)
        expect(captured[1]!.text).toContain("Access my account")
        await send(tpl, "fr", { ...base, accountUrl: "https://example.com/fr/connexion" })
        expect(captured[2]!.html).toContain("/fr/connexion")
        expect(captured[2]!.text).toContain("Accéder à mon compte")
      })
    }
  })
})

describe("notifications i18n parity", () => {
  function keys(o: unknown, prefix = ""): string[] {
    if (typeof o !== "object" || o === null) return [prefix]
    return Object.entries(o).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k))
  }
  it("EN and FR notifications.* have identical keys", () => {
    expect(keys(frMsg.notifications).sort()).toEqual(keys(enMsg.notifications).sort())
  })
  it("every notifications value is a non-empty string", () => {
    for (const m of [frMsg, enMsg]) {
      const walk = (o: unknown): void => {
        if (typeof o === "string") return void expect(o.length).toBeGreaterThan(0)
        Object.values(o as object).forEach(walk)
      }
      walk(m.notifications)
    }
  })
})
