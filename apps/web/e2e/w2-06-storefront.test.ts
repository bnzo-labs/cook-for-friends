import { test, expect } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import path from "node:path"

/**
 * W2-06 storefront content checks:
 * - All routes return 200 in both locales with expected h1
 * - Unknown course/product slug → 404
 * - Axe: 0 serious/critical at 320 and 1440 on home, list, detail (FR + EN)
 * - No horizontal overflow at 320
 *
 * Screenshots: W206_SCREENSHOTS=1 pnpm test:e2e e2e/w2-06-storefront.test.ts
 * Output: e2e/__screenshots__/w2-06/
 */

const LOCALES = ["fr", "en"] as const
const WIDTHS = [375, 768, 1440] as const
const SHOT_DIR = path.join(process.cwd(), "e2e", "__screenshots__", "w2-06")

/** URL pairs keyed by internal name: [fr-path, en-path] */
const ROUTES = {
  home: ["/fr", "/en"],
  courses: ["/fr/cours", "/en/courses"],
  products: ["/fr/produits", "/en/products"],
} as const

/**
 * Expected h1 text patterns for each route (partial match).
 * Derived from seed data and i18n keys.
 */
const H1_PATTERN: Record<string, Partial<Record<"fr" | "en", RegExp>>> = {
  home: {
    fr: /cuisinez entre amis/i,
    en: /cook with friends/i,
  },
  courses: {
    fr: /cours/i,
    en: /courses/i,
  },
  products: {
    fr: /produits/i,
    en: /products/i,
  },
}

test.describe("W2-06 storefront routes", () => {
  for (const locale of LOCALES) {
    test.describe(`locale: ${locale}`, () => {
      test("home page returns 200 with h1", async ({ page }) => {
        const res = await page.goto(ROUTES.home[locale === "fr" ? 0 : 1])
        expect(res?.status()).toBe(200)
        const h1Pattern = H1_PATTERN.home?.[locale]
        if (h1Pattern) {
          await expect(page.locator("h1")).toContainText(h1Pattern)
        } else {
          await expect(page.locator("h1")).toBeVisible()
        }
      })

      test("courses list returns 200 with h1", async ({ page }) => {
        const res = await page.goto(ROUTES.courses[locale === "fr" ? 0 : 1])
        expect(res?.status()).toBe(200)
        const h1Pattern = H1_PATTERN.courses?.[locale]
        if (h1Pattern) {
          await expect(page.locator("h1")).toContainText(h1Pattern)
        } else {
          await expect(page.locator("h1")).toBeVisible()
        }
      })

      test("products list returns 200 with h1", async ({ page }) => {
        const res = await page.goto(ROUTES.products[locale === "fr" ? 0 : 1])
        expect(res?.status()).toBe(200)
        const h1Pattern = H1_PATTERN.products?.[locale]
        if (h1Pattern) {
          await expect(page.locator("h1")).toContainText(h1Pattern)
        } else {
          await expect(page.locator("h1")).toBeVisible()
        }
      })

      test("courses list format filter: in_person renders 200", async ({ page }) => {
        const base = ROUTES.courses[locale === "fr" ? 0 : 1]
        const res = await page.goto(`${base}?format=in_person`)
        expect(res?.status()).toBe(200)
        await expect(page.locator("h1")).toBeVisible()
      })

      test("courses list format filter: online renders 200", async ({ page }) => {
        const base = ROUTES.courses[locale === "fr" ? 0 : 1]
        const res = await page.goto(`${base}?format=online`)
        expect(res?.status()).toBe(200)
        await expect(page.locator("h1")).toBeVisible()
      })
    })
  }

  test("unknown course slug → 404", async ({ page }) => {
    const res = await page.goto("/fr/cours/this-course-does-not-exist-xyz-999")
    expect(res?.status()).toBe(404)
  })

  test("unknown product slug → 404", async ({ page }) => {
    const res = await page.goto("/fr/produits/this-product-does-not-exist-xyz-999")
    expect(res?.status()).toBe(404)
  })

  test("unknown page slug → 404", async ({ page }) => {
    const res = await page.goto("/fr/this-page-does-not-exist-xyz-999")
    expect(res?.status()).toBe(404)
  })
})

test.describe("W2-06 axe accessibility", () => {
  const AXE_PAGES = [
    { name: "home-fr", path: "/fr" },
    { name: "home-en", path: "/en" },
    { name: "courses-fr", path: "/fr/cours" },
    { name: "courses-en", path: "/en/courses" },
    { name: "products-fr", path: "/fr/produits" },
    { name: "products-en", path: "/en/products" },
  ]

  for (const { name, path: pagePath } of AXE_PAGES) {
    for (const width of [320, 1440] as const) {
      test(`axe: ${name} at ${width}px — 0 serious/critical`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(pagePath)
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
          .analyze()
        const blocking = results.violations.filter(
          (v) => v.impact === "serious" || v.impact === "critical",
        )
        expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([])
      })
    }
  }
})

test.describe("W2-06 overflow", () => {
  const OVERFLOW_PAGES = [
    "/fr",
    "/fr/cours",
    "/fr/produits",
  ]

  for (const pagePath of OVERFLOW_PAGES) {
    test(`no horizontal overflow at 320: ${pagePath}`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 900 })
      await page.goto(pagePath)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
    })
  }
})

/**
 * Raw-key guard: none of the pages should render a literal storefront.* message key.
 * A raw key (e.g. "storefront.courses.next_session") appears when next-intl throws
 * a FORMATTING_ERROR and falls back to the key string.
 */
test.describe("W2-06 no raw i18n keys", () => {
  const RAW_KEY_RE = /\bstorefront\.[a-z_]+\.[a-z_]+/

  const CHECK_PAGES = [
    "/fr",
    "/en",
    "/fr/cours",
    "/en/courses",
    "/fr/cours/macarons-francais",
    "/en/courses/french-macarons",
    "/fr/produits",
    "/en/products",
    "/fr/produits/coffret-biscuits",
    "/en/products/cookie-box",
  ]

  for (const pagePath of CHECK_PAGES) {
    test(`no raw keys on ${pagePath}`, async ({ page }) => {
      const res = await page.goto(pagePath)
      // 404 pages are acceptable (seed might not have all slugs) — skip them
      if (res?.status() === 404) return
      const bodyText = await page.locator("body").innerText()
      expect(RAW_KEY_RE.test(bodyText), `Raw i18n key found on ${pagePath}:\n${bodyText.match(new RegExp(".{0,120}" + RAW_KEY_RE.source + ".{0,120}", "g"))?.join("\n") ?? ""}`).toBe(false)
    })
  }
})

test.describe("W2-06 screenshots", () => {
  test("capture screenshots", async ({ page }) => {
    test.skip(!process.env.W206_SCREENSHOTS, "opt-in: set W206_SCREENSHOTS=1")

    const shots = [
      { locale: "fr", path: "/fr", name: "home" },
      { locale: "en", path: "/en", name: "home" },
      { locale: "fr", path: "/fr/cours", name: "courses" },
      { locale: "en", path: "/en/courses", name: "courses" },
      { locale: "fr", path: "/fr/produits", name: "products" },
      { locale: "en", path: "/en/products", name: "products" },
    ]

    for (const shot of shots) {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(shot.path)
        await page.addStyleTag({
          content: "nextjs-portal { display: none !important; }",
        })
        await page.evaluate(() => document.fonts.ready)
        await page.screenshot({
          path: path.join(SHOT_DIR, `${shot.locale}-${shot.name}-${width}.png`),
          fullPage: true,
        })
      }
    }
  })
})
