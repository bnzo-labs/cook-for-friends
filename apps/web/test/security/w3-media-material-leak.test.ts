/**
 * W3-10 H-1 proof of concept (integration, real Postgres; skipped without
 * TEST_DATABASE_URL, runs in the CI integration job).
 *
 * `media.access.read` for non-staff is `{ mimeType: { like: "image/" } }`
 * (catalog/collections/media.ts:22). `materials.file` uploads into `media` and
 * accepts `image/*`. So a recipe uploaded as JPG/PNG — paid course content,
 * meant to be served only through `/api/materials/:id` after an entitlement
 * check — is readable by anyone via `GET /api/media` (list, with `url`) and
 * `GET /api/media/file/<filename>`.
 *
 * Setup lives in `beforeAll` (an error there fails the suite, it is never
 * swallowed by `.fails`), and the control test proves the anonymous query path
 * works. Remove `.fails` once W3-13 lands.
 */
import type { Payload } from "payload"
import { beforeAll, describe, expect, it } from "vitest"

import { getTestPayload, hasTestDb, uid } from "../integration"

async function insertMedia(payload: Payload, mimeType: string): Promise<number> {
  // Through the DB adapter: no upload hooks, so no R2 write is needed.
  const doc = await payload.db.create({
    collection: "media",
    data: { filename: `w310-${uid()}.${mimeType.endsWith("png") ? "png" : "pdf"}`, mimeType, filesize: 1 },
  })
  return Number(doc.id)
}

async function anonymousCanRead(payload: Payload, id: number): Promise<boolean> {
  const res = await payload.find({
    collection: "media",
    where: { id: { equals: id } },
    depth: 0,
    limit: 1,
    overrideAccess: false,
  })
  return res.docs.length === 1
}

describe.skipIf(!hasTestDb)("W3-10 H-1 material files never readable anonymously (integration)", () => {
  let payload: Payload
  let heroImage: number
  let recipeImage: number

  beforeAll(async () => {
    payload = await getTestPayload()
    heroImage = await insertMedia(payload, "image/png")
    recipeImage = await insertMedia(payload, "image/png")
    await payload.create({
      collection: "materials",
      data: { title: "Recette secrète", file: recipeImage, kind: "recipe" },
      overrideAccess: true,
    })
  }, 60_000)

  it("control: a storefront image (not a material) stays publicly readable", async () => {
    expect(await anonymousCanRead(payload, heroImage)).toBe(true)
  })

  it.fails("an image referenced by a material is not readable anonymously", async () => {
    expect(await anonymousCanRead(payload, recipeImage)).toBe(false)
  })
})
