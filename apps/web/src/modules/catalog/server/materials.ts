import type { ID } from "@/modules/_shared"
import type { MaterialDownload } from "../types"
import { asRec, relId, str, type Rec } from "./mappers"
import { getPayload } from "./payload"

/** R2 object key of a `media` doc: `prefix/filename` when a prefix is set. */
export function mediaStorageKey(media: Rec): string | null {
  const filename = str(media.filename)
  if (!filename) return null
  const prefix = str(media.prefix)?.replace(/^\/+|\/+$/g, "")
  return prefix ? `${prefix}/${filename}` : filename
}

/**
 * Download descriptor for a material: the R2 key plus every course that
 * contains it (directly in `course.materials` or through a lesson's
 * `materials`). No URLs: the learning route presigns after its own
 * entitlement check. `null` for unknown materials or one with no file.
 */
export async function getMaterialDownload(materialId: ID): Promise<MaterialDownload | null> {
  const payload = await getPayload()
  const found = await payload.find({
    collection: "materials",
    where: { id: { equals: materialId } },
    depth: 1,
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const material = found.docs[0] as unknown as Rec | undefined
  if (!material) return null
  const file = asRec(material.file)
  const storageKey = mediaStorageKey(file)
  if (!storageKey) return null

  const [viaCourse, viaLesson] = await Promise.all([
    payload.find({
      collection: "courses",
      where: { materials: { equals: materialId } },
      depth: 0,
      limit: 0,
      pagination: false,
      select: { title: true },
      overrideAccess: true,
    }),
    payload.find({
      collection: "lessons",
      where: { materials: { equals: materialId } },
      depth: 0,
      limit: 0,
      pagination: false,
      select: { course: true },
      overrideAccess: true,
    }),
  ])
  const seen = new Set<string>()
  const courseIds: ID[] = []
  const add = (id: ID | null) => {
    if (id === null || seen.has(String(id))) return
    seen.add(String(id))
    courseIds.push(id)
  }
  for (const c of viaCourse.docs) add(c.id)
  for (const l of viaLesson.docs as unknown as Rec[]) add(relId(l.course))

  return {
    id: material.id as ID,
    courseIds,
    storageKey,
    filename: str(file.filename) ?? storageKey,
    mimeType: str(file.mimeType) ?? "application/octet-stream",
  }
}
