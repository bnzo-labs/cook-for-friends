import { test, expect, type Page } from "@playwright/test"
import type { Payload } from "payload"

import { getTestPayload, uid } from "../test/integration"
import { makeNamedCustomer, mintLoginToken } from "../test/portal-fixtures"
import {
  completePayment, expectSuccessPage, fillBooking, openCartFromCourse, startCheckout,
  stubHostedCheckoutPage, useUniqueClientIp, type Locale,
} from "../test/e2e-stripe/checkout"
import { customerByEmail, purchaseEntitlements, waitOrder } from "../test/e2e-stripe/db"
import { archiveStripeProducts, seedPurchaseWorld, syncCoursesLive, type PurchaseWorld } from "../test/e2e-stripe/fixtures"
import { logMode } from "../test/e2e-stripe/mode"

/** W4-01 flow B: online purchase -> magic link -> portal shows only the entitled course -> player. */
test.skip(!process.env.TEST_DATABASE_URL, "needs the throwaway CI DB branch")
test.describe.configure({ mode: "serial" })

let payload: Payload
let w: PurchaseWorld
const run = uid()

test.beforeAll(async ({ request }) => {
  test.setTimeout(240_000)
  payload = await getTestPayload()
  w = await seedPurchaseWorld(payload)
  await syncCoursesLive(payload, request, [w.online.id, w.otherOnline.id])
})
test.afterAll(async () => {
  if (w) await archiveStripeProducts(payload, [w.inPerson.id, w.online.id, w.otherOnline.id])
})
test.beforeEach(({}, info) => logMode(info))

const verifyPath = (l: Locale) => (l === "fr" ? "/fr/connexion/verifier" : "/en/auth/verify")
const loginPath = (l: Locale) => (l === "fr" ? "/fr/connexion" : "/en/auth/login")

async function signIn(page: Page, customerId: number, locale: Locale) {
  const token = await mintLoginToken(payload, customerId)
  await page.goto(`${verifyPath(locale)}?token=${token}`)
  await page.locator("[data-verify-submit]").click()
  await page.waitForURL((u) => !u.pathname.includes("verifier") && !u.pathname.includes("verify"))
}

async function buy(page: Page, request: Parameters<typeof completePayment>[1], locale: Locale, email: string) {
  await useUniqueClientIp(page)
  await stubHostedCheckoutPage(page)
  await openCartFromCourse(page, locale, locale === "fr" ? w.online.slugFr : w.online.slugEn, null)
  await fillBooking(page, { email })
  await expect(page.locator("#quantity")).toHaveCount(0)
  const started = await startCheckout(page, locale)
  const paid = await completePayment(page, request, started, { email, name: "Online Buyer" })
  if (paid.delivery) expect(paid.delivery.outcome).toBe("applied")
  await expectSuccessPage(page, locale)
  const order = await waitOrder(payload, started.sessionId)
  expect(order.status).toBe("paid")
  expect(order.total).toBe(2000)
  await expect.poll(async () => (await purchaseEntitlements(payload, order.id)).length, { timeout: 60_000 }).toBe(1)
  return customerByEmail(payload, email)
}

async function magicLinkRequest(page: Page, locale: Locale, email: string) {
  await page.goto(loginPath(locale))
  await page.locator("#login-email").fill(email)
  await page.locator("form button[type=submit]").click()
  await expect(page.locator("[data-login-sent]")).toBeVisible()
}

test("B EN: buy -> magic link -> account shows exactly the course -> player + playback", async ({ page, request, browser }) => {
  test.setTimeout(240_000)
  const email = `e2e+on-en-${run}@example.test`
  const buyer = await buy(page, request, "en", email)
  expect(buyer).not.toBeNull()
  await magicLinkRequest(page, "en", email)
  await signIn(page, buyer!.id, "en")

  await page.goto("/en/account")
  await expect(page.locator("[data-owned-course]")).toHaveCount(1)
  await expect(page.locator("[data-owned-course]")).toContainText(w.online.title)
  await expect(page.locator("body")).not.toContainText(w.otherOnline.title)

  const lesson = `/en/account/courses/${w.online.slugEn}/${w.lessons[0]!.id}`
  const res = await page.goto(lesson)
  expect(res?.status()).toBe(200)
  await expect(page.locator("[data-lesson-heading]")).toBeVisible()
  await expect(page.locator("[data-video-placeholder]")).toBeVisible()
  const ok = await page.request.get(`/api/video/playback?lessonId=${w.lessons[0]!.id}`)
  expect(ok.status()).toBe(200)

  const other = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000" })
  const op = await other.newPage()
  const outsider = await makeNamedCustomer(payload, { firstName: "No", lastName: "Access", locale: "en" })
  await signIn(op, outsider.id, "en")
  await op.goto(lesson)
  await expect(op.locator("[data-player-forbidden]")).toBeVisible()
  expect((await op.request.get(`/api/video/playback?lessonId=${w.lessons[0]!.id}`)).status()).toBe(403)
  await other.close()

  expect((await request.get(`/api/video/playback?lessonId=${w.lessons[0]!.id}`)).status()).toBe(401)
})

test("B FR: buy -> magic link -> compte shows exactly the course", async ({ page, request }) => {
  test.setTimeout(240_000)
  const email = `e2e+on-fr-${run}@example.test`
  const buyer = await buy(page, request, "fr", email)
  await magicLinkRequest(page, "fr", email)
  await signIn(page, buyer!.id, "fr")
  await page.goto("/fr/compte")
  await expect(page.locator("[data-owned-course]")).toHaveCount(1)
  await expect(page.locator("[data-owned-course]")).toContainText(w.online.title)
})
