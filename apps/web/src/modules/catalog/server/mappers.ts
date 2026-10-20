import type { ID, Locale } from "@/modules/_shared"
import type {
  CancellationPolicy,
  CancellationTier,
  CourseCard,
  CourseCommerceRecord,
  CourseLevel,
  Localized,
  RichTextDoc,
  SessionLocation,
  SessionStatus,
  SessionSummary,
  SiteSettings,
  StripeSyncStatus,
} from "../types"

/** Content fallback locale (DISCOVERY §4). */
export const FALLBACK_LOCALE: Locale = "fr"

export type Rec = Record<string, unknown>

/** Per-locale values of a localized field read with `locale: 'all'`. */
export type AllLocales<T = unknown> = Partial<Record<Locale, T | null | undefined>>

export function asRec(v: unknown): Rec {
  return v && typeof v === "object" ? (v as Rec) : {}
}

export function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0
}

export function str(v: unknown): string | null {
  return nonEmpty(v) ? v : null
}

export function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

/** Value for `locale`, else French. Returns `fellBack` when French was used. */
export function pickLocalized(
  field: unknown,
  locale: Locale,
): { value: string | null; fellBack: boolean } {
  const all = asRec(field) as AllLocales
  const wanted = all[locale]
  if (nonEmpty(wanted)) return { value: wanted, fellBack: false }
  const fb = all[FALLBACK_LOCALE]
  return { value: nonEmpty(fb) ? fb : null, fellBack: locale !== FALLBACK_LOCALE }
}

export function localizedPair(field: unknown): Localized {
  const all = asRec(field) as AllLocales
  const fr = str(all.fr) ?? ""
  return { fr, en: str(all.en) ?? fr }
}

/** True when the requested locale lacks a title, or a summary that French has. */
export function computeLocaleFallback(title: unknown, summary: unknown, locale: Locale): boolean {
  if (locale === FALLBACK_LOCALE) return false
  const t = pickLocalized(title, locale)
  if (t.fellBack) return true
  const s = pickLocalized(summary, locale)
  return s.fellBack && s.value !== null
}

export function relId(v: unknown): ID | null {
  if (v === null || v === undefined) return null
  if (typeof v === "object") {
    const id = (v as { id?: unknown }).id
    return typeof id === "string" || typeof id === "number" ? id : null
  }
  return typeof v === "string" || typeof v === "number" ? v : null
}

export function mediaUrl(v: unknown): string | null {
  return typeof v === "object" && v !== null ? str((v as Rec).url) : null
}

const LEVELS: readonly string[] = ["beginner", "intermediate", "advanced"]
export function level(v: unknown): CourseLevel | null {
  return typeof v === "string" && LEVELS.includes(v) ? (v as CourseLevel) : null
}

export function isoDate(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v ?? "")
}

export function richText(v: unknown): RichTextDoc | null {
  return v && typeof v === "object" ? (v as RichTextDoc) : null
}

export function mapLocation(raw: unknown): SessionLocation {
  const l = asRec(raw)
  return {
    name: str(l.name),
    address: str(l.address),
    city: str(l.city),
    postalCode: str(l.postalCode),
    mapsUrl: str(l.mapsUrl),
  }
}

/** `doc` read with a concrete locale + fallbackLocale. */
export function mapSessionSummary(doc: Rec, courseLevel: CourseLevel | null): SessionSummary {
  return {
    id: doc.id as ID,
    startsAt: isoDate(doc.startsAt),
    endsAt: isoDate(doc.endsAt),
    location: mapLocation(doc.location),
    level: level(doc.level) ?? courseLevel,
    capacity: num(doc.capacity) ?? 0,
    status: doc.status as SessionStatus,
  }
}

