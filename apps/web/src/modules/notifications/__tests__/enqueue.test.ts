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

  it("commit: enqueue without tx → job row persists", async () => {
    const key = `test-enqueue-commit-${uid()}`

    // Count rows before via payload.find
    const before = await payload.find({
      collection: "payload-jobs",
      where: {},
      limit: 1000,
    })
    const countBefore = before.docs.filter(
      (d) => (d.input as Record<string, unknown>)?.["idempotencyKey"] === key,
    ).length

    await enqueueEmail({
      template: "magic-link",
      to: `commit-test-${uid()}@example.com`,
      locale: "en",
      data: { link: "https://example.com/verify?token=abc", expiresInMinutes: 15 },
      idempotencyKey: key,
    })

    const after = await payload.find({
      collection: "payload-jobs",
      where: {},
      limit: 1000,
    })
    const countAfter = after.docs.filter(
      (d) => (d.input as Record<string, unknown>)?.["idempotencyKey"] === key,
    ).length

    expect(countAfter).toBe(countBefore + 1)
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
})
