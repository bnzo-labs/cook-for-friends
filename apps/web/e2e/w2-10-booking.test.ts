import { test, expect, type Page, type Route } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import path from "node:path"

/**
 * W2-10 booking UI (local, dev data). /api/checkout is intercepted with page.route:
 * UI test only, the real purchase is W2-12.
 * Seed: "macarons-francais" has a capacity-1 session (3rd session).
 * Screenshots: W210_SCREENSHOTS=1 -> e2e/__screenshots__/w2-10/
 */

const SHOT_DIR = path.join(process.cwd(), "e2e", "__screenshots__", "w2-10")
/** macarons: capacity-1 session. sourdough: session with capacity 6 (multi-seat). */
const COURSES = {
  one: { fr: "/fr/cours/macarons-francais", en: "/en/courses/french-macarons" },
  big: { fr: "/fr/cours/pain-au-levain", en: "/en/courses/sourdough-bread" },
} as const
type Kind = keyof typeof COURSES
const STUB_URL = "https://checkout.stripe.test/c/pay/stub"

type Seat = { id: string; left: number }

async function sessions(page: Page, locale: "fr" | "en", kind: Kind = "big"): Promise<Seat[]> {
  await page.goto(COURSES[kind][locale])
  const rows = page.locator("[data-session-id]")
  await expect(rows.first()).toBeVisible({ timeout: 15_000 })
  return rows.evaluateAll((els) =>
    els.map((e) => ({ id: e.getAttribute("data-session-id") ?? "", left: Number(e.getAttribute("data-seats-left")) })),
  )
}

async function openCart(page: Page, locale: "fr" | "en", kind: Kind, qty?: number) {
  const list = await sessions(page, locale, kind)
  const seat = kind === "one" ? oneSeat(list) : bigSeat(list)
  await page.locator(`[data-session-id="${seat.id}"] a`).click()
  await expect(page).toHaveURL(new RegExp(`session=${seat.id}`))
  if (qty) await page.locator("#quantity").selectOption(String(qty))
  return seat
}

const bigSeat = (s: Seat[]): Seat => s.find((x) => x.left >= 3) ?? s[0]!
const oneSeat = (s: Seat[]): Seat => s.find((x) => x.left === 1) ?? s[s.length - 1]!

async function stubCheckout(page: Page, handler: (route: Route, body: unknown) => Promise<void> | void) {
  const bodies: unknown[] = []
  await page.route("**/api/checkout", async (route) => {
    if (route.request().method() !== "POST") return route.continue()
    const body = route.request().postDataJSON() as unknown
    bodies.push(body)
    await handler(route, body)
  })
  return bodies
}

const okStub = (route: Route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { checkoutUrl: STUB_URL, holdExpiresAt: "2099-01-01T00:00:00Z" } }) })

test.describe("W2-10 availability", () => {
  test("session list shows seat states and Book CTAs (FR)", async ({ page }) => {
    const list = await sessions(page, "fr", "one")
    expect(list.some((s) => s.left === 1)).toBe(true)
    await expect(page.locator('[data-seat-state="low"]').first()).toBeVisible()
    await expect(page.getByRole("link", { name: /réserver/i }).first()).toBeVisible()
  })
  test("Book leads to the cart with the right session", async ({ page }) => {
    const seat = await openCart(page, "en", "big")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your booking")
    await expect(page.locator("#quantity")).toBeVisible()
    expect(page.url()).toContain(`session=${seat.id}`)
  })
  test("online course shows Buy, no quantity or guests", async ({ page }) => {
    await page.goto("/en/courses?format=online")
    await page.locator("main a[href*='/courses/']").first().click()
    await page.getByRole("link", { name: /buy/i }).click()
    await expect(page).toHaveURL(/course=\d+/)
    await expect(page.locator("#quantity")).toHaveCount(0)
    await expect(page.getByRole("button", { name: /pay/i })).toBeVisible()
  })
})

