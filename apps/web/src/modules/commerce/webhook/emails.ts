import enMsg from "@/i18n/messages/en.json"
import frMsg from "@/i18n/messages/fr.json"
import type { Locale, TxContext } from "@/modules/_shared"
import type { SessionView } from "@/modules/catalog"
import { enqueueEmail, type EmailData, type IcsInput } from "@/modules/notifications"

import type { CompletedPrepared } from "./handlers/completed-prepare"
import { siteOrigin } from "./shared"

type Paid = Extract<CompletedPrepared, { kind: "paid" }>
type EmailLocation = EmailData["enrollment-confirmation"]["location"]

const MESSAGES = { fr: frMsg, en: enMsg } as const

function t(locale: Locale, key: "ics_description", vars: Record<string, string>): string {
  const template = MESSAGES[locale].commerce.webhook[key]
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "")
}

export const courseTitle = (p: Paid): string =>
  p.course?.title[p.meta.locale] ?? p.sessionView?.courseTitle ?? p.line.description ?? ""

export function emailLocation(view: SessionView): EmailLocation {
  const l = view.location
  return {
    name: l.name ?? "",
    address: l.address ?? "",
    city: l.city ?? "",
    ...(l.postalCode ? { postalCode: l.postalCode } : {}),
    ...(l.mapsUrl ? { mapsUrl: l.mapsUrl } : {}),
  }
}

async function courseUrl(locale: Locale, slug: string | undefined): Promise<string> {
  const origin = siteOrigin()
  if (!slug) return `${origin}/${locale}`
  const { getPathname } = await import("@/i18n/navigation")
  return `${origin}${getPathname({ locale, href: { pathname: "/courses/[slug]", params: { slug } } })}`
}

/** Absolute, localized login page (no token), for the `accountUrl` link in confirmations. */
export async function accountUrl(locale: Locale): Promise<string> {
  const { getPathname } = await import("@/i18n/navigation")
  return `${siteOrigin()}${getPathname({ locale, href: "/auth/login" })}`
}

/** `.ics` for one enrollment: uid `enrollment-<id>@cookforfriends`. */
export async function enrollmentIcs(p: Paid, enrollmentId: number): Promise<IcsInput[]> {
  const view = p.sessionView
  if (!view) return []
  const title = courseTitle(p)
  const loc = emailLocation(view)
  return [
    {
      uid: `enrollment-${enrollmentId}@cookforfriends`,
      title,
      description: t(p.meta.locale, "ics_description", { course: title }),
      location: [loc.name, loc.address, [loc.city, loc.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      startsAt: view.startsAt,
      endsAt: view.endsAt,
      url: await courseUrl(p.meta.locale, view.courseSlug || p.course?.slug[p.meta.locale]),
    },
  ]
}

export async function enqueueOrderConfirmation(
  p: Paid,
  order: { id: number; number: string },
  buyerEnrollmentId: number | null,
  tx: TxContext,
): Promise<void> {
  const view = p.sessionView
  const guests = p.attendees.filter((a) => a.index > 0).map((a) => ({ name: a.attendeeName, email: a.email }))
  const buyer = p.attendees[0]
  await enqueueEmail({
    template: "order-confirmation",
    to: buyer?.email ?? "",
    locale: p.meta.locale,
    idempotencyKey: `order-confirmation-${order.id}`,
    data: {
      orderNumber: order.number,
      ...(buyer?.firstName ? { customerFirstName: buyer.firstName } : {}),
      items: [
        {
          title: courseTitle(p),
          quantity: p.quantity,
          ...(view ? { sessionStartsAt: view.startsAt, sessionEndsAt: view.endsAt, location: emailLocation(view) } : {}),
          amount: p.line.amountSubtotal,
          ...(guests.length > 0 ? { attendees: guests } : {}),
        },
      ],
      subtotal: Number(p.session.amount_subtotal ?? 0),
      discountTotal: Number(p.session.total_details?.amount_discount ?? 0),
      taxTotal: p.taxes.total,
      total: Number(p.session.amount_total ?? 0),
      currency: "cad",
      receiptUrl: `${siteOrigin()}/api/orders/${order.id}/receipt`,
      accountUrl: await accountUrl(p.meta.locale),
      ...(p.contactEmail ? { contactEmail: p.contactEmail } : {}),
    },
    ...(buyerEnrollmentId !== null ? { ics: await enrollmentIcs(p, buyerEnrollmentId) } : {}),
    tx,
  })
}

/** One per guest seat; duplicate-email seats get no extra email. */
export async function enqueueGuestConfirmations(p: Paid, enrollmentIds: Map<number, number>, tx: TxContext): Promise<void> {
  const view = p.sessionView
  if (!view) return
  const buyerName = p.attendees[0]?.attendeeName ?? ""
  for (const a of p.attendees) {
    if (a.index === 0 || a.duplicate) continue
    const enrollmentId = enrollmentIds.get(a.index)
    if (enrollmentId === undefined) continue
    await enqueueEmail({
      template: "enrollment-confirmation",
      to: a.email,
      locale: p.meta.locale,
      idempotencyKey: `enrollment-confirmation-${enrollmentId}`,
      data: {
        ...(a.firstName ? { attendeeFirstName: a.firstName } : {}),
        buyerName,
        courseTitle: courseTitle(p),
        sessionStartsAt: view.startsAt,
        sessionEndsAt: view.endsAt,
        location: emailLocation(view),
        accountUrl: await accountUrl(p.meta.locale),
        ...(p.contactEmail ? { contactEmail: p.contactEmail } : {}),
      },
      ics: await enrollmentIcs(p, enrollmentId),
      tx,
    })
  }
}

export async function enqueueOversellRefund(
  p: Paid,
  order: { id: number; number: string },
  refundAmount: number,
  tx: TxContext,
): Promise<void> {
  await enqueueEmail({
    template: "oversell-refund",
    to: p.attendees[0]?.email ?? "",
    locale: p.meta.locale,
    idempotencyKey: `oversell-refund-${order.id}`,
    data: {
      orderNumber: order.number,
      courseTitle: courseTitle(p),
      sessionStartsAt: p.sessionView?.startsAt ?? new Date().toISOString(),
      quantity: p.quantity,
      refundAmount,
      currency: "cad",
    },
    tx,
  })
}
