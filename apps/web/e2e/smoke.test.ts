import { test, expect } from "@playwright/test"

/**
 * Smoke test — verifies the /fr route loads and renders the site name.
 * This is the bare minimum E2E test. W4-01 adds the full purchase flows.
 */
test("smoke: /fr loads and renders site heading", async ({ page }) => {
  await page.goto("/fr")

  // Page should not be a 404 or error
  await expect(page).not.toHaveTitle(/404|Error/)

  // Should render the site name (from FR messages)
  await expect(page.getByRole("heading", { name: "Cook for Friends" })).toBeVisible()
})

test("smoke: / redirects to /fr", async ({ page }) => {
  const response = await page.goto("/")
  // After redirect, should land on /fr
  expect(page.url()).toMatch(/\/fr/)
})
