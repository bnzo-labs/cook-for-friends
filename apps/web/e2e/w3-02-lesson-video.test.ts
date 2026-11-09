import { expect, test } from "@playwright/test"
import path from "node:path"

/**
 * W3-02 (local only, throwaway DB branch): staff opens a lesson and sees the
 * video field; with VIDEO_PROVIDER=fake the full upload -> ready flow runs.
 * Requires E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD / E2E_LESSON_ID.
 * Screenshots: W302_SCREENSHOTS=1 -> e2e/__screenshots__/w3-02/
 */
const { E2E_STAFF_EMAIL, E2E_STAFF_PASSWORD, E2E_LESSON_ID } = process.env
const SHOT_DIR = path.join(process.cwd(), "e2e", "__screenshots__", "w3-02")

test.skip(!E2E_STAFF_EMAIL || !E2E_STAFF_PASSWORD || !E2E_LESSON_ID, "needs seeded staff + lesson (local)")

test("admin: lesson edit renders the video field and the fake upload reaches ready", async ({ page }) => {
  await page.goto("/admin/login")
  await page.locator("input#field-email").fill(E2E_STAFF_EMAIL!)
  await page.locator("input#field-password").fill(E2E_STAFF_PASSWORD!)
  await page.locator("form button[type=submit]").click()
  await page.waitForURL(/\/admin(\/)?$/)

  const response = await page.goto(`/admin/collections/lessons/${E2E_LESSON_ID}`)
  expect(response?.status()).toBe(200)
  const field = page.getByTestId("lesson-video-field")
  await expect(field).toBeVisible()

  if (process.env.W302_SCREENSHOTS === "1") {
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await field.screenshot({ path: path.join(SHOT_DIR, `en-lesson-video-field-${width}.png`) })
    }
  }

  await page.getByTestId("lesson-video-input").setInputFiles({
    name: "clip.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.alloc(2048),
  })
  await expect(page.getByTestId("lesson-video-status")).toContainText(/Ready|Prête/, { timeout: 30_000 })
  await page.getByRole("button", { name: /Preview|Prévisualiser/ }).click()
  await expect(page.getByTestId("lesson-video-preview")).toBeVisible()
})