test.describe("W2-10 cart", () => {
  test("invalid selection -> friendly empty state, 200", async ({ page }) => {
    for (const url of ["/fr/panier", "/en/cart?session=abc", "/en/cart?session=99999999"]) {
      const res = await page.goto(url)
      expect(res?.status()).toBe(200)
      await expect(page.getByRole("link", { name: /courses|cours/i }).last()).toBeVisible()
    }
  })

  test("picker max = min(setting, available) on capacity-1 session", async ({ page }) => {
    await openCart(page, "en", "one")
    await expect(page.locator("#quantity option")).toHaveCount(1)
  })

  test("N=1 posts exact body then redirects", async ({ page }) => {
    const bodies = await stubCheckout(page, okStub)
    const seat = await openCart(page, "en", "one")
    await page.route(STUB_URL, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "stub" }))
    await page.getByRole("button", { name: /pay/i }).click()
    await page.waitForURL(STUB_URL)
    expect(bodies).toHaveLength(1)
    const line = (bodies[0] as { lines: Array<Record<string, unknown>> }).lines[0]!
    expect(line).toEqual({ courseId: expect.any(Number), sessionId: Number(seat.id), quantity: 1 })
    expect(bodies[0]).toMatchObject({ locale: "en" })
    expect(bodies[0]).not.toHaveProperty("email")
  })

  test("N=3 posts two guests, nothing in URL, duplicate/required validated", async ({ page }) => {
    const bodies = await stubCheckout(page, okStub)
    await openCart(page, "en", "big", 3)
    const pay = page.getByRole("button", { name: /pay/i })

    await pay.click()
    await expect(page.locator("#buyer-email-error")).toBeVisible()
    await expect(page.locator("#buyer-email")).toBeFocused()

    await page.locator("#buyer-email").fill("me@example.com")
    await page.locator("#guest-0-firstName").fill("Ana")
    await page.locator("#guest-0-lastName").fill("Lee")
    await page.locator("#guest-0-email").fill("ME@example.com")
    await page.locator("#guest-1-firstName").fill("Bo")
    await page.locator("#guest-1-lastName").fill("Kim")
    await page.locator("#guest-1-email").fill("bo@example.com")
    await pay.click()
    await expect(page.locator("#guest-0-email-error")).toBeVisible()
    expect(bodies).toHaveLength(0)

    await page.locator("#guest-0-email").fill("ana@example.com")
    await page.route(STUB_URL, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "stub" }))
    await pay.click()
    await page.waitForURL(STUB_URL)
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toMatchObject({
      locale: "en",
      email: "me@example.com",
      lines: [
        {
          quantity: 3,
          attendees: [
            { firstName: "Ana", lastName: "Lee", email: "ana@example.com" },
            { firstName: "Bo", lastName: "Kim", email: "bo@example.com" },
          ],
        },
      ],
    })
    expect(page.url()).not.toContain("ana@")
  })

  test("guest data never reaches the URL", async ({ page }) => {
    await openCart(page, "en", "big", 2)
    await page.locator("#guest-0-firstName").fill("Secret")
    await page.locator("#guest-0-email").fill("secret@example.com")
    expect(page.url()).not.toMatch(/secret/i)
    expect(page.url()).toContain("qty=2")
  })

  test("stubbed VALIDATION issue lands on the right guest field", async ({ page }) => {
    await stubCheckout(page, (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: {
            code: "VALIDATION",
            messageKey: "errors.VALIDATION",
            details: { issues: [{ path: "lines.0.attendees.1.email", message: "errors.ATTENDEE_EMAIL_DUPLICATE" }] },
          },
        }),
      }),
    )
    await openCart(page, "en", "big", 3)
    await page.locator("#buyer-email").fill("me@example.com")
    for (const i of [0, 1]) {
      await page.locator(`#guest-${i}-firstName`).fill("A")
      await page.locator(`#guest-${i}-lastName`).fill("B")
      await page.locator(`#guest-${i}-email`).fill(`g${i}@example.com`)
    }
    await page.getByRole("button", { name: /pay/i }).click()
    await expect(page.locator("#guest-1-email-error")).toContainText(/different email/i)
    await expect(page.locator("#guest-1-email")).toBeFocused()
    await expect(page.locator("#guest-0-email-error")).toHaveCount(0)
  })

  test("error envelope shows localized message (FR rate limit)", async ({ page }) => {
    await stubCheckout(page, (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: { code: "RATE_LIMITED", messageKey: "errors.CHECKOUT_RATE_LIMITED" } }),
      }),
    )
    await openCart(page, "fr", "one")
    await page.getByRole("button", { name: /payer/i }).click()
    await expect(page.locator("#booking-alert")).toContainText(/trop de tentatives/i)
    await expect(page.locator("#booking-alert")).not.toContainText("errors.")
  })

  test("SOLD_OUT with details.available clamps picker", async ({ page }) => {
    await stubCheckout(page, (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: { code: "SOLD_OUT", messageKey: "errors.SOLD_OUT", details: { available: 1 } } }),
      }),
    )
    await openCart(page, "en", "big", 3)
    await page.locator("#buyer-email").fill("me@example.com")
    for (const i of [0, 1]) {
      await page.locator(`#guest-${i}-firstName`).fill("A")
      await page.locator(`#guest-${i}-lastName`).fill("B")
      await page.locator(`#guest-${i}-email`).fill(`g${i}@example.com`)
    }
    await page.getByRole("button", { name: /pay/i }).click()
    await expect(page.locator("#booking-alert")).toContainText(/only 1 seat left/i)
    await expect(page.locator("#quantity option")).toHaveCount(1)
  })
})

