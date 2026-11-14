import { test, expect, type Page } from "@playwright/test"

/**
 * W3-06 SEO + PWA.
 * Run against a production build (`next build && next start`): the service
 * worker only registers when NODE_ENV=production.
 * Assumes SEO_INDEXABLE_HOSTS does not list the test host (noindex default).
 */

const COURSE = {
  fr: "/fr/cours/pain-au-levain",
  en: "/en/courses/sourdough-bread",
} as const

async function jsonLd(page: Page): Promise<Array<Record<string, unknown>>> {
  const raw = await page.locator('script[type="application/ld+json"]').allTextContents()
  return raw.flatMap((t) => {
    const parsed: unknown = JSON.parse(t)
    return (Array.isArray(parsed) ? parsed : [parsed]) as Array<Record<string, unknown>>
  })
}

test.describe("W3-06 metadata", () => {
  test("course detail: canonical + hreflang with translated slugs, FR and EN", async ({ page }) => {
    for (const locale of ["fr", "en"] as const) {
      const res = await page.goto(COURSE[locale])
      expect(res?.status()).toBe(200)
      const canonical = await page.locator('link[rel="canonical"]').getAttribute("href")
      expect(canonical).toMatch(new RegExp(`${COURSE[locale]}$`))
      const alt = async (lang: string) =>
        page.locator(`link[rel="alternate"][hreflang="${lang}"]`).getAttribute("href")
      expect(await alt("fr-CA")).toMatch(/\/fr\/cours\/pain-au-levain$/)
      expect(await alt("en-CA")).toMatch(/\/en\/courses\/sourdough-bread$/)
      expect(await alt("x-default")).toMatch(/\/fr\/cours\/pain-au-levain$/)
      await expect(page.locator('meta[property="og:title"]')).toHaveCount(1)
      await expect(page.locator('meta[name="twitter:card"]')).toHaveCount(1)
      await expect(page.locator("h1")).toHaveCount(1)
      // Non-allow-listed host: noindex
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/)
    }
  })

  test("course JSON-LD: Course + one Event per upcoming session", async ({ page }) => {
    await page.goto(COURSE.en)
    await expect(page.locator("[data-session-id]").first()).toBeVisible({ timeout: 15_000 })
    const sessionCount = await page.locator("[data-session-id]").count()
    const nodes = await jsonLd(page)
    const course = nodes.find((n) => n["@type"] === "Course")
    expect(course).toMatchObject({ name: expect.any(String), inLanguage: "en-CA" })
    expect(course?.offers).toMatchObject({ priceCurrency: "CAD" })
    const events = nodes.filter((n) => n["@type"] === "Event")
    expect(events).toHaveLength(sessionCount)
    for (const e of events) {
      expect(String(e.startDate)).toMatch(/T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/)
      expect(e.eventAttendanceMode).toBe("https://schema.org/OfflineEventAttendanceMode")
      expect(e.eventStatus).toBe("https://schema.org/EventScheduled")
      expect(e.offers).toMatchObject({
        availability: expect.stringMatching(/schema\.org\/(InStock|SoldOut)$/),
      })
    }
  })
})

test.describe("W3-06 crawl files", () => {
  test("sitemap.xml lists both locales with translated slugs", async ({ request }) => {
    const res = await request.get("/sitemap.xml")
    expect(res.status()).toBe(200)
    const xml = await res.text()
    expect(xml).toContain("/fr/cours/pain-au-levain")
    expect(xml).toContain("/en/courses/sourdough-bread")
    expect(xml).toContain("/fr/produits")
    expect(xml).toContain('hreflang="fr-CA"')
    expect(xml).not.toMatch(/\/(compte|account|panier|cart|connexion|auth|commande|checkout|certificats|certificates)(\/|<)/)
  })

  test("robots.txt disallows everything on a non-allow-listed host", async ({ request }) => {
    const res = await request.get("/robots.txt")
    expect(res.status()).toBe(200)
    const txt = await res.text()
    expect(txt).toMatch(/Disallow: \/\s/)
    expect(txt).not.toMatch(/Allow: \//)
    expect(txt).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/)
  })

  test("manifest.webmanifest", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest")
    expect(res.status()).toBe(200)
    const m = (await res.json()) as Record<string, unknown>
    expect(m).toMatchObject({ lang: "fr-CA", start_url: "/fr/compte", display: "standalone" })
    expect((m.icons as unknown[]).length).toBeGreaterThanOrEqual(4)
  })

  test("offline fallback is localized", async ({ request }) => {
    const fr = await (await request.get("/offline.html?lang=fr")).text()
    const en = await (await request.get("/offline.html?lang=en")).text()
    expect(fr).toContain('lang="fr"')
    expect(en).toContain('lang="en"')
  })
})

test.describe("W3-06 service worker", () => {
  test("registers and never caches private or dynamic URLs", async ({ page }) => {
    await page.goto("/fr")
    await page.evaluate(() => navigator.serviceWorker.ready)
    // Let the worker take control, then visit private surfaces + an API URL.
    await page.reload()
    for (const url of ["/fr/connexion", "/fr/compte", "/en/account", "/api/orders/1/receipt"]) {
      await page.evaluate((u) => fetch(u).catch(() => null), url)
    }
    await page.goto("/fr/connexion")
    const cached = await page.evaluate(async () => {
      const urls: string[] = []
      for (const name of await caches.keys()) {
        for (const req of await (await caches.open(name)).keys()) urls.push(new URL(req.url).pathname + new URL(req.url).search)
      }
      return urls
    })
    expect(cached.length).toBeGreaterThan(0) // offline pages precached
    for (const u of cached) {
      expect(u).not.toMatch(/\/(compte|account|api|admin|connexion|auth)(\/|$)/)
      expect(u).toMatch(/^\/(offline\.html|_next\/static\/|icons\/)/)
    }
  })

  test("offline navigation shows the fallback", async ({ page, context }) => {
    await page.goto("/en/courses")
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.reload()
    await context.setOffline(true)
    await page.goto("/en/courses").catch(() => null)
    await expect(page.locator("h1")).toHaveText("You are offline")
    await context.setOffline(false)
  })
})
