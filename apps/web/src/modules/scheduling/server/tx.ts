import type { SQL } from "@payloadcms/db-postgres/drizzle"
import type { PayloadRequest } from "payload"

import type { TxContext } from "@/modules/_shared"

import { getPayload } from "./payload"

export type SqlExecutor = {
  execute: <T extends Record<string, unknown> = Record<string, unknown>>(query: SQL) => Promise<{ rows: T[] }>
}

type DrizzleAdapter = {
  sessions: Record<string, { db: unknown } | undefined>
  beginTransaction: (options?: Record<string, unknown>) => Promise<string | number | null>
  commitTransaction: (id: string | number) => Promise<void>
  rollbackTransaction: (id: string | number) => Promise<void>
}

/**
 * One Payload transaction (READ COMMITTED). Raw SQL (`db`) and Local API calls
 * given `tx.req` share it; commit on return, rollback on throw. Queued email
 * jobs enqueued with `tx` roll back with it (CONTRACT §6).
 */
export async function withTransaction<T>(fn: (scope: { db: SqlExecutor; tx: TxContext }) => Promise<T>): Promise<T> {
  const payload = await getPayload()
  const adapter = payload.db as unknown as DrizzleAdapter
  const id = await adapter.beginTransaction({ isolationLevel: "read committed" })
  if (id === null || id === undefined) throw new Error("[scheduling] database adapter has no transactions")
  const session = adapter.sessions[String(id)]
  if (!session) throw new Error("[scheduling] transaction session missing")
  const req = { payload, transactionID: id, context: {} } as unknown as PayloadRequest
  try {
    const result = await fn({ db: session.db as SqlExecutor, tx: { req } })
    await adapter.commitTransaction(id)
    return result
  } catch (error) {
    try {
      await adapter.rollbackTransaction(id)
    } catch (rollbackError) {
      console.error("[scheduling] rollback failed", rollbackError)
    }
    throw error
  }
}
