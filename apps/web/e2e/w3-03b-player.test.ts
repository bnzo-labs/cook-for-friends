import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import path from "node:path"
import type { Payload } from "payload"

import { getTestPayload } from "../test/integration"
import { mintLoginToken } from "../test/portal-fixtures"
import { seedPlayerWorld, type PlayerWorld } from "../test/player-fixtures"

/**
 * W3-03b learning UI. Runs against `next build && next start` on a THROWAWAY Neon
 * branch (TEST_DATABASE_URL === the server's DATABASE_URL) with VIDEO_PROVIDER=fake
 * and VIDEO_FAKE_ALLOWED=true. Tokens are minted straight into `magic-link-tokens`.
 * Screenshots: W303B_SCREENSHOTS=1 -> e2e/__screenshots__/w3-03b/<locale>-<name>-<width>.png
 */
const SHOT_DIR = path.join(process.cwd(), "e2e", "__screenshots__", "w3-03b")
const SHOTS = process.env.W303B_SCREENSHOTS === "1"
const WIDTHS = [320, 768, 1440] as const

type Loc = "fr" | "en"

test.skip(!process.env.TEST_DATABASE_URL, "needs a throwaway DB branch (local)")
test.describe.configure({ mode: "serial" })

let payload: Payload
let w: PlayerWorld

const verifyPath = (l: Loc) => (l === "fr" ? "/fr/connexion/verifier" : "/en/auth/verify")
const overview = (l: Loc) => (l === "fr" ? `/fr/compte/cours/${w.slugs.fr}` : `/en/account/courses/${w.slugs.en}`)
const lessonPath = (l: Loc, i: number) => `${overview(l)}/${w.lessons[i]!.id}`
const verifyCert = (l: Loc, code: string) =>
  l === "fr" ? `/fr/certificats/verifier/${code}` : `/en/certificates/verify/${code}`

test.beforeAll(async () => {
  test.setTimeout(180_000)
  payload = await getTestPayload()
  w = await seedPlayerWorld(payload)
})

async function signIn(page: Page, customerId: number, locale: Loc) {
  const token = await mintLoginToken(payload, customerId)
  await page.goto(`${verifyPath(locale)}?token=${token}`)
  await page.locator("[data-verify-submit]").click()
  await page.waitForURL((u) => !u.pathname.includes("verifier") && !u.pathname.includes("verify"))
}

async function shot(page: Page, locale: Loc, name: string) {
  if (!SHOTS) return
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 })
    await page.screenshot({ path: path.join(SHOT_DIR, `${locale}-${name}-${width}.png`), fullPage: true })
  }
}

