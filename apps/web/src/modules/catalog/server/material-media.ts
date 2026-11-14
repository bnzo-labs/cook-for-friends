import type { Access, Payload, Where } from "payload"

import type { ID } from "@/modules/_shared"
import { isStaff } from "@/modules/identity"
import { relId, type Rec } from "./mappers"

/**
 * W3-13 (W3-10 H-1). `materials.file` uploads into the shared `media`
 * collection and `media` accepts `image/*`, so a recipe uploaded as JPG/PNG is
 * paid content. Non-staff `media` reads are therefore "images that no material
 * references". The same `where` guards `GET /api/media` (list/by id) and
 * `GET /api/media/file/:filename` (Payload's `checkFileAccess` runs this access
 * and ANDs the result into its filename lookup). Material files themselves are
 * served only by `/api/materials/:id`, which presigns the R2 key directly.
 *
 * The id list is cached in-process for a short TTL and dropped by the
 * `materials` hooks; other instances converge within the TTL.
 */
export const MATERIAL_MEDIA_TTL_MS = 30_000

let cache: { ids: ID[]; expiresAt: number } | null = null
let inflight: Promise<ID[]> | null = null

/** Drop the cached id list (called from `materials` afterChange/afterDelete). */
export function invalidateMaterialMediaIds(): void {
  cache = null
  inflight = null
}

async function loadMaterialMediaIds(payload: Payload): Promise<ID[]> {
  const res = await payload.find({
    collection: "materials",
    depth: 0,
    limit: 0,
    pagination: false,
    select: { file: true },
    overrideAccess: true,
  })
  const ids = new Set<ID>()
  for (const doc of res.docs as unknown as Rec[]) {
    const id = relId(doc.file)
    if (id !== null) ids.add(id)
  }
  return [...ids]
}

/** Ids of every `media` doc referenced by a `materials.file` (cached ≤ TTL). */
export async function materialMediaIds(payload: Payload, now: number = Date.now()): Promise<ID[]> {
  if (cache && cache.expiresAt > now) return cache.ids
  if (!inflight) {
    const pending = loadMaterialMediaIds(payload)
    inflight = pending
    pending
      .then((ids) => {
        if (inflight === pending) cache = { ids, expiresAt: Date.now() + MATERIAL_MEDIA_TTL_MS }
      })
      .catch(() => undefined) // surfaced to the awaiting caller below
      .finally(() => {
        if (inflight === pending) inflight = null
      })
  }
  return inflight
}

/** Non-staff `media` read constraint: images, minus material files. */
export function publicMediaWhere(materialIds: readonly ID[]): Where {
  const images: Where = { mimeType: { like: "image/" } }
  if (materialIds.length === 0) return images
  return { and: [images, { id: { not_in: [...materialIds] } }] }
}

/**
 * `media.access.read`. Staff: everything. Everyone else: images not referenced
 * by any material. Fails closed (no read) if the material lookup fails.
 */
export const mediaReadAccess: Access = async ({ req }) => {
  if (isStaff(req.user)) return true
  try {
    return publicMediaWhere(await materialMediaIds(req.payload))
  } catch (err) {
    req.payload.logger.error({ err, msg: "media read: material id lookup failed, denying" })
    return false
  }
}
