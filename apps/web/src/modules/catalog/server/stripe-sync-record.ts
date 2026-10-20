import type { ID } from "@/modules/_shared"
import type { CourseStripeSyncPatch } from "../types"
import { getPayload } from "./payload"

/** Build the four-field patch. Exported for unit tests. */
export function buildSyncData(patch: CourseStripeSyncPatch): Record<string, string | null> {
  return {
    stripeSyncStatus: patch.status,
    ...(patch.productId !== undefined ? { stripeProductId: patch.productId } : {}),
    ...(patch.priceId !== undefined ? { stripePriceId: patch.priceId } : {}),
    // Cleared unless an error is reported.
    stripeSyncError: patch.error ?? null,
  }
}

/**
 * Write the Stripe sync fields on the course, and nothing else.
 *
 * Goes through the DB adapter, not `payload.update`: the Local API would run
 * hooks (re-triggering the sync job), create a new version and, without
 * `draft: true`, publish whatever pending draft exists. Instead:
 *   1. patch the published row in place (no version, no hooks, `updatedAt` kept);
 *   2. if the newest version is a pending draft, patch its snapshot too, or
 *      publishing it later would restore stale Stripe ids.
 * Throws when the course does not exist.
 */
export async function recordCourseStripeSync(
  courseId: ID,
  patch: CourseStripeSyncPatch,
): Promise<void> {
  const payload = await getPayload()
  const data = buildSyncData(patch)

  await payload.db.updateOne({
    collection: "courses",
    id: courseId,
    data,
    returning: false,
  })

  const latest = await payload.findVersions({
    collection: "courses",
    where: { parent: { equals: courseId } },
    sort: "-updatedAt",
    limit: 1,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  const version = latest.docs[0]
  if (version && version.version._status === "draft") {
    await payload.db.updateVersion({
      collection: "courses",
      id: version.id,
      versionData: { version: data } as never,
      returning: false,
    })
  }
}
