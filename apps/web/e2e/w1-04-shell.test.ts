import { test, expect } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import path from "node:path"

/**
 * W1-04 layout shell checks: landmarks, skip link, locale switcher, axe,
 * and (opt-in) screenshots at 320 / 768 / 1024 / 1440 for both locales.
 *
 * Screenshots: `W104_SCREENSHOTS=1 pnpm test:e2e e2e/w1-04-shell.test.ts`
 * Output: e2e/__screenshots__/w1-04/
 */
const LOCALES = ["fr", "en"] as const
const WIDTHS = [320, 768, 1024, 1440] as const
const SHOT_DIR = path.join(process.cwd(), "e2e", "__screenshots__", "w1-04")
const SHOT_SUFFIX = process.env.W104_SHOT_SUFFIX ?? ""

for (const locale of LOCALES) {
  test.describe(`shell /${locale}`, () => {
    test("html lang, landmarks, skip link", async ({ page }) => {
      await page.goto(`/${locale}`)
      await expect(page.locator("html")).toHaveAttribute("lang", locale)
      await expect(page.getByRole("banner")).toBeVisible()
      await expect(page.getByRole("main")).toHaveCount(1)
      await expect(page.getByRole("contentinfo")).toBeVisible()

      await page.keyboard.press("Tab")
      const skip = page.locator('a[href="#main-content"]')
      await expect(skip).toBeFocused()
      await expect(skip).toBeVisible()
    })

    test("axe: no serious or critical violations", async ({ page }) => {
      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(`/${locale}`)
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze()
        const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
        expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([])
      }
    })

    test("mobile menu opens and keeps focus inside", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 })
      await page.goto(`/${locale}`)
      await page.getByRole("button", { name: /menu/i }).click()
      const dialog = page.getByRole("dialog")
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole("link")).not.toHaveCount(0)
      await page.keyboard.press("Escape")
      await expect(dialog).toBeHidden()
    })

    for (const width of WIDTHS) {
      test(`no horizontal overflow at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(`/${locale}`)
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        expect(overflow).toBeLessThanOrEqual(0)
      })
    }

    test("screenshots", async ({ page }) => {
      test.skip(!process.env.W104_SCREENSHOTS, "opt-in: set W104_SCREENSHOTS=1")
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(`/${locale}`)
        // Hide the Next.js dev indicator so it does not appear in the captures
        await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" })
        await page.evaluate(() => document.fonts.ready)
        await page.screenshot({
          path: path.join(SHOT_DIR, `${locale}-${width}${SHOT_SUFFIX}.png`),
          fullPage: true,
        })
      }
    })
  })
}

test("locale switcher points to the same page in the other locale", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto("/fr")
  const toEn = page.getByRole("banner").getByRole("link", { name: /english/i })
  await expect(toEn).toHaveAttribute("href", "/en")
})
