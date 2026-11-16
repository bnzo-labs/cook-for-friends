import { test, expect } from "@playwright/test"

/**
 * Smoke test — verifies the /fr route loads and renders the site name.
 * This is the bare minimum E2E test. W4-01 adds the full purchase flows.
 */
test("smoke: /fr loads and renders site heading", async ({ page }) => {
  await page.goto("/fr")

  // Page should not be a 404 or error
  await expect(page).not.toHaveTitle(/404|Error/)

  // The CMS home (seeded) renders its hero as the single h1; the site name lives in the banner link.
  await expect(page.getByRole("banner").getByRole("link", { name: /Cook for Friends/ })).toBeVisible()
  await expect(page.getByRole("heading", { level: 1, name: /cuisinez entre amis/i })).toBeVisible()
})

// Locale redirect depends on Accept-Language; pin it so the result never
// depends on the runner/browser default locale.
test.describe("smoke: / locale redirect", () => {
  test.describe("fr-CA browser", () => {
    test.use({ locale: "fr-CA", extraHTTPHeaders: { "Accept-Language": "fr-CA,fr;q=0.9" } })

    test("/ redirects to /fr", async ({ page }) => {
      await page.goto("/")
      await expect(page).toHaveURL(/\/fr(\/|$|\?)/)
    })
  })

  test.describe("en browser", () => {
    test.use({ locale: "en-US", extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" } })

    test("/ redirects to /en", async ({ page }) => {
      await page.goto("/")
      await expect(page).toHaveURL(/\/en(\/|$|\?)/)
    })
  })
})
