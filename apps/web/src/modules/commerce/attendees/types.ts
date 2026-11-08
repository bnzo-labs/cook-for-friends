import type { ID, ISODate } from "@/modules/_shared"

/** CONTRACT §4 (CCR-W2-6). One row per enrollment (seat). */
export type AttendeeRow = {
  enrollmentId: ID
  attendeeIndex: number
  isBuyer: boolean
  firstName: string
  lastName: string
  email: string
  phone?: string
  dietaryNotes?: string
  bookedBy: { name: string; email: string }
  orderNumber: string
  enrollmentStatus: "confirmed" | "cancelled" | "refunded"
  attendance: "unknown" | "present" | "absent"
  paidAt: ISODate
}
