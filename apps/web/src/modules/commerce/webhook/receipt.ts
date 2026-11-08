import type { Result } from "@/modules/_shared"
import { getCurrentCustomer, isStaff } from "@/modules/identity"

import { getPayload } from "../server/payload"
import { findOrderById } from "./orders"
import { relId } from "./shared"

const notFound = (): Result<never> => ({ ok: false, error: { code: "NOT_FOUND", entity: "order" } })

async function viewer(headers: Headers): Promise<{ customerId: number | null; staff: boolean }> {
  const customer = await getCurrentCustomer(headers)
  if (customer) return { customerId: Number(customer.id), staff: false }
  const payload = await getPayload()
  const { user } = await payload.auth({ headers })
  return { customerId: null, staff: isStaff(user) }
}

/**
 * `GET /api/orders/:id/receipt` (CONTRACT §5.1): owner customer or staff →
 * Stripe invoice PDF URL. Anonymous → NOT_FOUND (no existence leak); other
 * customer → FORBIDDEN; no order / no invoice yet → NOT_FOUND.
 */
export async function getOrderReceiptUrl(rawId: string, headers: Headers): Promise<Result<{ url: string }>> {
  if (!/^\d{1,12}$/.test(rawId)) return notFound()
  const who = await viewer(headers)
  if (who.customerId === null && !who.staff) return notFound()

  const order = await findOrderById(await getPayload(), Number(rawId))
  if (!order) return notFound()
  if (!who.staff && relId(order.customer) !== who.customerId) return { ok: false, error: { code: "FORBIDDEN" } }
  if (!order.invoicePdfUrl) return notFound()
  return { ok: true, data: { url: order.invoicePdfUrl } }
}
