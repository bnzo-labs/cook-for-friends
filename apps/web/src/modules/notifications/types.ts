/**
 * notifications/types.ts — public types per CONTRACT §4 + CCR-W2-3 + CCR-W2-6.
 * Do not modify without an orchestrator decision.
 */
import type { ISODate } from "@/modules/_shared"

export type EmailTemplate =
  | "magic-link"
  | "order-confirmation"
  | "enrollment-confirmation"
  | "reminder"
  | "waitlist-seat-available"
  | "cancellation-confirmation"
  | "refund-issued"
  | "oversell-refund"
  | "certificate-issued"
  | "comment-approved"

type Location = {
  name: string
  address: string
  city: string
  postalCode?: string
  mapsUrl?: string
}

/** Attachment to include in an outbound email (e.g. .ics file). */
export type Attachment = {
  filename: string
  /** UTF-8 string or base64-encoded bytes. */
  content: string
  contentType: string
}

/** Input for building a single calendar event (RFC 5545 VEVENT). */
export type IcsInput = {
  uid: string
  title: string
  description: string
  location: string
  /** ISO 8601 UTC date-time string. */
  startsAt: ISODate
  /** ISO 8601 UTC date-time string. */
  endsAt: ISODate
  url: string
}

/**
 * Per-template data shapes. CONTRACT §4.
 * Wave 2 defined the first 5 entries; CCR-W3-3 adds the rest.
 * URLs (accountUrl, bookUrl, downloadUrl, verifyUrl, lessonUrl) are built by the
 * sender: absolute + localized. Templates never build URLs.
 */
export type EmailData = {
  "magic-link": {
    link: string
    expiresInMinutes: number
  }
  "order-confirmation": {
    orderNumber: string
    customerFirstName?: string
    items: {
      title: string
      /** CCR-W2-6 */
      quantity: number
      sessionStartsAt?: ISODate
      sessionEndsAt?: ISODate
      location?: Location
      /** Total line amount in cents (quantity × unit). */
      amount: number
      /** CCR-W2-6: guest attendees booked by the buyer (index ≥ 1). */
      attendees?: { name: string; email: string }[]
    }[]
    subtotal: number
    discountTotal: number
    taxTotal: number
    total: number
    currency: "cad"
    receiptUrl?: string
    contactEmail?: string
    /** CCR-W3-3: login page link (never a token). Account block renders only when set. */
    accountUrl?: string
  }
  /** CCR-W2-6: guest-seat notice sent to each attendee (index ≥ 1). */
  "enrollment-confirmation": {
    attendeeFirstName?: string
    buyerName: string
    courseTitle: string
    sessionStartsAt: ISODate
    sessionEndsAt: ISODate
    location: Location
    contactEmail?: string
    /** CCR-W3-3: login page link (never a token). Account block renders only when set. */
    accountUrl?: string
  }
  "oversell-refund": {
    orderNumber: string
    courseTitle: string
    sessionStartsAt: ISODate
    /** CCR-W2-6: number of seats that were refunded. */
    quantity: number
    refundAmount: number
    currency: "cad"
  }
  "refund-issued": {
    orderNumber: string
    refundAmount: number
    currency: "cad"
    full: boolean
  }
  /** CCR-W3-3. `.ics` comes from enqueueEmail({ ics }). */
  reminder: {
    attendeeFirstName?: string
    courseTitle: string
    sessionStartsAt: ISODate
    sessionEndsAt: ISODate
    location: Location
    hoursBefore: number
    accountUrl: string
    contactEmail?: string
  }
  "waitlist-seat-available": {
    courseTitle: string
    sessionStartsAt: ISODate
    location: Location
    bookUrl: string
  }
  /** attendee variant renders no amount, code or order number. */
  "cancellation-confirmation": {
    recipient: "buyer" | "attendee"
    attendeeName: string
    cancelledByName?: string
    courseTitle: string
    sessionStartsAt: ISODate
    outcome: "refund" | "credit" | "none"
    amount: number
    currency: "cad"
    creditCode?: string
    creditExpiresAt?: ISODate
    orderNumber?: string
  }
  "certificate-issued": {
    customerFirstName?: string
    courseTitle: string
    verificationCode: string
    downloadUrl: string
    verifyUrl: string
  }
  "comment-approved": {
    customerFirstName?: string
    courseTitle: string
    lessonTitle: string
    lessonUrl: string
  }
}

