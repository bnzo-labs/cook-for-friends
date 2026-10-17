import { test, expect } from "@playwright/test"

/**
 * Admin smoke — guards against the 307-counted-as-pass regression:
 * the Payload admin must actually render (HTTP 200 + a form), not just redirect.
 * On a fresh DB /admin/login redirects to /admin/create-first-user; both render a form.
 */
test("admin: login or create-first-user page renders a form", async ({ page }) => {
  const response = await page.goto("/admin/login")
  expect(response?.status()).toBe(200)
  await expect(page).toHaveURL(/\/admin\/(login|create-first-user)/)
  await expect(page.locator("form")).toBeVisible()
  await expect(page.locator("input[type=email], input#field-email")).toBeVisible()
})
