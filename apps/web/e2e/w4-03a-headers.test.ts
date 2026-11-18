import { test, expect, type Page } from "./fixtures"

/**
 * W4-03a security headers. Runs against a production build in CI (CSP_MODE unset = enforce).
 */

const PAGES = [
  "/fr",
  "/en",
  "/fr/cours",
  "/en/courses/french-macarons",
  "/fr/cours/macarons-francais",
  "/fr/connexion",
  "/admin/login",
]
const HEADER_URLS = [...PAGES, "/fr/compte", "/api/video/playback", "/robots.txt"]

test.describe("W4-03a headers present", () => {
  for (const path of HEADER_URLS) {
    test(`${path} carries the MASTER §8 set`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 })
      const h = res.headers()
      expect(h["content-security-policy"], "CSP").toContain("default-src 'self'")
      expect(h["content-security-policy"]).toContain("frame-ancestors 'none'")
      expect(h["content-security-policy"]).toContain("object-src 'none'")
      expect(h["x-content-type-options"]).toBe("nosniff")
      expect(h["x-frame-options"]).toBe("DENY")
      expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin")
      expect(h["permissions-policy"]).toContain("camera=()")
      expect(h["cross-origin-opener-policy"]).toBe("same-origin")
    })
  }

  test("a static asset carries them too", async ({ page, request }) => {
    await page.goto("/fr")
    const src = await page.locator('script[src*="/_next/static/"]').first().getAttribute("src")
    expect(src).toBeTruthy()
    const res = await request.get(src as string)
    expect(res.headers()["x-content-type-options"]).toBe("nosniff")
    expect(res.headers()["content-security-policy"]).toBeTruthy()
  })

  test("HSTS only over https, never includeSubDomains/preload", async ({ request }) => {
    const res = await request.get("/fr")
    const hsts = res.headers()["strict-transport-security"]
    if (hsts) expect(hsts).toBe("max-age=31536000")
    else expect(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost").not.toMatch(/^https:/)
  })
})

async function watchCsp(page: Page): Promise<string[]> {
  const violations: string[] = []
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      ;(window as unknown as { __csp: string[] }).__csp ??= []
      ;(window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`)
    })
  })
  page.on("console", (m) => {
    if (/content security policy|refused to (load|execute|connect|apply)/i.test(m.text())) {
      violations.push(m.text())
    }
  })
  return violations
}

test.describe("W4-03a zero CSP violations", () => {
  for (const path of PAGES) {
    test(`${path} renders with no violation`, async ({ page }) => {
      const consoleViolations = await watchCsp(page)
      await page.goto(path)
      await page.waitForLoadState("networkidle")
      const dom = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])
      expect([...consoleViolations, ...dom]).toEqual([])
    })
  }

  test("Sentry tunnel is same-origin (connect-src 'self')", async ({ request }) => {
    const res = await request.get("/fr")
    expect(res.headers()["content-security-policy"]).toMatch(/connect-src 'self'/)
  })
})
