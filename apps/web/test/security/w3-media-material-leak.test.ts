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
 * Fixed by W3-13: non-staff `media` read = images not referenced by any
 * `materials.file` (catalog/server/material-media.ts). Covers anonymous and
 * signed-in customers, the REST list semantics (`find` without `where`), and
 * the static-file path (`checkFileAccess` ANDs the read access into a
 * filename lookup). The control test keeps storefront images public.
 */
import { createLocalReq, type Payload, type Where } from "payload"
import { beforeAll, describe, expect, it } from "vitest"

import { asUser, getTestPayload, hasTestDb, uid } from "../integration"

type Viewer = Parameters<Payload["find"]>[0]["user"]

type MediaRow = { id: number; filename: string }

async function insertMedia(payload: Payload, mimeType: string): Promise<MediaRow> {
  // Through the DB adapter: no upload hooks, so no R2 write is needed.
  const filename = `w310-${uid()}.${mimeType.endsWith("png") ? "png" : "pdf"}`
  const doc = await payload.db.create({ collection: "media", data: { filename, mimeType, filesize: 1 } })
  return { id: Number(doc.id), filename }
}

async function canRead(payload: Payload, id: number, user?: Viewer): Promise<boolean> {
  const res = await payload.find({
    collection: "media",
    where: { id: { equals: id } },
    depth: 0,
    limit: 1,
    overrideAccess: false,
    user,
  })
  return res.docs.length === 1
}

/** `GET /api/media` semantics: list without `where`, collection access only. */
async function listedIds(payload: Payload, user?: Viewer): Promise<Set<number>> {
  const res = await payload.find({ collection: "media", depth: 0, limit: 0, pagination: false, overrideAccess: false, user })
  return new Set(res.docs.map((d) => Number(d.id)))
}

/**
 * `GET /api/media/file/:filename` semantics: Payload's `checkFileAccess` runs
 * `access.read` and ANDs an object result into a filename lookup (no prefix,
 * no image sizes on `media`). Mirrored here; `false` means 403.
 */
async function canFetchFile(payload: Payload, filename: string, user?: Viewer): Promise<boolean> {
  const req = await createLocalReq({ user: user ?? undefined }, payload)
  const access = await payload.collections.media.config.access.read({ req, data: { filename } })
  if (access === false) return false
  const and: Where[] = [{ filename: { equals: filename } }]
  if (typeof access === "object") and.push(access)
  const doc = await payload.db.findOne({ collection: "media", req, where: { and } })
  return Boolean(doc)
}

describe.skipIf(!hasTestDb)("W3-10 H-1 material files never readable anonymously (integration)", () => {
  let payload: Payload
  let heroImage: MediaRow
  let recipeImage: MediaRow
  let customer: Viewer

  beforeAll(async () => {
    payload = await getTestPayload()
    heroImage = await insertMedia(payload, "image/png")
    recipeImage = await insertMedia(payload, "image/png")
    await payload.create({
      collection: "materials",
      data: { title: "Recette secrète", file: recipeImage.id, kind: "recipe" },
      overrideAccess: true,
    })
    const c = await payload.create({
      collection: "customers",
      data: { email: `w313-${uid()}@example.com`, preferredLocale: "fr" },
      overrideAccess: true,
    })
    customer = asUser(c, "customers") as Viewer
  }, 60_000)

  it("control: a storefront image (not a material) stays publicly readable", async () => {
    expect(await canRead(payload, heroImage.id)).toBe(true)
    expect(await canRead(payload, heroImage.id, customer)).toBe(true)
    expect(await canFetchFile(payload, heroImage.filename)).toBe(true)
  })

  it("an image referenced by a material is not readable anonymously", async () => {
    expect(await canRead(payload, recipeImage.id)).toBe(false)
    expect(await canFetchFile(payload, recipeImage.filename)).toBe(false)
  })

  it("nor by a signed-in customer without entitlement", async () => {
    expect(await canRead(payload, recipeImage.id, customer)).toBe(false)
    expect(await canFetchFile(payload, recipeImage.filename, customer)).toBe(false)
  })

  it("GET /api/media list never includes the material image", async () => {
    const anon = await listedIds(payload)
    expect(anon.has(heroImage.id)).toBe(true)
    expect(anon.has(recipeImage.id)).toBe(false)
    expect((await listedIds(payload, customer)).has(recipeImage.id)).toBe(false)
  })

  it("attaching an image to a material hides it right away (cache invalidated)", async () => {
    const later = await insertMedia(payload, "image/png")
    expect(await canRead(payload, later.id)).toBe(true) // warms the cache
    await payload.create({
      collection: "materials",
      data: { title: "Recette tardive", file: later.id, kind: "recipe" },
      overrideAccess: true,
    })
    expect(await canRead(payload, later.id)).toBe(false)
  })
})
