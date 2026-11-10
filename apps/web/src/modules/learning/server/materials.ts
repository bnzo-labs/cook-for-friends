import { hasActiveEntitlement } from "@/modules/access"
import { getMaterialDownload } from "@/modules/catalog"
import type { ID } from "@/modules/_shared"

import type { Actor } from "../types"

export const MATERIAL_URL_TTL_SECONDS = 300

/**
 * Access-checked signed URL for a recipe/PDF. Staff, or a customer with an
 * active entitlement to ANY course containing the material. Every denial is
 * `null` (the route answers 404, never revealing existence).
 */
export async function getMaterialSignedUrl(materialId: ID, actor: Actor): Promise<string | null> {
  if (!actor) return null
  const download = await getMaterialDownload(materialId)
  if (!download) return null
  if (actor.kind === "customer") {
    const checks = await Promise.all(download.courseIds.map((c) => hasActiveEntitlement(actor.id, c)))
    if (!checks.some(Boolean)) return null
  }
  // Lazy: @/lib/r2 reads env at import; payload.config imports this barrel.
  const { presignR2Get } = await import("@/lib/r2")
  const { url } = await presignR2Get({
    key: download.storageKey,
    ttlSeconds: MATERIAL_URL_TTL_SECONDS,
    filename: download.filename,
  })
  return url
}
