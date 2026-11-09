import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"
import path from "node:path"

/**
 * W3-05 (local only): the attendance control in the admin Participants table.
 * Requires E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD / E2E_SESSION_ID (seeded DB), the session
 * starting today or earlier (the control is disabled before the session day, Toronto).
 * Screenshots: W305_SCREENSHOTS=1 -> e2e/__screenshots__/w3-05/
 */
const { E2E_STAFF_EMAIL, E2E_STAFF_PASSWORD, E2E_SESSION_ID } = process.env
const SHOT_DIR = path.join(process.cwd(), "e2e", "__screenshots__", "w3-05")
const SHOTS = process.env.W305_SCREENSHOTS === "1"

test.skip(!E2E_STAFF_EMAIL || !E2E_STAFF_PASSWORD || !E2E_SESSION_ID, "needs seeded staff + session (local)")

test("admin: staff marks a participant present, persists after reload", async ({ page }) => {
  await page.goto("/admin/login")
  await page.locator("input#field-email").fill(E2E_STAFF_EMAIL!)
  await page.locator("input#field-password").fill(E2E_STAFF_PASSWORD!)
  await page.locator("form button[type=submit]").click()
  await page.waitForURL(/\/admin(\/)?$/)

  await page.goto(`/admin/collections/sessions/${E2E_SESSION_ID}`)
  const select = page.getByTestId("attendance-select").first()
  await expect(select).toBeVisible()
  await expect(select).toBeEnabled()

  const saved = page.waitForResponse((r) => r.url().includes("/attendance") && r.request().method() === "POST")
  await select.selectOption("present")
  expect((await saved).status()).toBe(200)

  await page.reload()
  await expect(page.getByTestId("attendance-select").first()).toHaveValue("present")

  if (SHOTS) {
    for (const width of [768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.getByTestId("session-attendees").screenshot({ path: path.join(SHOT_DIR, `admin-attendance-${width}.png`) })
    }
  }

  const axe = await new AxeBuilder({ page }).include('[data-testid="session-attendees"]').analyze()
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([])

  // leave the seat as found
  await page.getByTestId("attendance-select").first().selectOption("unknown")
})