async function audit(page: Page) {
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()
    const bad = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
    expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.html}`), `axe @${width}`).toEqual([])
  }
}

test("signed out: player redirects to localized login with next", async ({ page }) => {
  for (const locale of ["fr", "en"] as const) {
    await page.goto(lessonPath(locale, 0))
    const url = new URL(page.url())
    expect(url.pathname).toBe(locale === "fr" ? "/fr/connexion" : "/en/auth/login")
    expect(url.searchParams.get("next")).toBe(lessonPath(locale, 0))
  }
})

test("non-entitled: 403 page, playback API refuses, nothing playable on the page", async ({ page }) => {
  await signIn(page, w.outsider.id, "fr")
  await page.goto(lessonPath("fr", 0))
  await expect(page.locator("[data-player-forbidden]")).toBeVisible()
  await expect(page.locator("[data-video-placeholder], mux-player")).toHaveCount(0)
  const api = await page.request.get(`/api/video/playback?lessonId=${w.lessons[0]!.id}`)
  expect(api.status()).toBe(403)
  await audit(page)
})

test("account dashboard never loads the Mux player bundle", async ({ page }) => {
  await signIn(page, w.ana.id, "fr")
  const urls: string[] = []
  page.on("request", (r) => urls.push(r.url()))
  await page.goto("/fr/compte")
  await page.waitForLoadState("networkidle")
  expect(urls.filter((u) => /mux/i.test(u))).toEqual([])
})

test("entitled flow FR: lesson, placeholder, progress persists, complete all, certificate PDF", async ({ page }) => {
  await signIn(page, w.ana.id, "fr")
  await page.goto(overview("fr"))
  await expect(page.locator("[data-lesson-list] [data-lesson-id]")).toHaveCount(3)
  await shot(page, "fr", "overview")
  await page.locator("[data-course-cta]").click()
  await page.waitForURL(`**${lessonPath("fr", 0)}`)

  const heading = page.locator("[data-lesson-heading]")
  await expect(heading).toBeFocused()
  await expect(page.locator("[data-video-placeholder]")).toBeVisible()
  await expect(page.locator("[data-lesson-list] [aria-current=page]")).toHaveCount(1)
  await audit(page)
  await shot(page, "fr", "lesson")

  // Materials: 302 to R2 (host only; never follow).
  const material = page.locator(`[data-material-id="${w.material.id}"]`)
  await expect(material).toBeVisible()
  const res = await page.request.get(`/api/materials/${w.material.id}`, { maxRedirects: 0 })
  expect(res.status()).toBe(302)
  expect(new URL(res.headers().location!).host).toMatch(/r2\.cloudflarestorage\.com$/)

  // Keyboard-only: tab to the complete button and press it.
  const complete = page.locator("[data-mark-complete]")
  await complete.focus()
  await page.keyboard.press("Enter")
  await expect(complete).toBeDisabled()
  await page.reload()
  await expect(page.locator("[data-mark-complete]")).toBeDisabled()
  await expect(page.locator("[data-lesson-id][data-completed=true]")).toHaveCount(1)

  for (const i of [1, 2]) {
    await page.goto(lessonPath("fr", i))
    await page.locator("[data-mark-complete]").click()
    await expect(page.locator("[data-mark-complete]")).toBeDisabled()
  }
  const download = page.locator("[data-certificate-download]").first()
  await expect(download).toBeVisible()
  const pdf = await page.request.get((await download.getAttribute("href"))!)
  expect(pdf.status()).toBe(200)
  expect(pdf.headers()["content-type"]).toContain("application/pdf")
  await shot(page, "fr", "complete")
})

test("verify page: valid + invalid, FR + EN, axe", async ({ page }) => {
  const certs = await payload.find({
    collection: "certificates",
    where: { customer: { equals: w.ana.id } },
    overrideAccess: true,
    limit: 1,
  })
  const code = (certs.docs[0] as unknown as { verificationCode: string }).verificationCode
  for (const locale of ["fr", "en"] as const) {
    const ok = await page.goto(verifyCert(locale, code))
    expect(ok?.status()).toBe(200)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/)
    await expect(page.locator("[data-certificate-result=valid]")).toBeVisible()
    await expect(page.locator("[data-certificate-name]")).toHaveText(/Ana/)
    await audit(page)
    await shot(page, locale, "verify-valid")

    const miss = await page.goto(verifyCert(locale, "AAAAAAAAAA"))
    expect(miss?.status()).toBe(200)
    await expect(page.locator("[data-certificate-result=invalid]")).toBeVisible()
    await audit(page)
    await shot(page, locale, "verify-invalid")
  }
})

test("comments: pending for the author, visible to the other customer after approval, body is text", async ({ browser }) => {
  const ana = await browser.newPage()
  const ben = await browser.newPage()
  await signIn(ana, w.ana.id, "fr")
  await signIn(ben, w.ben.id, "en")

  const body = `Bonjour <img src=x onerror="window.__xss=1"> chef`
  await ana.goto(lessonPath("fr", 0))
  await ana.getByLabel("Votre commentaire").fill(body)
  await ana.getByRole("button", { name: "Publier le commentaire" }).click()
  const own = ana.locator("[data-comment-status=pending] [data-comment-body]")
  await expect(own).toContainText("<img src=x")
  await expect(ana.locator("[data-comment-status=pending]").getByText("En attente de modération")).toBeVisible()
  expect(await ana.locator("[data-comment-body] img").count()).toBe(0)
  expect(await ana.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()

  await ben.goto(lessonPath("en", 0))
  await expect(ben.locator("[data-comments-empty]")).toBeVisible()

  const pending = await payload.find({
    collection: "comments",
    where: { and: [{ lesson: { equals: w.lessons[0]!.id } }, { status: { equals: "pending" } }] },
    overrideAccess: true,
  })
  for (const c of pending.docs) {
    await payload.update({ collection: "comments", id: c.id, data: { status: "approved" }, overrideAccess: true })
  }
  await ben.reload()
  await expect(ben.locator("[data-comment-status=approved] [data-comment-body]")).toContainText("<img src=x")
  await audit(ben)
  await shot(ben, "en", "lesson-comments")
  await ana.close()
  await ben.close()
})

test("lesson page EN axe + locale-switched slug redirects", async ({ page }) => {
  await signIn(page, w.ben.id, "en")
  await page.goto(lessonPath("en", 1))
  await expect(page.locator("[data-lesson-heading]")).toBeVisible()
  await audit(page)
  // FR slug under the EN prefix resolves to the EN slug.
  await page.goto(`/en/account/courses/${w.slugs.fr}/${w.lessons[1]!.id}`)
  await page.waitForURL(`**${lessonPath("en", 1)}`)
})
