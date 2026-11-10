import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { randomInt } from "node:crypto"
import path from "node:path"
import type { Payload } from "payload"

import { makeCourse, makeLesson } from "../test/fixtures"
import { getTestPayload, uid } from "../test/integration"
import { grantCourse, makeNamedCustomer, makePaidOrder, makeSeat, mintLoginToken } from "../test/portal-fixtures"

/**
 * W3-01b portal ops UI. Runs against `next build && next start` on a THROWAWAY Neon
 * branch (TEST_DATABASE_URL === the server's DATABASE_URL). Policy = D1 defaults
 * (>= 72 h refund, >= 24 h credit, else none). Refund confirms are stubbed at the
 * network edge (no live Stripe): the real route is covered by W3-05 integration tests;
 * credit / none confirms run for real. Screenshots: W301B_SCREENSHOTS=1 ->
 * e2e/__screenshots__/w3-01b/<locale>-<name>-<width>.png
 */

const SHOT_DIR = path.join(process.cwd(), "e2e", "__screenshots__", "w3-01b")
const SHOTS = process.env.W301B_SCREENSHOTS === "1"
const WIDTHS = [320, 768, 1440] as const
const HOUR = 3_600_000
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

type Loc = "fr" | "en"
const P = {
  verify: { fr: "/fr/connexion/verifier", en: "/en/auth/verify" },
  account: { fr: "/fr/compte", en: "/en/account" },
  sessions: { fr: "/fr/compte/sessions", en: "/en/account/sessions" },
  history: { fr: "/fr/compte/historique", en: "/en/account/history" },
  course: { fr: "/fr/cours", en: "/en/courses" },
} as const

let payload: Payload

test.beforeAll(async () => {
  test.setTimeout(120_000)
  payload = await getTestPayload()
})

async function signIn(page: Page, customerId: number, locale: Loc) {
  const token = await mintLoginToken(payload, customerId)
  await page.goto(`${P.verify[locale]}?token=${token}`)
  await page.locator("[data-verify-submit]").click()
  await page.waitForURL((u) => !u.pathname.includes("verifier") && !u.pathname.includes("verify"))
}

async function shot(page: Page, locale: Loc, name: string) {
  if (!SHOTS) return
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 })
    await page.screenshot({ path: path.join(SHOT_DIR, `${locale}-${name}-${width}.png`), fullPage: true })
  }
}

