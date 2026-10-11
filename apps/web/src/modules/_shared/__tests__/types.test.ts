import { describe, it, expect } from "vitest"
import type { Result, ModuleError } from "../types"

/**
 * Sample unit test for shared types.
 * Proves the Result<T> discriminated union works correctly.
 */
describe("Result<T>", () => {
  it("narrows to ok branch when ok is true", () => {
    const result: Result<number> = { ok: true, data: 42 }

    if (result.ok) {
      expect(result.data).toBe(42)
    } else {
      throw new Error("Should not reach error branch")
    }
  })

  it("narrows to error branch when ok is false", () => {
    const error: ModuleError = { code: "NOT_FOUND", entity: "course" }
    const result: Result<number> = { ok: false, error }

    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND")
    } else {
      throw new Error("Should not reach ok branch")
    }
  })

  it("SOLD_OUT error carries sessionId", () => {
    const err: ModuleError = { code: "SOLD_OUT", sessionId: 123 }
    expect(err.code).toBe("SOLD_OUT")
  })
})
