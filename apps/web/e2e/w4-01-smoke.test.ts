import AxeBuilder from "@axe-core/playwright"
import { test, expect } from "./fixtures"
import type { Payload } from "payload"

import { getTestPayload, uid } from "../test/integration"
import { fillBooking, openCartFromCourse, useUniqueClientIp } from "../test/e2e-stripe/checkout"
import { holdsOfSession } from "../test/e2e-stripe/db"
import { seedPurchaseWorld, type PurchaseWorld } from "../test/e2e-stripe/fixtures"
import { logMode } from "../test/e2e-stripe/mode"

/** W4-01: validation smoke (no payment) + EN/FR cart and success pages + axe. No Stripe calls. */
test.skip(!process.env.TEST_DATABASE_URL, "needs the throwaway CI DB branch")

let payload: Payload
let w: PurchaseWorld
test.beforeAll(async () => {
  test.setTimeout(180_000)
  payload = await getTestPayload()
  w = await seedPurchaseWorld(payload)
})
test.beforeEach(({}, info) => logMode(info))

test("validation: guest email = buyer email -> inline error, no hold row", async ({ page }) => {
  const email = `e2e+dup-${uid()}@example.test`
  await useUniqueClientIp(page)
  await openCartFromCourse(page, "fr", w.inPerson.slugFr, w.sessionA.id)
  await fillBooking(page, {
    quantity: 2,
    email,
    guests: [{ firstName: "Invité", lastName: "Un", email }],
  })
  await page.getByRole("button", { name: /payer/i }).click()
  await expect(page.locator("#guest-0-email-error")).toBeVisible()
  expect(await holdsOfSession(payload, w.sessionA.id)).toHaveLength(0)
})

test("EN smoke: cart + success pages render translated, axe clean at 320 and 1440", async ({ page }) => {
  test.setTimeout(120_000)
  const pages = [
    { url: `/en/cart?session=${w.sessionA.id}&qty=2`, h1: /your booking/i },
    { url: `/fr/panier?session=${w.sessionA.id}&qty=2`, h1: /votre réservation/i },
    { url: "/en/checkout/success", h1: /^Payment received$/ },
    { url: "/fr/commande/merci", h1: /^Paiement reçu$/ },
  ]
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const p of pages) {
      const res = await page.goto(p.url)
      expect(res?.status(), p.url).toBe(200)
      await expect(page.locator("h1")).toHaveText(p.h1)
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze()
      const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
      expect(bad.map((v) => v.id), `${p.url} @${width}`).toEqual([])
    }
  }
})
