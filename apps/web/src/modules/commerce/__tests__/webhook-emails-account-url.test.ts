import { beforeEach, describe, expect, it, vi } from "vitest"

const { enqueueEmail } = vi.hoisted(() => ({ enqueueEmail: vi.fn(async (_: unknown) => undefined) }))
vi.mock("@/modules/notifications", () => ({ enqueueEmail }))

import { enqueueGuestConfirmations, enqueueOrderConfirmation } from "../webhook/emails"

const view = {
  startsAt: "2026-12-01T18:00:00.000Z",
  endsAt: "2026-12-01T21:00:00.000Z",
  courseTitle: "Pasta",
  courseSlug: "pasta",
  location: { name: "Studio", address: "1 Rue X", city: "Montreal" },
}
const paidFor = (locale: "fr" | "en") =>
  ({
    kind: "paid",
    meta: { locale },
    quantity: 2,
    course: null,
    sessionView: view,
    contactEmail: null,
    line: { unitAmount: 100, amountSubtotal: 200, description: "Pasta" },
    taxes: { gst: 0, qst: 0, total: 0 },
    session: { amount_subtotal: 200, amount_total: 200, total_details: { amount_discount: 0 } },
    attendees: [
      { index: 0, email: "buyer@example.com", attendeeName: "Bea B", firstName: "Bea", duplicate: false },
      { index: 1, email: "guest@example.com", attendeeName: "Gus G", firstName: "Gus", duplicate: false },
    ],
  }) as never

describe("W2 confirmations carry accountUrl", () => {
  beforeEach(() => {
    enqueueEmail.mockClear()
    process.env.NEXT_PUBLIC_SITE_URL = "https://cff.example.com"
  })

  it.each([
    ["fr", "https://cff.example.com/fr/connexion"],
    ["en", "https://cff.example.com/en/auth/login"],
  ] as const)("buyer + guest in %s", async (locale, url) => {
    const p = paidFor(locale)
    await enqueueOrderConfirmation(p, { id: 1, number: "N-1" }, null, {} as never)
    await enqueueGuestConfirmations(p, new Map([[1, 77]]), {} as never)
    const calls = enqueueEmail.mock.calls.map((c) => c[0] as { template: string; to: string; locale: string; data: { accountUrl?: string } })
    expect(calls.map((c) => [c.template, c.to, c.locale, c.data.accountUrl])).toEqual([
      ["order-confirmation", "buyer@example.com", locale, url],
      ["enrollment-confirmation", "guest@example.com", locale, url],
    ])
  })
})
