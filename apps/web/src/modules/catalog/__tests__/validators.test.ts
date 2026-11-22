import { describe, expect, it, vi } from "vitest"

import { formatCents } from "../admin/MoneyCell"
import { enqueueSessionCancel, validateEndsAfterStart } from "../collections/sessions"
import { MAX_CENTS, moneyField, validateCents, validateInteger } from "../fields/money"
import { validateTiers } from "../globals/cancellation-policy"
import { validateReminderOffsets } from "../globals/site-settings"

describe("catalog validators", () => {
  it("validateCents accepts integers ≥ 0 only", () => {
    expect(validateCents(0)).toBe(true)
    expect(validateCents(4500)).toBe(true)
    expect(validateCents(null)).toBe(true)
    expect(validateCents(undefined)).toBe(true)
    expect(validateCents(10.5)).toBeTypeOf("string")
    expect(validateCents(-1)).toBeTypeOf("string")
    expect(validateCents("100")).toBeTypeOf("string")
  })

  // C-1 (W4-03c): cents max enforcement (dollars max was dead code — mirror strips virtual field)
  it("validateCents rejects values above MAX_CENTS ($100k)", () => {
    expect(validateCents(MAX_CENTS)).toBe(true)         // exact cap is valid
    expect(validateCents(MAX_CENTS + 1)).toBeTypeOf("string") // one cent over → error
    expect(validateCents(99_999_999)).toBeTypeOf("string")    // Stripe max+1 → error
    expect(validateCents(0)).toBe(true)
    expect(validateCents(1999)).toBe(true)
  })

  it("validateInteger enforces min", () => {
    const v = validateInteger(1)
    expect(v(1)).toBe(true)
    expect(v(undefined)).toBe(true)
    expect(v(0)).toBeTypeOf("string")
    expect(v(1.2)).toBeTypeOf("string")
  })

  it("moneyField is an integer cents number field with a $ cell", () => {
    const f = moneyField({ name: "price", required: true })
    expect(f.type).toBe("number")
    expect(f.min).toBe(0)
    expect(f.admin?.components?.Cell).toBe("/modules/catalog/admin/MoneyCell#MoneyCell")
    expect(typeof f.validate).toBe("function")
  })

  it("formatCents renders CAD", () => {
    expect(formatCents(4500, "en-CA")).toBe("$45.00")
    expect(formatCents("x")).toBe("—")
  })

  it("validateTiers requires strictly descending hours", () => {
    expect(validateTiers(undefined)).toBe(true)
    expect(validateTiers([{ minHoursBefore: 72 }, { minHoursBefore: 24 }, { minHoursBefore: 0 }])).toBe(true)
    expect(validateTiers([{ minHoursBefore: 24 }, { minHoursBefore: 72 }])).toBeTypeOf("string")
    expect(validateTiers([{ minHoursBefore: 24 }, { minHoursBefore: 24 }])).toBeTypeOf("string")
    expect(validateTiers([{ minHoursBefore: undefined }])).toBe(true)
    expect(validateTiers("x")).toBeTypeOf("string")
  })

  it("validateReminderOffsets requires positive integers", () => {
    expect(validateReminderOffsets([48, 24])).toBe(true)
    expect(validateReminderOffsets(null)).toBe(true)
    expect(validateReminderOffsets([0])).toBeTypeOf("string")
    expect(validateReminderOffsets([1.5])).toBeTypeOf("string")
    expect(validateReminderOffsets(5)).toBeTypeOf("string")
  })

  it("validateEndsAfterStart", () => {
    const startsAt = "2026-11-01T14:00:00.000Z"
    expect(validateEndsAfterStart("2026-11-01T17:00:00.000Z", { siblingData: { startsAt } })).toBe(true)
    expect(validateEndsAfterStart("2026-11-01T13:00:00.000Z", { siblingData: { startsAt } })).toBeTypeOf("string")
    expect(validateEndsAfterStart(undefined, { siblingData: { startsAt } })).toBe(true)
  })

  // A-1 (W4-03c): session-cancel hook only queues on the transition into cancelled
  describe("enqueueSessionCancel — transition guard (A-1)", () => {
    type FakeReq = { payload: { jobs: { queue: ReturnType<typeof vi.fn> }; logger: { warn: ReturnType<typeof vi.fn> } }; user: unknown }

    function makeReq(user: unknown = { id: 1, collection: "users", role: "staff" }): FakeReq {
      return {
        payload: { jobs: { queue: vi.fn().mockResolvedValue(undefined) }, logger: { warn: vi.fn() } },
        user,
      }
    }

    function makeDoc(status: string) {
      return { id: 42, status }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type HookArgs = any

    it("queues the job when status transitions to cancelled (previousDoc.status !== cancelled)", async () => {
      const req = makeReq()
      await enqueueSessionCancel({
        doc: makeDoc("cancelled"),
        previousDoc: makeDoc("scheduled"),
        operation: "update",
        req: req as HookArgs,
        collection: {} as HookArgs,
        context: {} as HookArgs,
        data: {} as HookArgs,
      })
      expect(req.payload.jobs.queue).toHaveBeenCalledOnce()
    })

    it("re-queues the job when re-saving an already-cancelled session (idempotent resume)", async () => {
      const req = makeReq()
      await enqueueSessionCancel({
        doc: makeDoc("cancelled"),
        previousDoc: makeDoc("cancelled"),
        operation: "update",
        req: req as HookArgs,
        collection: {} as HookArgs,
        context: {} as HookArgs,
        data: {} as HookArgs,
      })
      // Re-saving while already cancelled must re-queue (resume path in case first run failed).
      // The job task itself is idempotent via per-seat advisory lock + idempotency key.
      expect(req.payload.jobs.queue).toHaveBeenCalledOnce()
    })

    it("skips when operation is not update", async () => {
      const req = makeReq()
      await enqueueSessionCancel({
        doc: makeDoc("cancelled"),
        previousDoc: makeDoc("scheduled"),
        operation: "create",
        req: req as HookArgs,
        collection: {} as HookArgs,
        context: {} as HookArgs,
        data: {} as HookArgs,
      })
      expect(req.payload.jobs.queue).not.toHaveBeenCalled()
    })

    it("skips when doc.status is not cancelled", async () => {
      const req = makeReq()
      await enqueueSessionCancel({
        doc: makeDoc("scheduled"),
        previousDoc: makeDoc("scheduled"),
        operation: "update",
        req: req as HookArgs,
        collection: {} as HookArgs,
        context: {} as HookArgs,
        data: {} as HookArgs,
      })
      expect(req.payload.jobs.queue).not.toHaveBeenCalled()
    })
  })
})
