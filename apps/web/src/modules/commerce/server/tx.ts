import type { SQL } from "@payloadcms/db-postgres/drizzle"
import type { Payload, PayloadRequest } from "payload"

import type { TxContext } from "@/modules/_shared"

import { getPayload } from "./payload"

/** Minimal raw-SQL surface shared by the root Drizzle client and a transaction. */
export type SqlExecutor = {
  execute: <T extends Record<string, unknown> = Record<string, unknown>>(query: SQL) => Promise<{ rows: T[] }>
}

type DrizzleAdapter = {
  drizzle: unknown
  sessions: Record<string, { db: unknown } | undefined>
  beginTransaction: (options?: Record<string, unknown>) => Promise<string | number | null>
  commitTransaction: (id: string | number) => Promise<void>
  rollbackTransaction: (id: string | number) => Promise<void>
}

const adapterOf = (payload: Payload) => payload.db as unknown as DrizzleAdapter

/** Root client, or the Drizzle transaction bound to `tx.req` (CONTRACT §4 `TxContext`). */
export async function executorFor(tx?: TxContext): Promise<SqlExecutor> {
  const payload = tx?.req.payload ?? (await getPayload())
  const adapter = adapterOf(payload)
  const id = tx?.req.transactionID ? await tx.req.transactionID : null
  const session = id ? adapter.sessions[String(id)] : undefined
  return (session?.db ?? adapter.drizzle) as SqlExecutor
}

export type TxScope = { db: SqlExecutor; tx: TxContext }

/**
 * Run `fn` in one Payload transaction (READ COMMITTED, explicit: every statement
 * after a `FOR UPDATE` wait must see rows committed by the previous lock holder).
 * Raw SQL (`db`) and Local API calls passed `tx.req` share it. Commit on return,
 * rollback on throw.
 */
export async function withTransaction<T>(fn: (scope: TxScope) => Promise<T>): Promise<T> {
  const payload = await getPayload()
  const adapter = adapterOf(payload)
  const id = await adapter.beginTransaction({ isolationLevel: "read committed" })
  if (id === null || id === undefined) throw new Error("[commerce] database adapter has no transactions")
  const session = adapter.sessions[String(id)]
  if (!session) throw new Error("[commerce] transaction session missing")

  const req = { payload, transactionID: id, context: {} } as unknown as PayloadRequest
  try {
    const result = await fn({ db: session.db as SqlExecutor, tx: { req } })
    await adapter.commitTransaction(id)
    return result
  } catch (error) {
    try {
      await adapter.rollbackTransaction(id)
    } catch (rollbackError) {
      console.error("[commerce] rollback failed", rollbackError)
    }
    throw error
  }
}
