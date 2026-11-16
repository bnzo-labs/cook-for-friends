import { test, expect } from "@playwright/test"

/**
 * W4-02 diagnostic: logs the LCP element of each Lighthouse URL (real Chromium, no
 * throttling) so perf work targets the right node. Asserts only that an LCP exists.
 */
const URLS = [
  "/fr",
  "/fr/cours",
  "/fr/cours/macarons-francais",
  "/en",
  "/en/courses",
  "/en/courses/french-macarons",
]

for (const url of URLS) {
  test(`LCP element ${url}`, async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 823 })
    await page.addInitScript(() => {
      ;(window as unknown as { __lcp: unknown[] }).__lcp = []
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          const x = e as PerformanceEntry & { element?: Element; url?: string; size: number }
          ;(window as unknown as { __lcp: unknown[] }).__lcp.push({
            t: Math.round(e.startTime),
            size: x.size,
            tag: x.element?.tagName,
            url: x.url,
            cls: x.element?.className?.toString().slice(0, 60),
          })
        }
      }).observe({ type: "largest-contentful-paint", buffered: true })
    })
    await page.goto(url)
    await page.waitForLoadState("networkidle")
    const lcp = await page.evaluate(() => (window as unknown as { __lcp: unknown[] }).__lcp)
    console.log(`LCP-PROBE ${url} ${JSON.stringify(lcp)}`)
    expect(lcp.length).toBeGreaterThan(0)
  })
}
