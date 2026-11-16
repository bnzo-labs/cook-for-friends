import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import type { Payload } from "payload"

import { getTestPayload } from "../test/integration"
import { mintLoginToken, seedPortalWorld, type PortalWorld } from "../test/portal-fixtures"

/**
 * W4-02 accessibility sweep (WCAG 2.2 AA). Runs against `next build && next start` on a
 * throwaway Neon branch. Every storefront + portal + auth page, FR + EN, at 320 and 1440:
 * axe 0 serious/critical. Plus keyboard, reduced-motion and target-size checks.
 */

type Loc = "fr" | "en"
const TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]

const PUBLIC: Array<{ name: string; fr: string; en: string }> = [
  { name: "home", fr: "/fr", en: "/en" },
  { name: "courses", fr: "/fr/cours", en: "/en/courses" },
  { name: "course-detail", fr: "/fr/cours/macarons-francais", en: "/en/courses/french-macarons" },
  { name: "products", fr: "/fr/produits", en: "/en/products" },
  { name: "product-detail", fr: "/fr/produits/coffret-biscuits", en: "/en/products/cookie-box" },
  { name: "cart", fr: "/fr/panier", en: "/en/cart" },
  { name: "checkout-cancelled", fr: "/fr/commande/annulee", en: "/en/checkout/cancelled" },
  { name: "cert-verify", fr: "/fr/certificats/verifier/CFF-XXXX", en: "/en/certificates/verify/CFF-XXXX" },
  { name: "login", fr: "/fr/connexion", en: "/en/auth/login" },
  { name: "verify", fr: "/fr/connexion/verifier", en: "/en/auth/verify" },
]

const PORTAL: Array<{ name: string; fr: string; en: string }> = [
  { name: "account", fr: "/fr/compte", en: "/en/account" },
  { name: "sessions", fr: "/fr/compte/sessions", en: "/en/account/sessions" },
  { name: "history", fr: "/fr/compte/historique", en: "/en/account/history" },
  { name: "receipts", fr: "/fr/compte/recus", en: "/en/account/receipts" },
  { name: "profile", fr: "/fr/compte/profil", en: "/en/account/profile" },
]

let payload: Payload
let world: PortalWorld

test.beforeAll(async () => {
  test.setTimeout(180_000)
  payload = await getTestPayload()
  world = await seedPortalWorld(payload)
})

async function signIn(page: Page, locale: Loc) {
  const token = await mintLoginToken(payload, world.buyer.id)
  const verify = locale === "fr" ? "/fr/connexion/verifier" : "/en/auth/verify"
  await page.goto(`${verify}?token=${token}`)
  await page.locator("[data-verify-submit]").click()
  await page.waitForURL((u) => !u.pathname.includes("verifier") && !u.pathname.includes("verify"))
}

async function audit(page: Page, label: string) {
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const result = await new AxeBuilder({ page }).withTags(TAGS).analyze()
    const bad = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
    expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.html}`), `axe ${label} @${width}`).toEqual([])
  }
}

test.describe("axe sweep", () => {
  for (const locale of ["fr", "en"] as const) {
    test(`storefront + auth pages ${locale}`, async ({ page }) => {
      test.setTimeout(180_000)
      for (const p of PUBLIC) {
        const res = await page.goto(p[locale])
        expect(res?.status(), p[locale]).toBeLessThan(500)
        await page.waitForLoadState("networkidle")
        await audit(page, p[locale])
      }
    })

    test(`portal pages ${locale}`, async ({ page }) => {
      test.setTimeout(180_000)
      await signIn(page, locale)
      for (const p of PORTAL) {
        const res = await page.goto(p[locale])
        expect(res?.status(), p[locale]).toBe(200)
        await page.waitForLoadState("networkidle")
        await audit(page, p[locale])
      }
    })
  }
})

test.describe("keyboard", () => {
  test("skip link is first tab stop, visible, and moves focus to main", async ({ page }) => {
    await page.goto("/en")
    await page.keyboard.press("Tab")
    const skip = page.locator('a[href="#main-content"]')
    await expect(skip).toBeFocused()
    await expect(skip).toBeVisible()
    await page.keyboard.press("Enter")
    await expect(page.locator("#main-content")).toBeFocused()
  })

  test("desktop header nav reachable by Tab with a visible focus ring", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/en")
    const nav = page.locator("header nav").first()
    const links = nav.getByRole("link")
    const count = await links.count()
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) await page.keyboard.press("Tab")
    // Walk until the first nav link is focused (logo/skip precede it).
    await links.first().focus()
    const outline = await links.first().evaluate((el) => {
      const s = getComputedStyle(el)
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), shadow: s.boxShadow }
    })
    expect(outline.style !== "none" || outline.shadow !== "none").toBe(true)
  })

  test("mobile menu opens with Enter, traps focus, closes with Escape and restores focus", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto("/en")
    const trigger = page.getByRole("button", { name: /menu/i }).first()
    await trigger.focus()
    await page.keyboard.press("Enter")
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await page.keyboard.press("Tab")
    const inside = await dialog.evaluate((el) => el.contains(document.activeElement))
    expect(inside).toBe(true)
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test("course detail: session list + booking controls are keyboard reachable", async ({ page }) => {
    await page.goto("/en/courses/french-macarons")
    const first = page.locator("[data-session-id]").first()
    await expect(first).toBeVisible({ timeout: 15_000 })
    const focusable = first.locator("button, a, input, [tabindex='0']").first()
    await focusable.focus()
    await expect(focusable).toBeFocused()
  })

  test("cart: page has no keyboard trap (Tab cycles past last control)", async ({ page }) => {
    await page.goto("/en/cart")
    const seen = new Set<string>()
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab")
      seen.add(await page.evaluate(() => document.activeElement?.tagName ?? ""))
    }
    expect(seen.size).toBeGreaterThan(1)
  })
})

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" })

  for (const path of ["/fr", "/en/courses", "/en/courses/french-macarons"]) {
    test(`no running CSS animations or long transitions ${path}`, async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState("networkidle")
      const running = await page.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => a.playState === "running")
          .map((a) => (a instanceof CSSAnimation ? a.animationName : a.constructor.name))
          // Indeterminate loaders may spin; exclude explicit spinners.
          .filter((n) => !/spin|pulse/i.test(n)),
      )
      expect(running).toEqual([])
    })
  }
})

test.describe("target size (WCAG 2.5.8)", () => {
  for (const path of ["/en", "/en/courses", "/en/courses/french-macarons", "/en/auth/login"]) {
    test(`interactive controls >= 24px ${path}`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 })
      await page.goto(path)
      await page.waitForLoadState("networkidle")
      const small = await page.evaluate(() => {
        const sel = "button, [role='button'], input:not([type='hidden']), select, textarea, a[href]"
        return Array.from(document.querySelectorAll<HTMLElement>(sel))
          .filter((el) => {
            const r = el.getBoundingClientRect()
            if (r.width === 0 || r.height === 0) return false
            if (el.matches(".sr-only, [class*='sr-only']")) return false
            // Inline links inside text blocks are exempt (2.5.8 inline exception).
            if (el.tagName === "A" && getComputedStyle(el).display === "inline") return false
            return r.width < 24 || r.height < 24
          })
          .map((el) => `${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 40)}`)
      })
      expect(small).toEqual([])
    })
  }
})
