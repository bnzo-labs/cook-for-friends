/**
 * CI-only (Lighthouse): makes LCP representative. Run AFTER `pnpm seed` against the
 * throwaway CI Neon branch only:  pnpm payload run test/lighthouse-seed.ts
 *
 * The CI R2 bucket is a placeholder, so real uploads cannot work. Instead:
 *   1. copy a small committed fixture image (synthetic, no real photo) to
 *      `public/api/media/file/lh-hero.jpg` — the exact path Payload derives for a media
 *      row named `lh-hero.jpg`, so the app serves it as a static file before any route;
 *   2. insert one `media` row straight through the DB adapter (no storage upload);
 *   3. point every published course hero and the home hero block at it.
 *
 * Idempotent. Fictional content only (public repo).
 */
import { copyFileSync, mkdirSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { getPayload } from "payload"

import config from "../src/payload.config"

const FILENAME = "lh-hero.jpg"
const here = dirname(fileURLToPath(import.meta.url))
const source = resolve(here, "fixtures-static", FILENAME)
const publicDir = resolve(here, "..", "public", "api", "media", "file")

mkdirSync(publicDir, { recursive: true })
copyFileSync(source, resolve(publicDir, FILENAME))

const payload = await getPayload({ config })
try {
  const existing = await payload.find({
    collection: "media",
    where: { filename: { equals: FILENAME } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  let mediaId = existing.docs[0]?.id
  if (mediaId === undefined) {
    const row = await payload.db.create({
      collection: "media",
      data: {
        filename: FILENAME,
        mimeType: "image/jpeg",
        filesize: statSync(source).size,
        width: 1200,
        height: 1500,
      },
    })
    mediaId = row.id as number
  }

  const courses = await payload.find({
    collection: "courses",
    where: { _status: { equals: "published" } },
    limit: 100,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  for (const course of courses.docs) {
    await payload.update({
      collection: "courses",
      id: course.id,
      data: { heroImage: mediaId, _status: "published" },
      overrideAccess: true,
    })
  }

  for (const locale of ["fr", "en"] as const) {
    const pages = await payload.find({
      collection: "pages",
      where: { _status: { equals: "published" } },
      locale,
      limit: 20,
      depth: 0,
      pagination: false,
      overrideAccess: true,
    })
    for (const page of pages.docs) {
      const layout = (page.layout ?? []).map((block) =>
        block.blockType === "hero" ? { ...block, image: mediaId } : block,
      )
      await payload.update({
        collection: "pages",
        id: page.id,
        locale,
        data: { layout, _status: "published" },
        overrideAccess: true,
      })
    }
  }
  payload.logger.info(
    `lighthouse-seed: media ${mediaId} attached to ${courses.docs.length} courses + home hero`,
  )
} catch (err) {
  // Non-fatal: Lighthouse still runs (text-only LCP) and the warning flags the gap.
  payload.logger.error({ err }, "lighthouse-seed failed")
  console.log("::warning::lighthouse-seed failed - LCP images missing, scores unrepresentative")
} finally {
  await payload.destroy()
}
