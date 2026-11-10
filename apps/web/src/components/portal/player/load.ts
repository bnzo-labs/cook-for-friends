import { notFound } from "next/navigation"

import { locales } from "@/i18n/locales"
import { redirect } from "@/i18n/navigation"
import { getCourseCommerceRecord, getPublishedCourse } from "@/modules/catalog"
import type { ID, Locale } from "@/modules/_shared"
import { getCoursePlayer, type CoursePlayerView } from "@/modules/learning"

export type PlayerLoad = { kind: "ok"; player: CoursePlayerView } | { kind: "forbidden" }

/**
 * Resolve the player view for `/account/courses/[slug]`. The slug is the
 * localized one; after a locale switch the old slug is unknown here, so look it
 * up in the other locale and redirect to the right one (keeping the lesson).
 * FORBIDDEN → the page renders the 403 state; NOT_FOUND → 404.
 */
export async function loadPlayer(
  locale: Locale,
  customerId: ID,
  slug: string,
  lessonId: string | null,
): Promise<PlayerLoad> {
  const result = await getCoursePlayer(customerId, slug, locale)
  if (result.ok) return { kind: "ok", player: result.data }
  if (result.error.code === "FORBIDDEN") return { kind: "forbidden" }
  if (result.error.code !== "NOT_FOUND") throw new Error(`player load failed: ${result.error.code}`)

  for (const other of locales.filter((l) => l !== locale)) {
    const course = await getPublishedCourse(slug, other)
    if (!course || course.format !== "online") continue
    const record = await getCourseCommerceRecord(course.id)
    const target = record?.slug[locale] || record?.slug.fr
    if (!target || target === slug) break
    if (lessonId === null) {
      redirect({ href: { pathname: "/account/courses/[slug]", params: { slug: target } }, locale })
    } else {
      redirect({
        href: { pathname: "/account/courses/[slug]/[lesson]", params: { slug: target, lesson: lessonId } },
        locale,
      })
    }
  }
  notFound()
}
