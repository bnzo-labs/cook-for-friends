import { getTranslations } from "next-intl/server"

import { Badge } from "@/components/ui/badge"
import { formatMoney } from "@/lib/storefront/format"
import type { OrderSummary } from "@/modules/commerce"
import type { Locale } from "@/modules/_shared"

import { formatOrderDate } from "./format"

const STATUS_VARIANT = {
  paid: "ok",
  refunded: "neutral",
  partially_refunded: "low",
  cancelled: "danger",
  pending: "outline",
} as const

export interface OrdersTableProps {
  orders: OrderSummary[]
  locale: Locale
}

/** Receipts: real table on wide screens; each row stays a table row (scrolls inside its wrapper at 320). */
export async function OrdersTable({ orders, locale }: OrdersTableProps) {
  const t = await getTranslations({ locale, namespace: "portal.receipts" })
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface shadow-card" tabIndex={0} role="region" aria-label={t("title")}>
      <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-fg-muted">
            <th scope="col" className="px-4 py-3 font-medium">{t("col_number")}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t("col_date")}</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">{t("col_total")}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t("col_status")}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t("col_receipt")}</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={String(order.id)} data-order-row data-order-number={order.number} className="border-b border-border last:border-b-0">
              <th scope="row" className="px-4 py-3 font-mono text-sm font-medium text-fg">{order.number}</th>
              <td className="px-4 py-3 text-fg">
                {order.paidAt ? <time dateTime={order.paidAt}>{formatOrderDate(order.paidAt, locale)}</time> : t("no_date")}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-fg">{formatMoney(order.total, locale)}</td>
              <td className="px-4 py-3">
                <Badge variant={STATUS_VARIANT[order.status]}>{t(`status.${order.status}`)}</Badge>
              </td>
              <td className="px-4 py-3">
                {order.hasReceipt ? (
                  <a
                    href={`/api/orders/${encodeURIComponent(String(order.id))}/receipt`}
                    aria-label={t("download_aria", { number: order.number })}
                    data-receipt-link
                    className="rounded-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    {t("download")}
                  </a>
                ) : (
                  <span className="text-fg-muted" data-receipt-pending>{t("preparing")}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
