import { expect, test } from "@playwright/test"

/**
 * W3-04 (local only, throwaway DB): staff sees a pending comment in the Payload
 * admin list, approves it, status is saved. Screenshot behind W304_SCREENSHOTS=1.
 * Requires E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD / E2E_COMMENT_ID (a pending comment seeded on the throwaway DB).
 */
const { E2E_STAFF_EMAIL, E2E_STAFF_PASSWORD, E2E_COMMENT_ID } = process.env

test.skip(!E2E_STAFF_EMAIL || !E2E_STAFF_PASSWORD || !E2E_COMMENT_ID, "needs seeded staff + pending comment (local)")

test("admin: pending comment is listed, approve saves status", async ({ page }) => {
  await page.goto("/admin/login")
  await page.locator("input#field-email").fill(E2E_STAFF_EMAIL!)
  await page.locator("input#field-password").fill(E2E_STAFF_PASSWORD!)
  await page.locator("form button[type=submit]").click()
  await page.waitForURL(/\/admin(\/)?$/)

  await page.goto("/admin/collections/comments?where[status][equals]=pending")
  // The list has no id column: identify the row by its link to this comment.
  const row = page.locator("table tbody tr").filter({ has: page.locator(`a[href$="/admin/collections/comments/${E2E_COMMENT_ID}"]`) })
  await expect(row.first()).toBeVisible()
  if (process.env.W304_SCREENSHOTS) {
    await page.screenshot({ path: "e2e/__screenshots__/w3-04/admin-pending-1440.png", fullPage: true })
  }

  await page.goto(`/admin/collections/comments/${E2E_COMMENT_ID}`)
  await page.locator("#field-status").click()
  await page.getByRole("option", { name: /Approuvé|Approved/ }).click()
  await page.getByRole("button", { name: /Enregistrer|Save/ }).first().click()
  await expect(page.getByText(/mis à jour|updated successfully/i).first()).toBeVisible()

  await page.reload()
  await expect(page.locator("#field-status")).toContainText(/Approuvé|Approved/)
})
