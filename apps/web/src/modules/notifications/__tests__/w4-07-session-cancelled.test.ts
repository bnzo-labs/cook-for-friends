/**
 * W4-07: `cancellation-confirmation` with `reason: 'session-cancelled'` (staff cancelled the
 * whole session). Buyer gets the refund amount; attendee a plain notice. FR + EN.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { validateTemplateData } from "../server/validate"
import { sendEmail } from "../server/send"
import { buildTestTransport, setEmailTransportForTests } from "../server/transport"
import type { EmailData } from "../types"

const base: EmailData["cancellation-confirmation"] = {
  recipient: "buyer",
  reason: "session-cancelled",
  attendeeName: "Marie Tremblay",
  courseTitle: "Croissants",
  sessionStartsAt: "2026-12-05T15:00:00.000Z",
  outcome: "refund",
  amount: 12500,
  currency: "cad",
  orderNumber: "CFF-000123",
}

describe("W4-07 cancellation-confirmation · session-cancelled", () => {
  let captured: ReturnType<typeof buildTestTransport>["captured"]
  beforeEach(() => {
    const tb = buildTestTransport()
    captured = tb.captured
    setEmailTransportForTests(tb.transport)
  })
  afterEach(() => setEmailTransportForTests(null))

  const send = (locale: "fr" | "en", data: EmailData["cancellation-confirmation"]) =>
    sendEmail({ template: "cancellation-confirmation", to: "u@example.com", locale, data, idempotencyKey: `sc-${locale}-${data.recipient}` })

  it("buyer FR: session cancelled by Cook for Friends, full refund amount, order number", async () => {
    const r = await send("fr", base)
    expect(r.ok).toBe(true)
    const m = captured[0]!
    expect(m.subject).toBe("Séance annulée — Croissants")
    expect(m.text).toContain("Nous devons annuler la séance")
    expect(m.text).toMatch(/125,00\s\$/)
    expect(m.text).toContain("CFF-000123")
    expect(m.html).not.toMatch(/\{[a-zA-Z]+\}/)
  })

  it("buyer EN + outcome none (nothing left to refund)", async () => {
    await send("en", base)
    expect(captured[0]!.subject).toBe("Session cancelled — Croissants")
    expect(captured[0]!.text).toContain("refund of $125.00")
    await send("en", { ...base, outcome: "none", amount: 0 })
    expect(captured[1]!.text).toContain("Nothing remained to be refunded")
  })

  it("attendee FR/EN: plain notice, never an amount or order number", async () => {
    const attendee = { ...base, recipient: "attendee" as const, amount: 0 }
    await send("fr", attendee)
    await send("en", attendee)
    const [fr, en] = captured
    expect(fr!.text).toContain("La séance Croissants")
    expect(fr!.text).not.toMatch(/\d,\d\d\s\$/)
    expect(fr!.text).not.toContain("CFF-000123")
    expect(en!.text).toContain("has been cancelled by Cook for Friends")
    expect(en!.text).not.toContain("$")
  })

  it("validation: reason is optional and limited to known values", () => {
    expect(validateTemplateData("cancellation-confirmation", { ...base, reason: undefined })).toEqual([])
    expect(validateTemplateData("cancellation-confirmation", { ...base, reason: "other" })).not.toEqual([])
  })
})
