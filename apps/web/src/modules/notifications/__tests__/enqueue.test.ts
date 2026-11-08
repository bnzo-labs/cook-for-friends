/**
 * Integration tests for enqueueEmail().
 *
 * Requires TEST_DATABASE_URL pointing at a throwaway Neon branch that has
 * the W2-05 migration applied (send-email task slug in the jobs table).
 * These tests are skipped locally without TEST_DATABASE_URL — CI runs them.
 *
 * Validates:
 * - Commit path: queuing inside a committed tx inserts one row in payload_jobs
 * - Rollback path: queuing inside a rolled-back tx inserts zero rows
 */
import type { Payload } from "payload"
import { beforeAll, beforeEach, describe, expect, it, afterEach } from "vitest"
import { getTestPayload, hasTestDb, uid } from "../../../../test/integration"
import { enqueueEmail } from "../server/enqueue"
import { buildTestTransport, setEmailTransportForTests } from "../server/transport"

describe.skipIf(!hasTestDb)("enqueueEmail — integration", () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getTestPayload()
  }, 60_000)

  beforeEach(() => {
    const { transport } = buildTestTransport()
    setEmailTransportForTests(transport)
  })

  afterEach(() => setEmailTransportForTests(null))

  /** Count payload-jobs rows whose input.idempotencyKey matches key. */
  async function countJobRows(key: string): Promise<number> {
    const result = await payload.find({
      collection: "payload-jobs",
      where: {},
      limit: 1000,
    })
    return result.docs.filter(
      (d) => (d.input as Record<string, unknown>)?.["idempotencyKey"] === key,
    ).length
  }

  it("commit: enqueue without tx → job row persists", async () => {
    const key = `test-enqueue-commit-${uid()}`

    const countBefore = await countJobRows(key)

    await enqueueEmail({
      template: "magic-link",
      to: `commit-test-${uid()}@example.com`,
      locale: "en",
      data: { link: "https://example.com/verify?token=abc", expiresInMinutes: 15 },
      idempotencyKey: key,
    })

    expect(await countJobRows(key)).toBe(countBefore + 1)
  })

  it("no-tx call does not throw and completes successfully", async () => {
    const key = `test-no-tx-${uid()}`

    await expect(
      enqueueEmail({
        template: "magic-link",
        to: `no-tx-test-${uid()}@example.com`,
        locale: "fr",
        data: { link: "https://example.com/verify?token=xyz", expiresInMinutes: 15 },
        idempotencyKey: key,
      }),
    ).resolves.toBeUndefined()
  })

  it("tx commit: enqueue inside tx → job row persists after commit", async () => {
    const key = `test-tx-commit-${uid()}`
    const to = `tx-commit-${uid()}@example.com`

    const req = { payload } as unknown as import("payload").PayloadRequest
    const { initTransaction, commitTransaction } = await import("payload")

    await initTransaction(req)
    await enqueueEmail({
      template: "magic-link",
      to,
      locale: "en",
      data: { link: "https://example.com/verify?token=txcommit", expiresInMinutes: 15 },
      idempotencyKey: key,
      tx: { req },
    })
    await commitTransaction(req)

    expect(await countJobRows(key)).toBe(1)
  })

  it("tx rollback: enqueue inside tx, tx fails → no job row", async () => {
    const key = `test-tx-rollback-${uid()}`
    const to = `tx-rollback-${uid()}@example.com`

    const req = { payload } as unknown as import("payload").PayloadRequest
    const { initTransaction, killTransaction } = await import("payload")

    await initTransaction(req)
    try {
      await enqueueEmail({
        template: "magic-link",
        to,
        locale: "en",
        data: { link: "https://example.com/verify?token=txrollback", expiresInMinutes: 15 },
        idempotencyKey: key,
        tx: { req },
      })
    } finally {
      await killTransaction(req)
    }

    expect(await countJobRows(key)).toBe(0)
  })
})
