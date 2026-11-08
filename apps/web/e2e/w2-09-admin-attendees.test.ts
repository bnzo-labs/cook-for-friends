import { expect, test } from "@playwright/test"

/**
 * W2-09 (local only): staff opens a seeded session with enrollments, sees the
 * Participants table and the CSV link returns 200 text/csv.
 * Requires E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD / E2E_SESSION_ID (seeded dev DB).
 */
const { E2E_STAFF_EMAIL, E2E_STAFF_PASSWORD, E2E_SESSION_ID } = process.env

test.skip(!E2E_STAFF_EMAIL || !E2E_STAFF_PASSWORD || !E2E_SESSION_ID, "needs seeded staff + session (local)")

test("admin: session edit shows participants and CSV exports", async ({ page }) => {
  await page.goto("/admin/login")
  await page.locator("input#field-email").fill(E2E_STAFF_EMAIL!)
  await page.locator("input#field-password").fill(E2E_STAFF_PASSWORD!)
  await page.locator("form button[type=submit]").click()
  await page.waitForURL(/\/admin(\/)?$/)

  const response = await page.goto(`/admin/collections/sessions/${E2E_SESSION_ID}`)
  expect(response?.status()).toBe(200)
  await expect(page.getByTestId("session-attendees")).toBeVisible()
  await expect(page.getByTestId("attendee-row").first()).toBeVisible()

  const href = await page.getByTestId("attendees-csv").getAttribute("href")
  const csv = await page.request.get(href!)
  expect(csv.status()).toBe(200)
  expect(csv.headers()["content-type"]).toContain("text/csv")
})
