/**
 * W4-01 fixtures. Idempotent in the sense that matters on the shared CI branch:
 * every call creates its own `[E2E]`-prefixed rows with a unique suffix, and every
 * assertion is scoped to ids returned here (no global counts). Test-only.
 */
import Stripe from "stripe"
import type { Payload } from "payload"
import { expect, type APIRequestContext } from "@playwright/test"

import { uid } from "../integration"
import { grantCourse, makeNamedCustomer } from "../portal-fixtures"
import { isLive, requireEnv } from "./mode"

const DAY = 86_400_000

export type E2eCourse = { id: number; slugFr: string; slugEn: string; title: string }
export type E2eSession = { id: number; capacity: number }

type CourseInput = { format: "in_person" | "online"; cents: number; label: string }

async function createCourse(payload: Payload, i: CourseInput): Promise<E2eCourse> {
  const id = uid()
  const slugFr = `e2e-${i.label}-fr-${id}`
  const slugEn = `e2e-${i.label}-en-${id}`
  const title = `[E2E] ${i.label} ${id}`
  // Signed-events: never queue a Stripe sync (the fake has no catalog); price id is a
  // fixture whose cents the fake reads back. Live: let the real sync job run.
  const stripeFields = isLive
    ? {}
    : { stripePriceId: `price_e2e_${i.cents}_${id}`, stripeProductId: `prod_e2e_${id}`, stripeSyncStatus: "synced" as const }
  const context = isLive ? undefined : { skipStripeSync: true }
  const course = await payload.create({
    collection: "courses",
    overrideAccess: true,
    context,
    data: { title, slug: slugFr, format: i.format, price: i.cents, status: "published", _status: "published", ...stripeFields },
  })
  await payload.update({
    collection: "courses",
    id: course.id,
    locale: "en",
    overrideAccess: true,
    context,
    data: { title, slug: slugEn },
  })
  return { id: Number(course.id), slugFr, slugEn, title }
}

export async function createSession(payload: Payload, courseId: number, capacity: number): Promise<E2eSession> {
  const start = new Date(Date.now() + 14 * DAY)
  const session = await payload.create({
    collection: "sessions",
    overrideAccess: true,
    data: {
      course: courseId,
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 3 * 3_600_000).toISOString(),
      capacity,
      status: "scheduled",
    },
  })
  return { id: Number(session.id), capacity }
}

/** maxSeatsPerPurchase = 4 (W2-02b), asserted/set on the throwaway CI branch. */
export async function ensureMaxSeats(payload: Payload, max = 4): Promise<void> {
  const settings = await payload.findGlobal({ slug: "site-settings", overrideAccess: true })
  if (Number(settings.maxSeatsPerPurchase) !== max) {
    await payload.updateGlobal({ slug: "site-settings", overrideAccess: true, data: { maxSeatsPerPurchase: max } })
  }
}

export type PurchaseWorld = Awaited<ReturnType<typeof seedPurchaseWorld>>

/** In-person course 1000 cents (sessions capacity 4 + 1 + 2) and online course 2000 cents (2 lessons). */
export async function seedPurchaseWorld(payload: Payload) {
  await ensureMaxSeats(payload, 4)
  const inPerson = await createCourse(payload, { format: "in_person", cents: 1000, label: "atelier" })
  const sessionA = await createSession(payload, inPerson.id, 4)
  const sessionOne = await createSession(payload, inPerson.id, 1)
  const sessionHold = await createSession(payload, inPerson.id, 2)

  const online = await createCourse(payload, { format: "online", cents: 2000, label: "online" })
  const lessons = [] as Array<{ id: number }>
  for (const order of [0, 1]) {
    const lesson = await payload.create({
      collection: "lessons",
      overrideAccess: true,
      data: { course: online.id, title: `[E2E] Lesson ${order + 1}`, order },
    })
    lessons.push({ id: Number(lesson.id) })
  }
  const runId = uid()
  await payload.update({
    collection: "lessons",
    id: lessons[0]!.id,
    overrideAccess: true,
    data: { video: { provider: "fake", assetId: `fakeasset_${runId}`, playbackId: `fakeplay_${runId}`, durationSec: 90, status: "ready" } },
  })
  // A second, entitled-elsewhere online course proves "exactly the purchased course" in the portal.
  const otherOnline = await createCourse(payload, { format: "online", cents: 2000, label: "other" })
  const bystander = await makeNamedCustomer(payload, { firstName: "Olga", lastName: "Outsider", locale: "en" })
  await grantCourse(payload, bystander.id, otherOnline.id)

  return { inPerson, sessionA, sessionOne, sessionHold, online, lessons, otherOnline, bystander }
}

/** Live mode: drive the real `stripe-sync-course` job until every course has a price id. */
export async function syncCoursesLive(payload: Payload, request: APIRequestContext, courseIds: number[]): Promise<void> {
  if (!isLive) return
  const secret = requireEnv("CRON_SECRET")
  await expect
    .poll(
      async () => {
        await request.get("/api/cron/jobs", { headers: { authorization: `Bearer ${secret}` } })
        const { docs } = await payload.find({
          collection: "courses",
          where: { id: { in: courseIds } },
          depth: 0,
          overrideAccess: true,
          pagination: false,
        })
        return docs.filter((c) => c.stripeSyncStatus === "synced" && c.stripePriceId).length
      },
      { timeout: 180_000, intervals: [2_000, 5_000] },
    )
    .toBe(courseIds.length)
}

/** Live mode cleanup: archive `[E2E]` Products (test payments stay for audit). */
export async function archiveStripeProducts(payload: Payload, courseIds: number[]): Promise<void> {
  if (!isLive) return
  const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"))
  const { docs } = await payload.find({
    collection: "courses",
    where: { id: { in: courseIds } },
    depth: 0,
    overrideAccess: true,
    pagination: false,
  })
  for (const c of docs) {
    if (c.stripeProductId) await stripe.products.update(c.stripeProductId, { active: false })
  }
}