async function audit(page: Page, scope?: string) {
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    const result = await (scope ? builder.include(scope) : builder).analyze()
    const bad = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
    expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.html}`), `axe @${width}`).toEqual([])
  }
}

/** One buyer + optional guest holding seat #1, each seat on its own session `hours` from now. */
async function seedSeat(hours: number, opts: { guest?: boolean } = {}) {
  const course = await makeCourse(payload, "in_person")
  const start = new Date(Date.now() + hours * HOUR)
  const session = await payload.create({
    collection: "sessions",
    data: { course: course.id, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 3 * HOUR).toISOString(), capacity: 4, status: "scheduled" },
  })
  const buyer = await makeNamedCustomer(payload, { firstName: "Bea", lastName: "Buyer" })
  const guest = opts.guest ? await makeNamedCustomer(payload, { firstName: "Gus", lastName: "Guest" }) : null
  const order = await makePaidOrder(payload, buyer.id, course, { quantity: guest ? 2 : 1, sessionId: session.id })
  const own = await makeSeat(payload, { sessionId: session.id, customerId: buyer.id, orderId: order.id, index: 0 })
  const guestSeat = guest
    ? await makeSeat(payload, { sessionId: session.id, customerId: guest.id, orderId: order.id, index: 1, attendeeName: "Gus Guest" })
    : null
  return { course, session, buyer, guest, own, guestSeat }
}

test.describe("cancel seat", () => {
  test("refund tier (>= 72 h): dialog shows the exact refund, one POST, success toast", async ({ page }) => {
    const w = await seedSeat(96)
    await signIn(page, w.buyer.id, "en")
    let calls = 0
    await page.route("**/api/enrollments/*/cancel", async (route) => {
      calls += 1
      await new Promise((r) => setTimeout(r, 300))
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { outcome: "refund", amount: 5000 } }) })
    })
    await page.goto(P.sessions.en)
    const row = page.locator(`[data-enrollment-id="${w.own.id}"][data-seat-row]`)
    await row.locator("[data-cancel-trigger]").click()
    const dialog = page.locator("[data-cancel-dialog]")
    await expect(dialog).toBeVisible()
    await expect(dialog.locator("[data-cancel-outcome]")).toContainText(/refunded.*\$50\.00.*100\s?%/i)
    await audit(page)
    await shot(page, "en", "cancel-dialog-refund")
    // focus is trapped inside the dialog
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab")
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest("[data-cancel-dialog]")))).toBe(true)
    }
    const confirm = dialog.locator("[data-cancel-confirm]")
    await confirm.dblclick() // double-submit guard
    await expect(dialog).toBeHidden()
    expect(calls).toBe(1)
    await expect(page.getByText(/refund of \$50\.00 is on its way/i)).toBeVisible()
  })

  test("closing the dialog returns focus to the trigger", async ({ page }) => {
    const w = await seedSeat(96)
    await signIn(page, w.buyer.id, "fr")
    await page.goto(P.sessions.fr)
    const trigger = page.locator(`[data-enrollment-id="${w.own.id}"] [data-cancel-trigger]`)
    await trigger.click()
    await expect(page.locator("[data-cancel-outcome]")).toContainText(/remboursé.*50,00/)
    await audit(page)
    await shot(page, "fr", "cancel-dialog-refund")
    await page.keyboard.press("Escape")
    await expect(trigger).toBeFocused()
  })

  test("credit tier (48 h): credit wording, code emailed not shown; row becomes cancelled", async ({ page }) => {
    const w = await seedSeat(48)
    await signIn(page, w.buyer.id, "en")
    await page.goto(P.sessions.en)
    const row = page.locator(`[data-enrollment-id="${w.own.id}"][data-seat-row]`)
    await row.locator("[data-cancel-trigger]").click()
    const dialog = page.locator("[data-cancel-dialog]")
    await expect(dialog.locator("[data-cancel-outcome]")).toContainText(/credit of \$50\.00/i)
    await expect(dialog).toContainText(/sent to you by email/i)
    await dialog.locator("[data-cancel-confirm]").click()
    await expect(page.getByText(/credit code is sent to you by email/i)).toBeVisible()
    await expect(row).toHaveAttribute("data-status", "cancelled")
    await expect(row.locator("[data-cancel-trigger]")).toHaveCount(0)
    await expect(page.locator("body")).not.toContainText(/CFF-CR-/)
  })

  test("no-refund tier (< 24 h): says so, still cancellable", async ({ page }) => {
    const w = await seedSeat(10)
    await signIn(page, w.buyer.id, "fr")
    await page.goto(P.sessions.fr)
    const row = page.locator(`[data-enrollment-id="${w.own.id}"][data-seat-row]`)
    await row.locator("[data-cancel-trigger]").click()
    const dialog = page.locator("[data-cancel-dialog]")
    await expect(dialog.locator("[data-cancel-outcome]")).toContainText(/aucun remboursement ni crédit/i)
    await dialog.locator("[data-cancel-confirm]").click()
    await expect(row).toHaveAttribute("data-status", "cancelled")
  })

  test("error mapping: CONFLICT and UPSTREAM show their messages", async ({ page }) => {
    const w = await seedSeat(96)
    await signIn(page, w.buyer.id, "en")
    await page.goto(P.sessions.en)
    await page.route("**/api/enrollments/*/cancel", (route) =>
      route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "UPSTREAM" } }) }),
    )
    await page.locator(`[data-enrollment-id="${w.own.id}"] [data-cancel-trigger]`).click()
    await page.locator("[data-cancel-confirm]").click()
    await expect(page.locator("[data-cancel-error]")).toContainText(/refund is being processed/i)
    await expect(page.locator("[data-cancel-confirm]")).toBeEnabled()
    await page.unroute("**/api/enrollments/*/cancel")
    await page.route("**/api/enrollments/*/cancel", (route) =>
      route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "CONFLICT" } }) }),
    )
    await page.locator("[data-cancel-confirm]").click()
    await expect(page.getByText(/already cancelled or it is too late/i)).toBeVisible()
  })

  test("guest sees own seat without a button, with the buyer's first name", async ({ page }) => {
    const w = await seedSeat(96, { guest: true })
    await signIn(page, w.guest!.id, "en")
    await page.goto(P.sessions.en)
    const row = page.locator(`[data-enrollment-id="${w.guestSeat!.id}"][data-seat-row]`)
    await expect(row).toBeVisible()
    await expect(row.locator("[data-cancel-trigger]")).toHaveCount(0)
    await expect(row.locator('[data-cancel-blocked="NOT_BUYER"]')).toContainText("Bea")
    await expect(row).not.toContainText("Buyer")
    await audit(page)
    await shot(page, "en", "sessions-guest")
  })

  test("buyer can still cancel the guest seat they booked", async ({ page }) => {
    const w = await seedSeat(96, { guest: true })
    await signIn(page, w.buyer.id, "fr")
    await page.goto(P.sessions.fr)
    await expect(page.locator(`[data-enrollment-id="${w.guestSeat!.id}"] [data-cancel-trigger]`)).toBeVisible()
    await shot(page, "fr", "sessions-buyer")
  })

  test.describe.serial("self-cancel disabled", () => {
    test("shows the contact message with contactEmail", async ({ page }) => {
      const w = await seedSeat(96)
      await payload.updateGlobal({ slug: "site-settings", data: { contactEmail: "hello@example.com" }, overrideAccess: true })
      await payload.updateGlobal({ slug: "cancellation-policy", data: { customerCanSelfCancel: false }, overrideAccess: true })
      try {
        await signIn(page, w.buyer.id, "en")
        await page.goto(P.sessions.en)
        const row = page.locator(`[data-enrollment-id="${w.own.id}"][data-seat-row]`)
        await expect(row.locator("[data-cancel-trigger]")).toHaveCount(0)
        await expect(row.locator('[data-cancel-blocked="SELF_CANCEL_DISABLED"]')).toContainText(/hello@example\.com/)
        await audit(page)
      } finally {
        await payload.updateGlobal({ slug: "cancellation-policy", data: { customerCanSelfCancel: true }, overrideAccess: true })
      }
    })
  })
})

test.describe("certificates + progress", () => {
  async function seedLearner() {
    const online = await makeCourse(payload, "online")
    const done = await makeCourse(payload, "online")
    const customer = await makeNamedCustomer(payload, { firstName: "Lea", lastName: "Learner" })
    const lessons = [await makeLesson(payload, online.id, 0), await makeLesson(payload, online.id, 1), await makeLesson(payload, online.id, 2)]
    const doneLesson = await makeLesson(payload, done.id, 0)
    await grantCourse(payload, customer.id, online.id)
    await grantCourse(payload, customer.id, done.id)
    for (const [course, lesson] of [[online, lessons[0]!], [done, doneLesson]] as const) {
      await payload.create({
        collection: "lesson-progress",
        data: { customer: customer.id, lesson: lesson.id, course: course.id, completed: true, completedAt: new Date().toISOString() },
        overrideAccess: true,
      })
    }
    const code = Array.from({ length: 10 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("")
    const cert = await payload.create({
      collection: "certificates",
      data: {
        customer: customer.id,
        course: done.id,
        verificationCode: code,
        issuedAt: new Date().toISOString(),
        locale: "fr",
        customerNameSnapshot: "Lea Learner",
        courseTitleSnapshot: { fr: done.title, en: done.title },
      },
      overrideAccess: true,
    })
    return { customer, online, done, lessons, cert, code }
  }

  for (const locale of ["fr", "en"] as const) {
    test(`history lists the certificate + PDF downloads (${locale})`, async ({ page }) => {
      const w = await seedLearner()
      await signIn(page, w.customer.id, locale)
      await page.goto(P.history[locale])
      const card = page.locator(`[data-certificate-id="${w.cert.id}"]`)
      await expect(card).toBeVisible()
      await expect(card.locator("[data-certificate-code]")).toHaveText(w.code)
      const href = await card.locator("[data-certificate-download]").getAttribute("href")
      const res = await page.request.get(href!)
      expect(res.status()).toBe(200)
      expect(res.headers()["content-type"]).toContain("application/pdf")
      await audit(page)
      await shot(page, locale, "history-certificates")
    })

    test(`dashboard shows progress, continue and finished states (${locale})`, async ({ page }) => {
      const w = await seedLearner()
      await signIn(page, w.customer.id, locale)
      await page.goto(P.account[locale])
      const inProgress = page.locator(`[data-course-id="${w.online.id}"]`)
      const bar = inProgress.getByRole("progressbar")
      await expect(bar).toHaveAttribute("aria-valuenow", "33")
      const next = inProgress.locator("[data-continue-link]")
      await expect(next).toHaveAttribute("href", new RegExp(`/${w.lessons[1]!.id}$`))
      const finished = page.locator(`[data-course-id="${w.done.id}"]`)
      await expect(finished.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100")
      await expect(finished.locator("[data-progress-complete]")).toBeVisible()
      await expect(finished.locator("[data-certificate-link]")).toHaveAttribute("href", new RegExp(`/api/certificates/${w.cert.id}/pdf`))
      await audit(page)
      await shot(page, locale, "dashboard-progress")
    })
  }
})

test.describe("storefront waitlist", () => {
  async function seedFull() {
    const course = await makeCourse(payload, "in_person")
    const start = new Date(Date.now() + 10 * 24 * HOUR)
    const session = await payload.create({
      collection: "sessions",
      data: { course: course.id, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 3 * HOUR).toISOString(), capacity: 1, status: "scheduled" },
    })
    const buyer = await makeNamedCustomer(payload, { firstName: "Bea" })
    const order = await makePaidOrder(payload, buyer.id, course, { sessionId: session.id })
    await makeSeat(payload, { sessionId: session.id, customerId: buyer.id, orderId: order.id, index: 0 })
    return { course, session }
  }

  for (const locale of ["fr", "en"] as const) {
    test(`full session offers the waitlist; same email twice = same confirmation, one row (${locale})`, async ({ page }) => {
      const w = await seedFull()
      const email = `wait-${uid()}@example.com`
      await page.goto(`${P.course[locale]}/${w.course.slug}`)
      const cta = page.locator("[data-waitlist-cta]")
      await expect(cta).toBeVisible()
      await expect(page.locator("[data-seat-state='full']")).toBeVisible()
      await cta.click()
      await expect(page.locator("[data-waitlist-form]")).toBeVisible()
      await audit(page)
      await shot(page, locale, "course-waitlist")
      const confirmation = locale === "fr" ? /Nous vous écrirons si une place se libère/ : /We'll email you if a seat frees up/
      for (let i = 0; i < 2; i++) {
        if (i === 1) {
          await page.reload()
          await page.locator("[data-waitlist-cta]").click()
        }
        await page.getByLabel(locale === "fr" ? "Votre courriel" : "Your email").fill(email)
        await page.locator("[data-waitlist-submit]").click()
        await expect(page.locator("[data-waitlist-confirmation]")).toContainText(confirmation)
      }
      const rows = await payload.find({
        collection: "waitlist-entries",
        where: { and: [{ session: { equals: w.session.id } }, { email: { equals: email } }] },
        overrideAccess: true,
        limit: 5,
      })
      expect(rows.totalDocs).toBe(1)
    })
  }

  test("invalid email: inline error, no request", async ({ page }) => {
    const w = await seedFull()
    let calls = 0
    await page.route("**/api/waitlist", (route) => {
      calls += 1
      return route.abort()
    })
    await page.goto(`${P.course.en}/${w.course.slug}`)
    await page.locator("[data-waitlist-cta]").click()
    await page.getByLabel("Your email").fill("nope")
    await page.locator("[data-waitlist-submit]").click()
    await expect(page.getByRole("alert")).toContainText(/valid email/i)
    expect(calls).toBe(0)
  })
})
