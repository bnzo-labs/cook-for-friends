/**
 * notifications/server/enqueue.ts
 *
 * enqueueEmail — queue a 'send-email' job within the caller's Payload transaction.
 * If the transaction rolls back, the queued job row disappears too (CONTRACT §6 step 3).
 *
 * CONTRACT §4 (CCR-W2-3):
 *   enqueueEmail<T extends EmailTemplate>(i: { template, to, locale, data, idempotencyKey, ics?, tx? }): Promise<void>
 */
import type { Locale, TxContext } from "@/modules/_shared"
import type { EmailTemplate, EmailData, IcsInput } from "../types"
import { getPayload } from "@/lib/payload"

export async function enqueueEmail<T extends EmailTemplate>(i: {
  template: T
  to: string
  locale: Locale
  data: EmailData[T]
  idempotencyKey: string
  ics?: IcsInput[]
  tx?: TxContext
}): Promise<void> {
  const payload = await getPayload()

  // jobs.tasks is 'unknown' in payload-types.ts until migration + regen; cast avoids a TS2322
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (payload.jobs.queue as any)({
    task: "send-email",
    input: {
      template: i.template,
      to: i.to,
      locale: i.locale,
      // JSON-serializable — cast to unknown to satisfy Payload's generic input type
      data: i.data as unknown as Record<string, unknown>,
      idempotencyKey: i.idempotencyKey,
      ...(i.ics ? { ics: i.ics } : {}),
    },
    // req joins the queued row to the caller's transaction; if it rolls back, the job is never persisted
    req: i.tx?.req,
  })
}