/** `doc` read with `locale: 'all'`. Slug follows the requested locale, else French. */
export function mapCourseCard(
  doc: Rec,
  locale: Locale,
  nextSessionAt: string | null,
): CourseCard {
  const title = pickLocalized(doc.title, locale)
  const summary = pickLocalized(doc.summary, locale)
  const slug = pickLocalized(doc.slug, locale)
  return {
    id: doc.id as ID,
    slug: slug.value ?? "",
    format: doc.format as CourseCard["format"],
    title: title.value ?? "",
    summary: summary.value,
    level: level(doc.level),
    durationMinutes: num(doc.durationMinutes),
    price: { amount: num(doc.price) ?? 0, currency: "cad" },
    heroImageUrl: mediaUrl(doc.heroImage),
    isLocaleFallback: computeLocaleFallback(doc.title, doc.summary, locale),
    nextSessionAt,
  }
}

const SYNC: readonly string[] = ["pending", "synced", "error"]

export function mapCommerceRecord(doc: Rec): CourseCommerceRecord {
  const hero = mediaUrl(doc.heroImage)
  const sync = typeof doc.stripeSyncStatus === "string" && SYNC.includes(doc.stripeSyncStatus)
  return {
    id: doc.id as ID,
    format: doc.format as CourseCommerceRecord["format"],
    status: doc.status as CourseCommerceRecord["status"],
    price: num(doc.price) ?? 0,
    title: localizedPair(doc.title),
    summary: localizedPair(doc.summary),
    slug: localizedPair(doc.slug),
    stripeProductId: str(doc.stripeProductId),
    stripePriceId: str(doc.stripePriceId),
    stripeSyncStatus: sync ? (doc.stripeSyncStatus as StripeSyncStatus) : "pending",
    ...(hero ? { heroImageUrl: hero } : {}),
  }
}

/** Defaults match CONTRACT §3.1 and the global's `defaultValue`s. */
export const SITE_SETTINGS_DEFAULTS: SiteSettings = {
  communityUrl: null,
  maxSeatsPerPurchase: 1,
  holdMinutes: 15,
  waitlistNotifyCount: 3,
  reminderOffsetsHours: [48, 24],
  contactEmail: null,
  legal: { termsPageId: null, privacyPageId: null, cancellationPageId: null },
}

function posInt(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 ? v : fallback
}

export function mapSiteSettings(doc: Rec | null | undefined): SiteSettings {
  const d = SITE_SETTINGS_DEFAULTS
  if (!doc) return { ...d, reminderOffsetsHours: [...d.reminderOffsetsHours], legal: { ...d.legal } }
  const legal = asRec(doc.legal)
  const offsets = Array.isArray(doc.reminderOffsetsHours)
    ? doc.reminderOffsetsHours.filter((h): h is number => typeof h === "number" && h > 0)
    : []
  return {
    communityUrl: str(doc.communityUrl),
    maxSeatsPerPurchase: posInt(doc.maxSeatsPerPurchase, d.maxSeatsPerPurchase),
    holdMinutes: posInt(doc.holdMinutes, d.holdMinutes),
    waitlistNotifyCount: posInt(doc.waitlistNotifyCount, d.waitlistNotifyCount),
    reminderOffsetsHours: offsets.length > 0 ? offsets : [...d.reminderOffsetsHours],
    contactEmail: str(doc.contactEmail),
    legal: {
      termsPageId: relId(legal.termsPage),
      privacyPageId: relId(legal.privacyPage),
      cancellationPageId: relId(legal.cancellationPage),
    },
  }
}

export function mapCancellationPolicy(doc: Rec | null | undefined): CancellationPolicy {
  const raw = Array.isArray(doc?.tiers) ? (doc?.tiers as Rec[]) : []
  const tiers: CancellationTier[] = raw
    .filter((t) => num(t.minHoursBefore) !== null && num(t.percent) !== null)
    .map((t) => ({
      minHoursBefore: t.minHoursBefore as number,
      outcome: t.outcome as CancellationTier["outcome"],
      percent: t.percent as number,
    }))
    .sort((a, b) => b.minHoursBefore - a.minHoursBefore)
  return {
    tiers,
    customerCanSelfCancel: doc?.customerCanSelfCancel !== false,
  }
}
