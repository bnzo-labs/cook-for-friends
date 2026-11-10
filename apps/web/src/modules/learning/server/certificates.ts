import type { Payload } from "payload"

import { hasActiveEntitlement } from "@/modules/access"
import { listCoursesByIds } from "@/modules/catalog"
import { enqueueEmail } from "@/modules/notifications"
import type { ID, Locale, Result } from "@/modules/_shared"

import type { Actor, CertificatePublicView, CertificateView } from "../types"
import { generateVerificationCode, normalizeVerificationCode } from "./codes"
import { isCourseComplete, loadOnlineCourse, relId } from "./course"
import { getPayload } from "./payload"
import { withTransaction } from "./tx"
import { CERT_CODE_UNIQUE_COLS, CERT_PAIR_UNIQUE_COLS, isUniqueConflict } from "./unique"
import { portalCertificatesUrl, verifyUrl } from "./urls"

const MAX_CODE_ATTEMPTS = 5
const LOCALES: readonly Locale[] = ["fr", "en"]

type CertDoc = {
  id: ID
  customer: ID | { id: ID }
  course: ID | { id: ID }
  verificationCode: string
  issuedAt: string
  locale: Locale
  customerNameSnapshot: string
  courseTitleSnapshot?: { fr?: string | null; en?: string | null } | null
}

const asLocale = (v: unknown): Locale => (v === "en" ? "en" : "fr")

function titleIn(doc: CertDoc, locale: Locale): string {
  const t = doc.courseTitleSnapshot ?? {}
  return (t[locale] || t.fr || t.en || "") as string
}

export function toCertificateView(doc: CertDoc, locale: Locale): CertificateView {
  return {
    id: doc.id,
    courseId: relId(doc.course),
    courseTitle: titleIn(doc, locale),
    verificationCode: doc.verificationCode,
    issuedAt: new Date(doc.issuedAt).toISOString(),
  }
}

/** first + last, fallback to the email local part. */
export function displayName(c: { firstName?: string | null; lastName?: string | null; email: string }): string {
  const full = [c.firstName, c.lastName]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" ")
  return full || c.email.split("@")[0] || c.email
}

async function findCertificate(payload: Payload, customerId: ID, courseId: ID): Promise<CertDoc | null> {
  const { docs } = await payload.find({
    collection: "certificates",
    where: { and: [{ customer: { equals: customerId } }, { course: { equals: courseId } }] },
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  return (docs[0] as unknown as CertDoc | undefined) ?? null
}

/**
 * Synchronous, idempotent. Returns the existing certificate, a freshly issued one,
 * or null when the course is not complete / certificates are disabled / not online.
 * Race: UNIQUE (customer, course) → loser re-reads the winner's row. The
 * `certificate-issued` email is enqueued in the same transaction as the insert,
 * so exactly the winner enqueues.
 */
export async function issueCertificateIfComplete(
  customerId: ID,
  courseId: ID,
): Promise<Result<CertificateView | null>> {
  const payload = await getPayload()

  const customer = (await payload.find({
    collection: "customers",
    where: { id: { equals: customerId } },
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })).docs[0] as unknown as
    | { email: string; firstName?: string | null; lastName?: string | null; preferredLocale?: string | null }
    | undefined
  if (!customer) return { ok: false, error: { code: "NOT_FOUND", entity: "customer" } }
  const locale = asLocale(customer.preferredLocale)

  const course = await loadOnlineCourse(courseId, locale)
  if (!course) return { ok: false, error: { code: "NOT_FOUND", entity: "course" } }
  if (!(await hasActiveEntitlement(customerId, courseId))) return { ok: false, error: { code: "FORBIDDEN" } }

  const existing = await findCertificate(payload, customerId, courseId)
  if (existing) return { ok: true, data: toCertificateView(existing, locale) }
  if (!course.certificateEnabled) return { ok: true, data: null }
  if (!(await isCourseComplete(customerId, courseId))) return { ok: true, data: null }

  const [fr, en] = await Promise.all(LOCALES.map((l) => listCoursesByIds([courseId], l)))
  const snapshot = { fr: fr?.[0]?.title ?? course.title, en: en?.[0]?.title ?? course.title }
  const customerNameSnapshot = displayName(customer)

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const verificationCode = generateVerificationCode()
    try {
      const doc = await withTransaction(async (tx) => {
        const created = (await payload.create({
          collection: "certificates",
          data: {
            customer: customerId as number,
            course: courseId as number,
            verificationCode,
            issuedAt: new Date().toISOString(),
            locale,
            customerNameSnapshot,
            courseTitleSnapshot: snapshot,
          },
          depth: 0,
          overrideAccess: true,
          req: tx.req,
        })) as unknown as CertDoc
        await enqueueEmail({
          template: "certificate-issued",
          to: customer.email,
          locale,
          idempotencyKey: `certificate-${created.id}`,
          data: {
            ...(customer.firstName ? { customerFirstName: customer.firstName } : {}),
            courseTitle: titleIn(created, locale) || course.title,
            verificationCode,
            downloadUrl: portalCertificatesUrl(locale),
            verifyUrl: verifyUrl(locale, verificationCode),
          },
          tx,
        })
        return created
      })
      return { ok: true, data: toCertificateView(doc, locale) }
    } catch (error) {
      // (customer, course) conflict → the winner's row is the answer; verification_code
      // collision (no winner) → new code. Paths only, never message text.
      if (isUniqueConflict(error, CERT_PAIR_UNIQUE_COLS) || isUniqueConflict(error, CERT_CODE_UNIQUE_COLS)) {
        const winner = await findCertificate(payload, customerId, courseId)
        if (winner) return { ok: true, data: toCertificateView(winner, locale) }
        continue
      }
      throw error
    }
  }
  throw new Error("[learning] could not allocate a unique certificate code")
}

export async function listCustomerCertificates(customerId: ID, locale: Locale): Promise<CertificateView[]> {
  const payload = await getPayload()
  const { docs } = await payload.find({
    collection: "certificates",
    where: { customer: { equals: customerId } },
    sort: "-issuedAt",
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess: true,
  })
  return (docs as unknown as CertDoc[]).map((d) => toCertificateView(d, locale))
}

/** Public lookup. Output carries no email and no ids. */
export async function verifyCertificate(code: string): Promise<CertificatePublicView | null> {
  const normalized = normalizeVerificationCode(code)
  if (!normalized) return null
  const payload = await getPayload()
  const { docs } = await payload.find({
    collection: "certificates",
    where: { verificationCode: { equals: normalized } },
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const doc = docs[0] as unknown as CertDoc | undefined
  if (!doc) return null
  const t: Record<string, unknown> = doc.courseTitleSnapshot ?? {}
  return {
    code: doc.verificationCode,
    customerName: doc.customerNameSnapshot,
    courseTitle: { fr: String(t.fr || t.en || ""), en: String(t.en || t.fr || "") },
    issuedAt: new Date(doc.issuedAt).toISOString(),
  }
}

/** Certificate row for the PDF route: owner customer or staff, else null (404, no existence leak). */
export async function getCertificateForPdf(
  certificateId: ID,
  actor: Actor,
): Promise<{ id: ID; verificationCode: string; locale: Locale } | null> {
  if (!actor) return null
  const payload = await getPayload()
  const { docs } = await payload.find({
    collection: "certificates",
    where: { id: { equals: certificateId } },
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const doc = docs[0] as unknown as CertDoc | undefined
  if (!doc) return null
  if (actor.kind === "customer" && String(relId(doc.customer)) !== String(actor.id)) return null
  return { id: doc.id, verificationCode: doc.verificationCode, locale: asLocale(doc.locale) }
}
