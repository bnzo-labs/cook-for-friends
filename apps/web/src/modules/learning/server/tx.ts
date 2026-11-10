import type { Payload, PayloadRequest } from "payload"

import type { TxContext } from "@/modules/_shared"

import { getPayload } from "./payload"

type DrizzleAdapter = {
  sessions: Record<string, unknown>
  beginTransaction: (options?: Record<string, unknown>) => Promise<string | number | null>
  commitTransaction: (id: string | number) => Promise<void>
  rollbackTransaction: (id: string | number) => Promise<void>
}

/** One Payload transaction. Commit on return, rollback on throw. */
export async function withTransaction<T>(fn: (tx: TxContext) => Promise<T>): Promise<T> {
  const payload: Payload = await getPayload()
  const adapter = payload.db as unknown as DrizzleAdapter
  const id = await adapter.beginTransaction({ isolationLevel: "read committed" })
  if (id === null || id === undefined) throw new Error("[learning] database adapter has no transactions")
  const req = { payload, transactionID: id, context: {} } as unknown as PayloadRequest
  try {
    const result = await fn({ req })
    await adapter.commitTransaction(id)
    return result
  } catch (error) {
    try {
      await adapter.rollbackTransaction(id)
    } catch (rollbackError) {
      console.error("[learning] rollback failed", rollbackError)
    }
    throw error
  }
}
