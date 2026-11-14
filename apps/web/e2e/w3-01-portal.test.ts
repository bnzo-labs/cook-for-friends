import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import path from "node:path"
import type { Payload } from "payload"

import { getTestPayload } from "../test/integration"
import { mintLoginToken, seedPortalWorld, type PortalWorld } from "../test/portal-fixtures"

/**
 * W3-01 portal shell. Runs against `next build && next start` on a THROWAWAY Neon
 * branch (TEST_DATABASE_URL === the server's DATABASE_URL). Tokens are minted
 * straight into `magic-link-tokens` (same row requestMagicLink writes): no inbox.
 * Screenshots: W301_SCREENSHOTS=1 -> e2e/__screenshots__/w3-01/<locale>-<name>-<width>.png
 */

const SHOT_DIR = path.join(process.cwd(), "e2e", "__screenshots__", "w3-01")
const SHOTS = process.env.W301_SCREENSHOTS === "1"
const WIDTHS = [320, 768, 1440] as const

type Loc = "fr" | "en"
const P = {
  login: { fr: "/fr/connexion", en: "/en/auth/login" },
  verify: { fr: "/fr/connexion/verifier", en: "/en/auth/verify" },
  account: { fr: "/fr/compte", en: "/en/account" },
  sessions: { fr: "/fr/compte/sessions", en: "/en/account/sessions" },
  history: { fr: "/fr/compte/historique", en: "/en/account/history" },
  receipts: { fr: "/fr/compte/recus", en: "/en/account/receipts" },
  profile: { fr: "/fr/compte/profil", en: "/en/account/profile" },
} as const

let payload: Payload
let w: PortalWorld

test.beforeAll(async () => {
  test.setTimeout(180_000)
  payload = await getTestPayload()
  w = await seedPortalWorld(payload)
})

