import type { Payload } from "payload"

import type { ID } from "@/modules/_shared"

import type { AttendeeRow } from "./types"
import { getPayload } from "../server/payload"

type Rel<T> = T | number | string | null | undefined

type CustomerDoc = {
  id: number | string
  email?: string | null
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  dietaryNotes?: string | null
}

type OrderDoc = {
  id: number | string
  number?: string | null
  email?: string | null
  paidAt?: string | null
  customer?: Rel<CustomerDoc>
}

type EnrollmentDoc = {
  id: number | string
  attendeeIndex?: number | null
  attendeeName?: string | null
  status: AttendeeRow["enrollmentStatus"]
  attendance: AttendeeRow["attendance"]
  createdAt: string
  customer?: Rel<CustomerDoc>
  order?: Rel<OrderDoc>
}

/** Attendee row plus the order's seat count (CSV `Place n/N`). Internal. */
export type AttendeeEntry = { row: AttendeeRow; seatCount: number }

const isDoc = <T extends object>(v: Rel<T>): v is T => typeof v === "object" && v !== null

const clean = (v: string | null | undefined): string => (v ?? "").trim()

/** Split a free-text name at the first whitespace: "Marie Ève Tremblay" → first "Marie", last "Ève Tremblay". */
export function splitName(full: string): { firstName: string; lastName: string } {
  const t = full.trim().replace(/\s+/g, " ")
  const i = t.indexOf(" ")
  return i === -1 ? { firstName: t, lastName: "" } : { firstName: t.slice(0, i), lastName: t.slice(i + 1) }
}

const collator = new Intl.Collator("fr-CA", { sensitivity: "base", numeric: true })

function toEntry(e: EnrollmentDoc, seatCount: number): AttendeeEntry {
  const customer = isDoc(e.customer) ? e.customer : undefined
  const order = isDoc(e.order) ? e.order : undefined
  const buyer = order && isDoc(order.customer) ? order.customer : undefined
  const attendeeIndex = e.attendeeIndex ?? 0

  const entered = clean(e.attendeeName)
  const name = entered
    ? splitName(entered)
    : { firstName: clean(customer?.firstName), lastName: clean(customer?.lastName) }

  const bookedByName = [clean(buyer?.firstName), clean(buyer?.lastName)].filter(Boolean).join(" ")
  const phone = clean(customer?.phone)
  const dietaryNotes = clean(customer?.dietaryNotes)

  const row: AttendeeRow = {
    enrollmentId: e.id,
    attendeeIndex,
    isBuyer: attendeeIndex === 0,
    firstName: name.firstName,
    lastName: name.lastName,
    email: clean(customer?.email),
    ...(phone ? { phone } : {}),
    ...(dietaryNotes ? { dietaryNotes } : {}),
    bookedBy: { name: bookedByName, email: clean(buyer?.email) || clean(order?.email) },
    orderNumber: clean(order?.number),
    enrollmentStatus: e.status,
    attendance: e.attendance,
    paidAt: order?.paidAt || e.createdAt,
  }
  return { row, seatCount }
}

/** One entry per enrollment (seat), sorted last name then first name. All statuses. */
export async function collectAttendees(sessionId: ID, payload?: Payload): Promise<AttendeeEntry[]> {
  const p = payload ?? (await getPayload())
  const { docs } = await p.find({
    collection: "enrollments",
    where: { session: { equals: sessionId } },
    depth: 2,
    pagination: false,
    overrideAccess: true,
  })
  const enrollments = docs as unknown as EnrollmentDoc[]

  const perOrder = new Map<string, number>()
  for (const e of enrollments) {
    const key = String(isDoc(e.order) ? e.order.id : e.order)
    perOrder.set(key, (perOrder.get(key) ?? 0) + 1)
  }

  return enrollments
    .map((e) => toEntry(e, perOrder.get(String(isDoc(e.order) ? e.order.id : e.order)) ?? 1))
    .sort(
      (a, b) =>
        collator.compare(a.row.lastName, b.row.lastName) ||
        collator.compare(a.row.firstName, b.row.firstName) ||
        a.row.attendeeIndex - b.row.attendeeIndex,
    )
}

/** CONTRACT §4 `commerce.listAttendees`. Read-only; no writes outside commerce. */
export async function listAttendees(sessionId: ID): Promise<AttendeeRow[]> {
  return (await collectAttendees(sessionId)).map((x) => x.row)
}
