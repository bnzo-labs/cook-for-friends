/**
 * W3-03b seed: one online course (3 lessons, lesson 1 has a fake-provider video
 * and a material), three customers (two entitled, one not). Throwaway branch only.
 */
import type { Payload } from "payload"

import { makeCourse, makeLesson } from "./fixtures"
import { grantCourse, makeNamedCustomer } from "./portal-fixtures"
import { uid } from "./integration"

export type PlayerWorld = Awaited<ReturnType<typeof seedPlayerWorld>>

export async function seedPlayerWorld(payload: Payload) {
  const id = uid()
  const course = await makeCourse(payload, "online")
  const slugs = { fr: `player-fr-${id}`, en: `player-en-${id}` }
  await payload.update({
    collection: "courses",
    id: course.id,
    locale: "fr",
    overrideAccess: true,
    data: { title: `Pâtisserie en ligne ${id}`, slug: slugs.fr, summary: "Résumé", certificateEnabled: true },
  })
  await payload.update({
    collection: "courses",
    id: course.id,
    locale: "en",
    overrideAccess: true,
    data: { title: `Online pastry ${id}`, slug: slugs.en, summary: "Summary" },
  })

  const lessons = [
    await makeLesson(payload, course.id, 0),
    await makeLesson(payload, course.id, 1),
    await makeLesson(payload, course.id, 2),
  ]
  const media = await payload.db.create({
    collection: "media",
    data: { filename: `recette-${id}.pdf`, mimeType: "application/pdf", filesize: 13 },
  })
  const material = await payload.create({
    collection: "materials",
    overrideAccess: true,
    data: { title: `Recette ${id}`, file: media.id, kind: "recipe", locale: "fr" },
  })
  await payload.update({
    collection: "lessons",
    id: lessons[0]!.id,
    overrideAccess: true,
    data: {
      materials: [material.id],
      video: { provider: "fake", assetId: `fakeasset_${id}`, playbackId: `fakeplay_${id}`, durationSec: 90, status: "ready" },
    },
  })

  const ana = await makeNamedCustomer(payload, { firstName: "Ana", lastName: "Alvarez" })
  const ben = await makeNamedCustomer(payload, { firstName: "Ben", lastName: "Bouchard", locale: "en" })
  const outsider = await makeNamedCustomer(payload, { firstName: "Olga", lastName: "Outsider" })
  await grantCourse(payload, ana.id, course.id)
  await grantCourse(payload, ben.id, course.id)

  return { course, slugs, lessons, material, ana, ben, outsider }
}
