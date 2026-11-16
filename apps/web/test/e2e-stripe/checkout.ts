/** Booking UI + payment drivers shared by the W4-01 specs. Test-only. */
import { expect, type APIRequestContext, type Page } from "@playwright/test"

import { completedPayload, deliver, fakeSession, setFakeSessionStatus, type Buyer, type Delivery } from "./events"
import { isLive } from "./mode"

export type Locale = "fr" | "en"
export type Guest = { firstName: string; lastName: string; email: string }

/** The checkout route is rate-limited per IP (10/h): give every test its own client IP. */
export async function useUniqueClientIp(page: Page): Promise<void> {
  const n = () => Math.floor(Math.random() * 250) + 1
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `198.51.${n()}.${n()}` })
}

/** Signed-events: the hosted Checkout host is not reachable; serve a stand-in page. */
export async function stubHostedCheckoutPage(page: Page): Promise<void> {
  if (isLive) return
  await page.route("https://checkout.stripe.test/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>checkout</title><p>checkout</p>" }),
  )
}

export async function openCartFromCourse(page: Page, locale: Locale, slug: string, sessionId: number | null): Promise<void> {
  await page.goto(locale === "fr" ? `/fr/cours/${slug}` : `/en/courses/${slug}`)
  if (sessionId !== null) {
    const row = page.locator(`[data-session-id="${sessionId}"]`)
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.locator("a").click()
    await expect(page).toHaveURL(new RegExp(`session=${sessionId}`))
  } else {
    await page.getByRole("link", { name: locale === "fr" ? /acheter/i : /buy/i }).click()
    await expect(page).toHaveURL(/course=\d+/)
  }
}

export async function fillBooking(page: Page, o: { quantity?: number; email: string; guests?: Guest[] }): Promise<void> {
  if (o.quantity && o.quantity > 1) await page.locator("#quantity").selectOption(String(o.quantity))
  await page.locator("#buyer-email").fill(o.email)
  for (const [i, g] of (o.guests ?? []).entries()) {
    await page.locator(`#guest-${i}-firstName`).fill(g.firstName)
    await page.locator(`#guest-${i}-lastName`).fill(g.lastName)
    await page.locator(`#guest-${i}-email`).fill(g.email)
  }
}

export type Started = { sessionId: string }

/** Click Pay and capture the Stripe Checkout session id from the redirect URL. */
export async function startCheckout(page: Page, locale: Locale): Promise<Started> {
  await page.getByRole("button", { name: locale === "fr" ? /payer/i : /pay/i }).click()
  await page.waitForURL(/\/c\/pay\//, { timeout: 45_000, waitUntil: "commit" })
  const match = /(cs_(?:test|live)_[A-Za-z0-9_]+)/.exec(page.url())
  if (!match?.[1]) throw new Error("checkout redirect carried no session id")
  return { sessionId: match[1] }
}

export type Paid = { eventId: string | null; payload: string | null; delivery: Delivery | null }

async function payHostedCheckout(page: Page, buyer: Buyer): Promise<void> {
  // Live sandbox only (unverified until STRIPE_CI_SECRET_KEY exists): hosted Checkout, card 4242.
  const email = page.locator("#email")
  if (await email.isVisible().catch(() => false)) await email.fill(buyer.email)
  await page.locator("#cardNumber").fill("4242424242424242")
  await page.locator("#cardExpiry").fill("12 / 34")
  await page.locator("#cardCvc").fill("123")
  await page.locator("#billingName").fill(buyer.name)
  const postal = page.locator("#billingPostalCode")
  if (await postal.isVisible().catch(() => false)) await postal.fill("H2X 1Y4")
  await page.getByTestId("hosted-payment-submit-button").click()
  await page.waitForURL(/\/(commande\/merci|checkout\/success)/, { timeout: 120_000 })
}

/**
 * Pay the open Checkout session. live-test: hosted page + real webhook via `stripe listen`.
 * signed-events: mark the fake session complete, deliver the signed event, open success_url.
 */
export async function completePayment(
  page: Page,
  request: APIRequestContext,
  started: Started,
  buyer: Buyer,
): Promise<Paid> {
  if (isLive) {
    await payHostedCheckout(page, buyer)
    return { eventId: null, payload: null, delivery: null }
  }
  const info = await fakeSession(started.sessionId)
  const evt = completedPayload(info, buyer)
  await setFakeSessionStatus(started.sessionId, "complete")
  const delivery = await deliver(request, evt.payload)
  expect(delivery.status, "webhook delivery").toBe(200)
  await page.goto(info.success_url.replace("{CHECKOUT_SESSION_ID}", started.sessionId))
  return { eventId: evt.id, payload: evt.payload, delivery }
}

export async function expectSuccessPage(page: Page, locale: Locale): Promise<void> {
  await expect(page.locator("h1")).toHaveText(locale === "fr" ? "Paiement reçu" : "Payment received")
}