test.describe("W2-10 success / cancelled", () => {
  test("success renders with and without session_id", async ({ page }) => {
    for (const url of ["/fr/commande/merci", "/en/checkout/success?session_id=cs_test_x"]) {
      const res = await page.goto(url)
      expect(res?.status()).toBe(200)
      await expect(page.locator("h1")).toBeVisible()
    }
  })
  test("cancelled calls release exactly once", async ({ page }) => {
    let calls = 0
    await page.route("**/api/checkout/release", (route) => {
      calls += 1
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { released: 1 } }) })
    })
    const res = await page.goto("/en/checkout/cancelled")
    expect(res?.status()).toBe(200)
    await expect(page.getByRole("status")).toContainText(/released/i)
    await page.waitForTimeout(300)
    expect(calls).toBe(1)
  })
})

test.describe("W2-10 axe + overflow", () => {
  const pages = (seat: string) => [
    { name: "cart-fr", url: `/fr/panier?session=${seat}&qty=2` },
    { name: "cart-en", url: `/en/cart?session=${seat}&qty=2` },
    { name: "success-fr", url: "/fr/commande/merci" },
    { name: "success-en", url: "/en/checkout/success" },
    { name: "cancelled-fr", url: "/fr/commande/annulee" },
    { name: "cancelled-en", url: "/en/checkout/cancelled" },
  ]
  for (const width of [320, 1440] as const) {
    test(`axe 0 serious/critical + no overflow at ${width}`, async ({ page }) => {
      test.setTimeout(120_000)
      await page.setViewportSize({ width, height: 900 })
      const list = await sessions(page, "en")
      const seat = bigSeat(list).id
      for (const p of pages(seat)) {
        await page.goto(p.url)
        await expect(page.locator("h1")).toBeVisible()
        const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze()
        const blocking = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
        expect(blocking, `${p.name}: ${JSON.stringify(blocking, null, 2)}`).toEqual([])
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        expect(overflow, `${p.name} overflow`).toBeLessThanOrEqual(0)
      }
    })
  }
})

test.describe("W2-10 screenshots", () => {
  test("capture", async ({ page }) => {
    test.skip(!process.env.W210_SCREENSHOTS, "opt-in: set W210_SCREENSHOTS=1")
    test.setTimeout(240_000)
    for (const locale of ["fr", "en"] as const) {
      for (const width of [320, 768, 1440] as const) {
        await page.setViewportSize({ width, height: 900 })
        const list = await sessions(page, locale)
        const shot = async (name: string) => {
          await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" })
          await page.evaluate(() => document.fonts.ready)
          await page.screenshot({ path: path.join(SHOT_DIR, `${locale}-${name}-${width}.png`), fullPage: true })
        }
        await shot("course-sessions")
        await page.goto(`/${locale}/${locale === "fr" ? "panier" : "cart"}?session=${bigSeat(list).id}&qty=3`)
        await shot("cart-3")
        await page.goto(`/${locale}/${locale === "fr" ? "commande/merci" : "checkout/success"}`)
        await shot("success")
        await page.route("**/api/checkout/release", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }))
        await page.goto(`/${locale}/${locale === "fr" ? "commande/annulee" : "checkout/cancelled"}`)
        await expect(page.getByRole("status")).toContainText(/.{10,}/)
        await shot("cancelled")
      }
    }
  })
})
