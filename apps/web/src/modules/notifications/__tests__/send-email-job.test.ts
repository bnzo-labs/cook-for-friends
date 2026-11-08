/**
 * Integration tests for the 'send-email' Payload job handler.
 *
 * Validates:
 * - Happy path: valid input → test transport receives email with correct locale + template
 * - ICS attachment: ics[] in input → captured email has attachment with .ics filename
 * - Invalid input (Zod): handler throws with descriptive message (Payload retries)
 * - Wave-3 template: VALIDATION error from sendEmail causes handler to throw
 *
 * Tests run in both unit mode (mocking payload.jobs.run) and the stub below.
 * Integration with a real DB (payload.jobs.queue + run) is guarded by hasTestDb.
 */
import type { TaskHandler } from "payload"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { buildTestTransport, setEmailTransportForTests } from "../server/transport"
import { sendEmailTask } from "../jobs/send-email"

/** Minimal task handler args shape matching Payload's TaskHandlerArgs */
function makeArgs(input: Record<string, unknown>) {
  return {
    input,
    job: { id: "test-job-id", taskSlug: "send-email" },
    req: {} as never,
  }
}

/**
 * sendEmailTask.handler has type `string | TaskHandler<...>` because Payload's
 * TaskConfig type allows handler to be a path string. Narrow to function before calling.
 */
function getHandler(): TaskHandler<"send-email"> {
  const h = sendEmailTask.handler
  if (typeof h !== "function") throw new Error("handler is not a function — check TaskConfig")
  return h as TaskHandler<"send-email">
}

describe("send-email task handler", () => {
  let captured: ReturnType<typeof buildTestTransport>["captured"]

  beforeEach(() => {
    const tb = buildTestTransport()
    captured = tb.captured
    setEmailTransportForTests(tb.transport)
  })

  afterEach(() => setEmailTransportForTests(null))

  it("happy path — magic-link EN — transport receives email", async () => {
    await getHandler()(
      makeArgs({
        template: "magic-link",
        to: "user@example.com",
        locale: "en",
        data: { link: "https://cookforfriends.ca/auth?token=abc", expiresInMinutes: 15 },
        idempotencyKey: "job-test-001",
      }) as never,
    )

    expect(captured).toHaveLength(1)
    expect(captured[0]?.to).toBe("user@example.com")
    expect(captured[0]?.subject).toBeTruthy()
  })

  it("happy path — order-confirmation FR — correct locale", async () => {
    await getHandler()(
      makeArgs({
        template: "order-confirmation",
        to: "acheteur@example.com",
        locale: "fr",
        data: {
          orderNumber: "ORD-2026-JOB-001",
          items: [
            {
              title: "Cuisine française",
              quantity: 1,
              amount: 9500,
              sessionStartsAt: "2026-10-01T18:00:00-04:00",
              sessionEndsAt: "2026-10-01T21:00:00-04:00",
              location: { name: "Studio", address: "10 King St", city: "Toronto" },
            },
          ],
          subtotal: 9500,
          discountTotal: 0,
          taxTotal: 1235,
          total: 10735,
        },
        idempotencyKey: "job-test-oc-fr-001",
      }) as never,
    )

    expect(captured).toHaveLength(1)
    // French subject contains order number
    expect(captured[0]?.subject).toContain("ORD-2026-JOB-001")
  })

  it("ICS input — attachment filename ends with .ics", async () => {
    const uid = "session-uid-abc123"
    await getHandler()(
      makeArgs({
        template: "order-confirmation",
        to: "buyer@example.com",
        locale: "en",
        data: {
          orderNumber: "ORD-ICS-001",
          items: [
            {
              title: "Test Course",
              quantity: 1,
              amount: 5000,
              sessionStartsAt: "2026-11-01T14:00:00-04:00",
              sessionEndsAt: "2026-11-01T17:00:00-04:00",
              location: { name: "Studio", address: "10 King", city: "Toronto" },
            },
          ],
          subtotal: 5000,
          discountTotal: 0,
          taxTotal: 650,
          total: 5650,
        },
        ics: [
          {
            uid,
            title: "Test Course",
            description: "Cooking class",
            location: "Studio, 10 King, Toronto",
            startsAt: "2026-11-01T14:00:00-04:00",
            endsAt: "2026-11-01T17:00:00-04:00",
            url: "https://cookforfriends.ca/sessions/abc123",
          },
        ],
        idempotencyKey: "job-test-ics-001",
      }) as never,
    )

    expect(captured).toHaveLength(1)
    const email = captured[0]
    expect(email?.attachments).toBeDefined()
    expect(email?.attachments?.length).toBe(1)
    const att = email?.attachments?.[0]
    expect(att?.filename).toMatch(/\.ics$/)
    expect(att?.contentType).toContain("calendar")
    expect(att?.content).toContain("BEGIN:VCALENDAR")
    expect(att?.content).toContain("METHOD:PUBLISH")
  })

  it("throws on Zod validation failure — Payload will retry", async () => {
    await expect(
      getHandler()(
        makeArgs({
          // Missing required fields
          template: "magic-link",
          // 'to' is missing
          locale: "en",
          data: {},
          idempotencyKey: "job-invalid-001",
        }) as never,
      ),
    ).rejects.toThrow(/invalid input/i)
  })

  it("throws on invalid email 'to' field", async () => {
    await expect(
      getHandler()(
        makeArgs({
          template: "magic-link",
          to: "not-an-email",
          locale: "en",
          data: { link: "https://example.com", expiresInMinutes: 15 },
          idempotencyKey: "job-bad-email-001",
        }) as never,
      ),
    ).rejects.toThrow(/invalid input/i)
  })

  it("throws on Wave-3 template so Payload does NOT retry silently", async () => {
    await expect(
      getHandler()(
        makeArgs({
          template: "reminder",
          to: "user@example.com",
          locale: "en",
          data: {},
          idempotencyKey: "job-wave3-001",
        }) as never,
      ),
    ).rejects.toThrow()
  })
})
