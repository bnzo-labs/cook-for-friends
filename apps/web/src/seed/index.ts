/**
 * Seed — dev database only. Run with `pnpm seed` (from apps/web).
 *
 * Idempotent: documents are matched by slug (fr) or email and updated in place.
 * Staff passwords come from SEED_PASSWORD; when it is absent a random password is
 * used and never printed (use "forgot password" or re-run with SEED_PASSWORD).
 *
 * Fictional content only — this repository is public.
 */
import { randomBytes } from "node:crypto"
import { getPayload, type Payload } from "payload"

import config from "../payload.config"
import {
  cancellationTiers,
  homeSeed,
  inPersonCourses,
  onlineCourses,
  productSeed,
  staffSeed,
  type InPersonSeed,
  type OnlineSeed,
} from "./data"
import { lexical } from "./lexical"

type ID = number

async function findIdBy(
  payload: Payload,
  collection: "courses" | "products" | "pages" | "users" | "lessons",
  field: string,
  value: string,
): Promise<ID | null> {
  const res = await payload.find({
    collection,
    where: { [field]: { equals: value } },
    locale: "fr",
    limit: 1,
    depth: 0,
    draft: true,
    overrideAccess: true,
  })
  return (res.docs[0]?.id as ID | undefined) ?? null
}

async function seedStaff(payload: Payload): Promise<void> {
  const password = process.env.SEED_PASSWORD || randomBytes(24).toString("base64url")
  for (const s of staffSeed) {
    const existing = await findIdBy(payload, "users", "email", s.email)
    if (existing) {
      await payload.update({
        collection: "users",
        id: existing,
        data: { name: s.name, role: s.role, ...(process.env.SEED_PASSWORD ? { password } : {}) },
        overrideAccess: true,
      })
    } else {
      await payload.create({
        collection: "users",
        data: { email: s.email, name: s.name, role: s.role, password },
        overrideAccess: true,
      })
    }
  }
  payload.logger.info(
    `seed: staff ready (${staffSeed.map((s) => s.email).join(", ")}). Password ${
      process.env.SEED_PASSWORD ? "from SEED_PASSWORD" : "random, not printed"
    }.`,
  )
}

async function upsertCourse(
  payload: Payload,
  c: InPersonSeed | OnlineSeed,
  format: "in_person" | "online",
): Promise<ID> {
  const base = {
    format,
    level: c.level,
    price: c.price,
    status: "published" as const,
    _status: "published" as const,
    durationMinutes: "durationMinutes" in c ? c.durationMinutes : undefined,
    certificateEnabled: format === "online",
  }
  const fr = {
    ...base,
    title: c.title.fr,
    slug: c.slug.fr,
    summary: c.summary.fr,
    description: lexical(c.description.fr),
    seo: { title: c.title.fr, description: c.summary.fr },
  }
  const existing = await findIdBy(payload, "courses", "slug", c.slug.fr)
  const doc = existing
    ? await payload.update({ collection: "courses", id: existing, data: fr, locale: "fr", overrideAccess: true })
    : await payload.create({ collection: "courses", data: fr, locale: "fr", overrideAccess: true })
  await payload.update({
    collection: "courses",
    id: doc.id,
    locale: "en",
    overrideAccess: true,
    data: {
      _status: "published",
      title: c.title.en,
      slug: c.slug.en,
      summary: c.summary.en,
      description: lexical(c.description.en),
      seo: { title: c.title.en, description: c.summary.en },
    },
  })
  return doc.id
}

function sessionDates(daysFromNow: number, hour: number, durationMinutes: number) {
  const start = new Date()
  start.setUTCDate(start.getUTCDate() + daysFromNow)
  // Hours are Toronto local time; EDT/EST offset approximated as UTC-4 for seed data.
  start.setUTCHours(hour + 4, 0, 0, 0)
  const end = new Date(start.getTime() + durationMinutes * 60_000)
  return { startsAt: start.toISOString(), endsAt: end.toISOString() }
}

