import type { ID, Locale } from "@/modules/_shared"
import type {
  LessonContent,
  LessonVideoPatch,
  LessonVideoRef,
  VideoProviderName,
  VideoStatus,
} from "../types"
import {
  FALLBACK_LOCALE,
  asRec,
  num,
  pickLocalized,
  relId,
  richText,
  str,
  type Rec,
} from "./mappers"
import { getPayload } from "./payload"
import { PUBLISHED } from "./where"

const STATUSES: readonly string[] = ["none", "preparing", "ready", "errored"]
const PROVIDERS: readonly string[] = ["mux", "bunny", "fake"]
const KINDS: readonly string[] = ["recipe", "pdf", "other"]

function videoStatus(v: unknown): VideoStatus {
  return typeof v === "string" && STATUSES.includes(v) ? (v as VideoStatus) : "none"
}

function mapMaterials(raw: unknown, locale: Locale): LessonContent["materials"] {
  const out: LessonContent["materials"] = []
  for (const m of Array.isArray(raw) ? raw : []) {
    // Unpopulated ids (deleted or unreadable material) are dropped.
    if (!m || typeof m !== "object") continue
    const r = m as Rec
    const id = relId(r)
    if (id === null) continue
    const kind = KINDS.includes(r.kind as string) ? (r.kind as LessonContent["materials"][number]["kind"]) : "other"
    const matLocale = r.locale === "fr" || r.locale === "en" ? r.locale : null
    out.push({ id, title: pickLocalized(r.title, locale).value ?? "", kind, locale: matLocale })
  }
  return out
}

/** `doc` read with `locale: 'all'`, depth 1 on `materials`. */
export function mapLessonContent(doc: Rec, courseId: ID, locale: Locale): LessonContent {
  const all = asRec(doc.body)
  const video = asRec(doc.video)
  const status = videoStatus(video.status)
  return {
    id: doc.id as ID,
    courseId,
    title: pickLocalized(doc.title, locale).value ?? "",
    order: num(doc.order) ?? 0,
    isPreview: doc.isPreview === true,
    body: richText(all[locale]) ?? richText(all[FALLBACK_LOCALE]),
    video: status === "none" ? null : { status, durationSec: num(video.durationSec) },
    materials: mapMaterials(doc.materials, locale),
  }
}

/**
 * Lessons of a PUBLISHED course, ordered by `order` (ties by id). Raw video
 * ids are never returned. `[]` for unknown, draft or archived courses.
 */
export async function getCourseLessonsContent(
  courseId: ID,
  locale: Locale,
): Promise<LessonContent[]> {
  const payload = await getPayload()
  const course = await payload.find({
    collection: "courses",
    where: { and: [PUBLISHED, { id: { equals: courseId } }] },
    depth: 0,
    limit: 1,
    pagination: false,
    select: { format: true },
    overrideAccess: true,
  })
  if (!course.docs[0]) return []

  const res = await payload.find({
    collection: "lessons",
    where: { course: { equals: courseId } },
    locale: "all",
    depth: 1,
    limit: 0,
    pagination: false,
    sort: "order",
    populate: { materials: { title: true, kind: true, locale: true } },
    overrideAccess: true,
  })
  return (res.docs as unknown as Rec[])
    .map((d) => mapLessonContent(d, courseId, locale))
    .sort((a, b) => a.order - b.order || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))
}

/**
 * Raw provider ids for the video module. Returned whatever the course status
 * (the caller decides access) but `courseStatus` is included.
 */
export async function getLessonVideoRef(lessonId: ID): Promise<LessonVideoRef | null> {
  const payload = await getPayload()
  const found = await payload.find({
    collection: "lessons",
    where: { id: { equals: lessonId } },
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const lesson = found.docs[0] as unknown as Rec | undefined
  if (!lesson) return null
  const courseId = relId(lesson.course)
  if (courseId === null) return null

  const courses = await payload.find({
    collection: "courses",
    where: { id: { equals: courseId } },
    depth: 0,
    limit: 1,
    pagination: false,
    select: { status: true },
    overrideAccess: true,
  })
  const courseStatus = courses.docs[0]?.status
  if (courseStatus !== "draft" && courseStatus !== "published" && courseStatus !== "archived") return null

  const v = asRec(lesson.video)
  return {
    lessonId: lesson.id as ID,
    courseId,
    courseStatus,
    isPreview: lesson.isPreview === true,
    provider: PROVIDERS.includes(v.provider as string) ? (v.provider as VideoProviderName) : null,
    assetId: str(v.assetId),
    playbackId: str(v.playbackId),
    uploadId: str(v.uploadId),
    status: videoStatus(v.status),
    durationSec: num(v.durationSec),
  }
}

/** Build the `video` group patch: only keys present on `patch`. Exported for unit tests. */
export function buildVideoData(patch: LessonVideoPatch): { video: Record<string, unknown> } {
  const video: Record<string, unknown> = { status: patch.status }
  for (const k of ["provider", "assetId", "playbackId", "uploadId", "durationSec"] as const) {
    if (patch[k] !== undefined) video[k] = patch[k]
  }
  return { video }
}

/**
 * Write `lessons.video.*` and nothing else. Goes through the DB adapter (like
 * `recordCourseStripeSync`): no hooks, no validation of unrelated required
 * fields, no draft/version side effects on the lesson or its course.
 * Throws when the lesson does not exist.
 */
export async function recordLessonVideo(lessonId: ID, patch: LessonVideoPatch): Promise<void> {
  if (!STATUSES.includes(patch.status)) throw new Error(`recordLessonVideo: invalid status ${String(patch.status)}`)
  const payload = await getPayload()
  const found = await payload.find({
    collection: "lessons",
    where: { id: { equals: lessonId } },
    depth: 0,
    limit: 1,
    pagination: false,
    select: { order: true },
    overrideAccess: true,
  })
  if (!found.docs[0]) throw new Error(`recordLessonVideo: lesson ${String(lessonId)} not found`)
  await payload.db.updateOne({
    collection: "lessons",
    id: lessonId,
    data: buildVideoData(patch),
    returning: false,
  })
}
