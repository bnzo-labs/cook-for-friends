import type { Where } from "payload"

import type { CourseFormat, ID, Locale } from "@/modules/_shared"
import type {
  CourseCard,
  CourseCommerceRecord,
  CourseView,
  LessonOutline,
} from "../types"
import {
  FALLBACK_LOCALE,
  asRec,
  mapCommerceRecord,
  mapCourseCard,
  mediaUrl,
  nonEmpty,
  pickLocalized,
  relId,
  richText,
  type Rec,
} from "./mappers"
import { getPayload } from "./payload"
import { PUBLISHED } from "./where"
import { upcomingSessionsByCourse } from "./sessions"

const MEDIA_POPULATE = { media: { url: true, alt: true } } as const

/** Resolve a course id by localized slug. See the rule on `getPublishedCourse`. */
async function findPublishedCourseId(slug: string, locale: Locale): Promise<ID | null> {
  const payload = await getPayload()
  const find = (loc: Locale) =>
    payload.find({
      collection: "courses",
      where: { and: [PUBLISHED, { slug: { equals: slug } }] },
      locale: loc,
      limit: 1,
      depth: 0,
      pagination: false,
      overrideAccess: true,
    })
  const direct = await find(locale)
  if (direct.docs[0]) return direct.docs[0].id
  if (locale === FALLBACK_LOCALE) return null

  // Slug fallback: the FR slug resolves under another locale only while that
  // locale has no slug of its own (the card then links to the FR slug).
  const viaFr = await find(FALLBACK_LOCALE)
  const hit = viaFr.docs[0]
  if (!hit) return null
  const own = await payload.findByID({
    collection: "courses",
    id: hit.id,
    locale,
    fallbackLocale: false,
    depth: 0,
    select: { slug: true },
    overrideAccess: true,
  })
  return nonEmpty(own.slug) ? null : hit.id
}

async function loadLessonOutline(doc: Rec, locale: Locale): Promise<LessonOutline[]> {
  const ids = (Array.isArray(doc.lessons) ? doc.lessons : [])
    .map((l) => relId(l))
    .filter((id): id is ID => id !== null)
  const payload = await getPayload()
  const res = await payload.find({
    collection: "lessons",
    where: { course: { equals: doc.id as ID } },
    locale,
    fallbackLocale: FALLBACK_LOCALE,
    depth: 0,
    limit: 500,
    pagination: false,
    sort: "order",
    select: { title: true, order: true, isPreview: true },
    overrideAccess: true,
  })
  const outline = res.docs.map((l) => ({
    id: l.id,
    title: l.title,
    order: l.order,
    isPreview: Boolean(l.isPreview),
  }))
  if (ids.length === 0) return outline
  // The course's ordered relationship is the canonical order.
  const rank = new Map(ids.map((id, i) => [String(id), i]))
  return outline
    .filter((l) => rank.has(String(l.id)))
    .sort((a, b) => (rank.get(String(a.id)) ?? 0) - (rank.get(String(b.id)) ?? 0))
}

/**
 * Published course by the localized slug of `locale`.
 * Rule: slug match is per-locale (`/en/courses/sourdough-bread`). An FR slug
 * under `en` resolves only when the course has no EN slug; otherwise `null`.
 */
export async function getPublishedCourse(slug: string, locale: Locale): Promise<CourseView | null> {
  const id = await findPublishedCourseId(slug, locale)
  if (id === null) return null

  const payload = await getPayload()
  const res = await payload.find({
    collection: "courses",
    where: { and: [PUBLISHED, { id: { equals: id } }] },
    locale: "all",
    depth: 1,
    limit: 1,
    pagination: false,
    populate: MEDIA_POPULATE,
    overrideAccess: true,
  })
  const doc = res.docs[0] as unknown as Rec | undefined
  if (!doc) return null

  const card = mapCourseCard(doc, locale, null)
  const isInPerson = card.format === "in_person"
  const seo = asRec(doc.seo)
  const description = pickLocalizedRich(doc.description, locale)
  const [sessions, lessons] = await Promise.all([
    isInPerson ? upcomingSessionsByCourse([id], locale) : Promise.resolve(new Map()),
    isInPerson ? Promise.resolve([]) : loadLessonOutline(doc, locale),
  ])
  const { nextSessionAt: _omit, ...base } = card
  void _omit
  return {
    ...base,
    description,
    gallery: (Array.isArray(doc.gallery) ? doc.gallery : []).flatMap((m) => {
      const url = mediaUrl(m)
      return url ? [{ url, alt: pickLocalized(asRec(m).alt, locale).value }] : []
    }),
    certificateEnabled: doc.certificateEnabled === true,
    seo: {
      title: pickLocalized(seo.title, locale).value,
      description: pickLocalized(seo.description, locale).value,
    },
    upcomingSessions: sessions.get(String(id)) ?? [],
    lessons,
  }
}

function pickLocalizedRich(field: unknown, locale: Locale) {
  const all = asRec(field)
  return richText(all[locale]) ?? richText(all[FALLBACK_LOCALE])
}

export async function listPublishedCourses(
  locale: Locale,
  filter?: { format?: CourseFormat },
): Promise<CourseCard[]> {
  const payload = await getPayload()
  const clauses: Where[] = [PUBLISHED]
  if (filter?.format) clauses.push({ format: { equals: filter.format } })
  const res = await payload.find({
    collection: "courses",
    where: { and: clauses },
    locale: "all",
    depth: 1,
    limit: 0,
    pagination: false,
    sort: "createdAt",
    select: {
      slug: true,
      title: true,
      summary: true,
      format: true,
      level: true,
      durationMinutes: true,
      price: true,
      heroImage: true,
    },
    populate: MEDIA_POPULATE,
    overrideAccess: true,
  })
  const docs = res.docs as unknown as Rec[]
  const inPersonIds = docs.filter((d) => d.format === "in_person").map((d) => d.id as ID)
  const upcoming = await upcomingSessionsByCourse(inPersonIds, locale)
  return docs.map((d) =>
    mapCourseCard(d, locale, upcoming.get(String(d.id))?.[0]?.startsAt ?? null),
  )
}

/** Published version only (never drafts). `null` for unknown/never-published courses. */
export async function getCourseCommerceRecord(courseId: ID): Promise<CourseCommerceRecord | null> {
  const payload = await getPayload()
  const res = await payload.find({
    collection: "courses",
    where: { and: [{ _status: { equals: "published" } }, { id: { equals: courseId } }] },
    locale: "all",
    depth: 1,
    limit: 1,
    pagination: false,
    populate: MEDIA_POPULATE,
    overrideAccess: true,
  })
  const doc = res.docs[0] as unknown as Rec | undefined
  return doc ? mapCommerceRecord(doc) : null
}