async function seedInPerson(payload: Payload): Promise<void> {
  for (const c of inPersonCourses) {
    const courseId = await upsertCourse(payload, c, "in_person")
    const old = await payload.find({
      collection: "sessions",
      where: { course: { equals: courseId } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    if (old.totalDocs >= c.sessions.length) continue
    for (const s of c.sessions) {
      const created = await payload.create({
        collection: "sessions",
        locale: "fr",
        overrideAccess: true,
        data: {
          course: courseId,
          ...sessionDates(s.daysFromNow, s.hour, c.durationMinutes),
          capacity: s.capacity,
          status: "scheduled",
          location: {
            name: "Atelier Cook for Friends",
            address: "123, rue Exemple",
            city: "Montréal",
            postalCode: "H2X 0A0",
          },
          notes: "Apportez un tablier.",
        },
      })
      await payload.update({
        collection: "sessions",
        id: created.id,
        locale: "en",
        overrideAccess: true,
        data: { location: { name: "Cook for Friends Studio" }, notes: "Bring an apron." },
      })
    }
  }
}

async function seedOnline(payload: Payload): Promise<void> {
  for (const c of onlineCourses) {
    const courseId = await upsertCourse(payload, c, "online")
    const lessonIds: ID[] = []
    for (const [order, l] of c.lessons.entries()) {
      const existing = await payload.find({
        collection: "lessons",
        where: { and: [{ course: { equals: courseId } }, { order: { equals: order } }] },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const fr = {
        course: courseId,
        order,
        title: l.title.fr,
        body: lexical(l.body.fr),
        isPreview: l.isPreview,
        video: { provider: "mux" as const, assetId: `seed-asset-${c.slug.en}-${order}`, durationSec: l.durationSec },
      }
      const found = existing.docs[0]
      const doc = found
        ? await payload.update({ collection: "lessons", id: found.id, data: fr, locale: "fr", overrideAccess: true })
        : await payload.create({ collection: "lessons", data: fr, locale: "fr", overrideAccess: true })
      await payload.update({
        collection: "lessons",
        id: doc.id,
        locale: "en",
        overrideAccess: true,
        data: { title: l.title.en, body: lexical(l.body.en) },
      })
      lessonIds.push(doc.id)
    }
    await payload.update({
      collection: "courses",
      id: courseId,
      overrideAccess: true,
      data: { lessons: lessonIds, _status: "published" },
    })
  }
}

async function seedProduct(payload: Payload): Promise<void> {
  const p = productSeed
  const fr = {
    slug: p.slug.fr,
    title: p.title.fr,
    description: p.description.fr,
    priceDisplay: p.priceDisplay.fr,
    externalUrl: p.externalUrl,
    status: "published" as const,
  }
  const existing = await findIdBy(payload, "products", "slug", p.slug.fr)
  const doc = existing
    ? await payload.update({ collection: "products", id: existing, data: fr, locale: "fr", overrideAccess: true })
    : await payload.create({ collection: "products", data: fr, locale: "fr", overrideAccess: true })
  await payload.update({
    collection: "products",
    id: doc.id,
    locale: "en",
    overrideAccess: true,
    data: { slug: p.slug.en, title: p.title.en, description: p.description.en, priceDisplay: p.priceDisplay.en },
  })
}

async function seedHome(payload: Payload): Promise<void> {
  const h = homeSeed
  const layoutFr = [
    { blockType: "hero" as const, heading: h.hero.heading.fr, subheading: h.hero.subheading.fr, ctaLabel: h.hero.ctaLabel.fr, ctaHref: h.hero.ctaHref },
    { blockType: "gallery" as const, heading: h.gallery.heading.fr },
    {
      blockType: "testimonials" as const,
      heading: h.testimonials.heading.fr,
      items: h.testimonials.items.map((i) => ({ quote: i.quote.fr, author: i.author, role: i.role.fr })),
    },
    { blockType: "cta" as const, heading: h.cta.heading.fr, body: h.cta.body.fr, buttonLabel: h.cta.buttonLabel.fr, buttonHref: h.cta.buttonHref },
    { blockType: "richText" as const, content: lexical(h.richText.fr) },
  ]
  const fr = { slug: h.slug.fr, title: h.title.fr, layout: layoutFr, _status: "published" as const }
  const existing = await findIdBy(payload, "pages", "slug", h.slug.fr)
  const doc = existing
    ? await payload.update({ collection: "pages", id: existing, data: fr, locale: "fr", overrideAccess: true })
    : await payload.create({ collection: "pages", data: fr, locale: "fr", overrideAccess: true })

  // EN pass: keep block/array row ids so only localized columns change.
  const layoutEn = (doc.layout ?? []).map((block) => {
    switch (block.blockType) {
      case "hero":
        return { ...block, heading: h.hero.heading.en, subheading: h.hero.subheading.en, ctaLabel: h.hero.ctaLabel.en }
      case "gallery":
        return { ...block, heading: h.gallery.heading.en }
      case "testimonials":
        return {
          ...block,
          heading: h.testimonials.heading.en,
          items: (block.items ?? []).map((item, i) => ({
            ...item,
            quote: h.testimonials.items[i]?.quote.en ?? item.quote,
            role: h.testimonials.items[i]?.role.en ?? item.role,
          })),
        }
      case "cta":
        return { ...block, heading: h.cta.heading.en, body: h.cta.body.en, buttonLabel: h.cta.buttonLabel.en }
      case "richText":
        return { ...block, content: lexical(h.richText.en) }
      default:
        return block
    }
  })
  await payload.update({
    collection: "pages",
    id: doc.id,
    locale: "en",
    overrideAccess: true,
    data: { slug: h.slug.en, title: h.title.en, layout: layoutEn, _status: "published" },
  })
}

async function seedGlobals(payload: Payload): Promise<void> {
  await payload.updateGlobal({
    slug: "site-settings",
    overrideAccess: true,
    data: {
      maxSeatsPerPurchase: 1,
      holdMinutes: 15,
      waitlistNotifyCount: 3,
      reminderOffsetsHours: [48, 24],
      contactEmail: "bonjour@example.com",
    },
  })
  await payload.updateGlobal({
    slug: "cancellation-policy",
    overrideAccess: true,
    data: { tiers: cancellationTiers, customerCanSelfCancel: true },
  })
}

export async function seed(payload: Payload): Promise<void> {
  await seedStaff(payload)
  await seedInPerson(payload)
  await seedOnline(payload)
  await seedProduct(payload)
  await seedHome(payload)
  await seedGlobals(payload)
  payload.logger.info("seed: done")
}

// Top-level await: `payload run` exits as soon as the module import settles.
const payload = await getPayload({ config })
try {
  await seed(payload)
} catch (err) {
  payload.logger.error({ err }, "seed failed")
  process.exitCode = 1
} finally {
  await payload.destroy()
}
