import type { CourseFormat, ID, ISODate, Locale, Money } from "@/modules/_shared"

/**
 * Public catalog view types — CONTRACT §4 `@/modules/catalog`.
 * Plain data only: no Payload docs, relationship wrappers or version metadata.
 */

export type CourseLevel = "beginner" | "intermediate" | "advanced"
export type SessionStatus = "scheduled" | "cancelled" | "completed"
export type StripeSyncStatus = "pending" | "synced" | "error"

/** Opaque Lexical editor state. Render with the storefront's rich-text renderer. */
export type RichTextDoc = Record<string, unknown>

export type SessionLocation = {
  name: string | null
  address: string | null
  city: string | null
  postalCode: string | null
  mapsUrl: string | null
}

export type SessionSummary = {
  id: ID
  startsAt: ISODate
  endsAt: ISODate
  location: SessionLocation
  /** Session level override, else the course level. */
  level: CourseLevel | null
  capacity: number
  status: SessionStatus
}

/** Capacity only. Availability is commerce's job (`getAvailableSeats`). */
export type SessionView = SessionSummary & {
  courseId: ID
  courseSlug: string
  courseTitle: string
}

export type LessonOutline = {
  id: ID
  title: string
  order: number
  isPreview: boolean
}

export type CourseCard = {
  id: ID
  slug: string
  format: CourseFormat
  title: string
  summary: string | null
  level: CourseLevel | null
  durationMinutes: number | null
  price: Money
  heroImageUrl: string | null
  /** True when the requested locale lacks title/summary and French is shown. */
  isLocaleFallback: boolean
  /** In-person only: earliest upcoming scheduled session. */
  nextSessionAt: ISODate | null
}

export type CourseView = Omit<CourseCard, "nextSessionAt"> & {
  description: RichTextDoc | null
  gallery: { url: string; alt: string | null }[]
  certificateEnabled: boolean
  seo: { title: string | null; description: string | null }
  /** In-person: scheduled, future, ascending. Empty for online. */
  upcomingSessions: SessionSummary[]
  /** Online: titles only (no body, no video). Empty for in-person. */
  lessons: LessonOutline[]
}

export type Localized<T = string> = { fr: T; en: T }

/** Published version only. Consumed by commerce (Stripe sync, checkout). */
export type CourseCommerceRecord = {
  id: ID
  format: CourseFormat
  status: "draft" | "published" | "archived"
  /** Cents, CAD, tax-exclusive. */
  price: number
  title: Localized
  summary: Localized
  slug: Localized
  stripeProductId: string | null
  stripePriceId: string | null
  stripeSyncStatus: StripeSyncStatus
  heroImageUrl?: string
}

export type CourseStripeSyncPatch = {
  status: StripeSyncStatus
  productId?: string
  priceId?: string
  error?: string | null
}

export type SiteSettings = {
  communityUrl: string | null
  maxSeatsPerPurchase: number
  holdMinutes: number
  waitlistNotifyCount: number
  reminderOffsetsHours: number[]
  contactEmail: string | null
  legal: { termsPageId: ID | null; privacyPageId: ID | null; cancellationPageId: ID | null }
}

export type CancellationTier = {
  minHoursBefore: number
  outcome: "refund" | "credit" | "none"
  percent: number
}

export type CancellationPolicy = {
  /** Sorted by `minHoursBefore` descending. */
  tiers: CancellationTier[]
  customerCanSelfCancel: boolean
}

export type { Locale }