async function signIn(page: Page, customerId: number, locale: Loc, next?: string) {
  const token = await mintLoginToken(payload, customerId, next)
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

async function audit(page: Page) {
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()
    const bad = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
    expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.html}`), `axe @${width}`).toEqual([])
    if (width === 320) {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, "horizontal overflow @320").toBeLessThanOrEqual(0)
    }
  }
}

test.describe("guard", () => {
  for (const locale of ["fr", "en"] as const) {
    test(`signed out ${locale}: every portal page redirects to localized login with next`, async ({ page }) => {
      for (const key of ["account", "sessions", "history", "receipts", "profile"] as const) {
        await page.goto(P[key][locale])
        const url = new URL(page.url())
        expect(url.pathname).toBe(P.login[locale])
        expect(url.searchParams.get("next")).toBe(P[key][locale])
      }
    })
  }

  test("portal responses are private, no-store, noindex", async ({ page }) => {
    await signIn(page, w.buyer.id, "fr")
    const res = await page.goto(P.account.fr)
    expect(res?.headers()["cache-control"]).toMatch(/no-store/)
    expect(res?.headers()["cache-control"]).toMatch(/private|no-cache/)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/)
  })

  test("bogus locale 404s before any data call", async ({ page }) => {
    const res = await page.goto("/xx/account")
    expect(res?.status()).toBe(404)
  })
})

test.describe("login + verify", () => {
  test("login form: same inbox state for any address, FR + EN, axe", async ({ page }) => {
    for (const locale of ["fr", "en"] as const) {
      await page.goto(P.login[locale])
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      await audit(page)
      await shot(page, locale, "login")
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.getByLabel(locale === "fr" ? "Courriel" : "Email").fill(`nobody-${Date.now()}@example.com`)
      await page.getByRole("button", { name: /lien|link/i }).click()
      await expect(page.locator("[data-login-sent]")).toBeVisible()
    }
  })

  test("login form: invalid email inline, rate limit and server error alerts", async ({ page }) => {
    await page.goto(P.login.en)
    const input = page.getByLabel("Email")
    await input.fill("not-an-email")
    await page.getByRole("button", { name: /email me/i }).click()
    await expect(input).toHaveAttribute("aria-invalid", "true")
    await expect(page.locator("#login-email-error")).toBeVisible()
    await expect(input).toHaveAttribute("aria-describedby", /login-email-error/)

    for (const [status, text] of [[429, /too many/i], [500, /couldn't send/i]] as const) {
      await page.route("**/api/auth/magic-link/request", (r) => r.fulfill({ status, contentType: "application/json", body: "{}" }))
      await input.fill("a@example.com")
      await page.getByRole("button", { name: /email me/i }).click()
      await expect(page.getByRole("alert").first()).toContainText(text)
      await page.unroute("**/api/auth/magic-link/request")
    }
  })

  for (const locale of ["fr", "en"] as const) {
    test(`verify ${locale}: GET never consumes, click signs in, token stripped, replay is invalid`, async ({ page, request }) => {
      const token = await mintLoginToken(payload, w.buyer.id, P.account[locale])
      const url = `${P.verify[locale]}?token=${token}`
      // Scanner-style prefetches do nothing to the token.
      for (let i = 0; i < 2; i += 1) expect((await request.get(url)).status()).toBe(200)
      await page.goto(url)
      await audit(page)
      await shot(page, locale, "verify")
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.locator("[data-verify-submit]").click()
      await page.waitForURL(`**${P.account[locale]}`)
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      // Token gone from this entry's URL and from history.
      const entries = await page.evaluate(() => performance.getEntriesByType("navigation").map((e) => e.name))
      expect(entries.join(" ")).not.toContain(token)
      // Replay: same token is now invalid.
      await page.goto(url)
      await page.locator("[data-verify-submit]").click()
      await expect(page.locator("[data-verify-invalid]")).toBeVisible()
      await expect(page).not.toHaveURL(/token=/)
      await page.getByRole("link", { name: /lien|link/i }).click()
      await expect(page).toHaveURL(new RegExp(`${P.login[locale]}$`))
    })
  }

  test("verify without a token shows the invalid state; next is honoured", async ({ page }) => {
    await page.goto(P.verify.en)
    await expect(page.locator("[data-verify-invalid]")).toBeVisible()
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer")
    await signIn(page, w.buyer.id, "en", "/en/account/receipts")
    await expect(page).toHaveURL(/\/en\/account\/receipts$/)
  })

  test("logout form signs out", async ({ page }) => {
    await signIn(page, w.buyer.id, "en", P.account.en)
    await page.getByRole("button", { name: "Sign out" }).click()
    await page.waitForURL("**/en")
    await page.goto(P.account.en)
    await expect(page).toHaveURL(new RegExp(`${P.login.en}`))
  })
})

test.describe("pages", () => {
  for (const locale of ["fr", "en"] as const) {
    test(`buyer ${locale}: dashboard, sessions, history, receipts, profile render + axe`, async ({ page }) => {
      await signIn(page, w.buyer.id, "fr", P.account[locale])
      await page.goto(P.account[locale])
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Bea")
      await expect(page.locator("[data-owned-course]")).toHaveCount(1)
      await expect(page.locator("[data-community]")).toHaveCount(0)
      await audit(page)
      await shot(page, locale, "dashboard")

      await page.goto(P.sessions[locale])
      await expect(page.locator("[data-seat-row]")).toHaveCount(3)
      await expect(page.locator("[data-guest-badge]")).toHaveCount(2)
      await expect(page.locator("[data-cancel-slot]")).toHaveCount(3)
      await expect(page.locator("[data-guest-badge]").first()).toContainText(/Invité·e|Guest/)
      await audit(page)
      await shot(page, locale, "sessions")

      await page.goto(P.history[locale])
      await expect(page.locator("[data-empty-state]")).toBeVisible()
      await expect(page.locator("#certificates")).toBeAttached()
      await audit(page)
      await shot(page, locale, "history")

      await page.goto(P.receipts[locale])
      await expect(page.locator("[data-order-row]")).toHaveCount(2)
      await expect(page.locator("[data-order-row]").first()).toHaveAttribute("data-order-number", w.onlineOrder.number)
      await expect(page.locator("[data-receipt-link]")).toHaveCount(1)
      await expect(page.locator("[data-receipt-pending]")).toHaveCount(1)
      await expect(page.locator("[data-receipt-link]")).toHaveAttribute("href", `/api/orders/${w.seatsOrder.id}/receipt`)
      await audit(page)
      await shot(page, locale, "receipts")

      await page.goto(P.profile[locale])
      await expect(page.locator("#profile-consent")).not.toBeChecked()
      await expect(page.locator("#profile-email")).toHaveValue(w.buyer.email)
      await expect(page.locator("#profile-email")).toHaveAttribute("readonly", "")
      await audit(page)
      await shot(page, locale, "profile")
    })

    test(`guest ${locale}: only own seat, no cards, no guest badge`, async ({ page }) => {
      await signIn(page, w.guest1.id, "fr", P.sessions[locale])
      await expect(page.locator("[data-seat-row]")).toHaveCount(1)
      await expect(page.locator("[data-guest-badge]")).toHaveCount(0)
      await page.goto(P.account[locale])
      await expect(page.locator("[data-owned-course]")).toHaveCount(0)
      await expect(page.locator("#courses [data-empty-state]")).toBeVisible()
    })

    test(`empty customer ${locale}: EmptyState + CTA to the catalog on every list`, async ({ page }) => {
      await signIn(page, w.empty.id, "en", P.account[locale])
      const catalog = locale === "fr" ? "/fr/cours" : "/en/courses"
      for (const key of ["sessions", "history", "receipts", "account"] as const) {
        await page.goto(P[key][locale])
        const empty = page.locator("[data-empty-state]").first()
        await expect(empty).toBeVisible()
        await expect(empty.getByRole("link")).toHaveAttribute("href", catalog)
      }
      await shot(page, locale, "empty")
    })
  }

  test("community link: hidden while empty, safe external link when set", async ({ page }) => {
    await signIn(page, w.buyer.id, "en", P.account.en)
    await expect(page.locator("[data-community]")).toHaveCount(0)
    await payload.updateGlobal({ slug: "site-settings", data: { communityUrl: "https://chat.example.com/cff" }, overrideAccess: true })
    try {
      await page.goto(P.account.en)
      const link = page.locator("[data-community] a")
      await expect(link).toHaveAttribute("target", "_blank")
      await expect(link).toHaveAttribute("rel", "noopener noreferrer")
      await expect(link).toContainText("(opens in a new tab)")
      await audit(page)
      await shot(page, "en", "community")
    } finally {
      await payload.updateGlobal({ slug: "site-settings", data: { communityUrl: "" }, overrideAccess: true })
    }
  })
})

test.describe("profile", () => {
  test("save, inline validation, locale switch redirect", async ({ page }) => {
    const c = await payload.create({ collection: "customers", data: { email: `prof-${Date.now()}@example.com`, preferredLocale: "en" }, overrideAccess: true })
    await signIn(page, c.id as number, "en", P.profile.en)
    await expect(page.locator("#profile-consent")).not.toBeChecked()

    await page.locator("#profile-phone").fill("call me maybe")
    await page.getByRole("button", { name: "Save" }).click()
    await expect(page.locator("#profile-phone")).toHaveAttribute("aria-invalid", "true")
    await expect(page.locator("#profile-phone")).toHaveAttribute("aria-describedby", /profile-phone-error/)
    await expect(page.locator("#profile-phone-error")).toContainText("valid phone")

    await page.locator("#profile-first").fill("Ada")
    await page.locator("#profile-last").fill("Lovelace")
    await page.locator("#profile-phone").fill("+1 514 555 0100")
    await page.locator("#profile-consent").check()
    await page.getByRole("button", { name: "Save" }).click()
    await expect(page.locator("[data-profile-saved]")).toBeVisible()
    const saved = await payload.findByID({ collection: "customers", id: c.id, overrideAccess: true })
    expect(saved).toMatchObject({ firstName: "Ada", lastName: "Lovelace", phone: "+1 514 555 0100", marketingConsent: true, preferredLocale: "en" })

    await page.locator("#profile-language").selectOption("fr")
    await page.getByRole("button", { name: "Save" }).click()
    await page.waitForURL("**/fr/compte/profil?saved=1")
    await expect(page.locator("[data-profile-saved]")).toContainText("Profil enregistré")
    expect((await payload.findByID({ collection: "customers", id: c.id, overrideAccess: true })).preferredLocale).toBe("fr")
  })
})

test.describe("keyboard", () => {
  test("account menu is reachable and operable by keyboard only", async ({ page }) => {
    await signIn(page, w.buyer.id, "en", P.account.en)
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.locator("main").focus()
    const nav = page.getByRole("navigation", { name: "Account menu" })
    const labels = ["Dashboard", "My courses", "My sessions", "History", "Receipts", "Profile", "Sign out"]
    await nav.getByRole("link", { name: "Dashboard" }).focus()
    for (const label of labels.slice(1)) {
      await page.keyboard.press("Tab")
      await expect(nav.getByRole(label === "Sign out" ? "button" : "link", { name: label })).toBeFocused()
    }
    await nav.getByRole("link", { name: "My sessions" }).focus()
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/\/en\/account\/sessions$/)
    await expect(page.getByRole("navigation", { name: "Account menu" }).getByRole("link", { name: "My sessions" })).toHaveAttribute("aria-current", "page")
  })
})
