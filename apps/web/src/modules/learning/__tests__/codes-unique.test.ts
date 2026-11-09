import { ValidationError } from "payload"
import { describe, expect, it } from "vitest"

import { VERIFICATION_CODE_RE } from "../collections/certificates"
import { CODE_LENGTH, CROCKFORD, generateVerificationCode, normalizeVerificationCode } from "../server/codes"
import { clampPosition } from "../server/progress"
import { displayName } from "../server/certificates"
import {
  CERT_CODE_UNIQUE_COLS,
  CERT_PAIR_UNIQUE_COLS,
  PROGRESS_UNIQUE_COLS,
  isUniqueConflict,
} from "../server/unique"

describe("verification codes", () => {
  it("generates 10 Crockford chars accepted by the collection validator", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateVerificationCode()
      expect(code).toHaveLength(CODE_LENGTH)
      expect(VERIFICATION_CODE_RE.test(code)).toBe(true)
      for (const ch of code) expect(CROCKFORD).toContain(ch)
    }
  })

  it("is not constant", () => {
    expect(new Set(Array.from({ length: 50 }, generateVerificationCode)).size).toBeGreaterThan(40)
  })

  it.each([
    ["abcdefghjk", "ABCDEFGHJK"],
    ["ABCDE-FGHJK", "ABCDEFGHJK"],
    ["abcde fghjk", "ABCDEFGHJK"],
    [" ab-cd ef-gh jk ", "ABCDEFGHJK"],
    ["OOOOOOOOOO", "0000000000"],
    ["oo0oO00000", "0000000000"],
    ["IIIIIIIIII", "1111111111"],
    ["llllllllll", "1111111111"],
    ["1lI1lI1lI1", "1111111111"],
  ])("normalizes %j → %j", (raw, expected) => {
    expect(normalizeVerificationCode(raw)).toBe(expected)
  })

  it.each(["", "SHORT", "ABCDEFGHJKM", "ABCDEFGHJU", "ABCDEFGH!K"])("rejects %j", (raw) => {
    expect(normalizeVerificationCode(raw)).toBeNull()
  })
})

describe("clampPosition", () => {
  it("clamps to 0..duration, last write wins semantics left to the caller", () => {
    expect(clampPosition(-5, 100)).toBe(0)
    expect(clampPosition(50, 100)).toBe(50)
    expect(clampPosition(500, 100)).toBe(100)
    expect(clampPosition(500, null)).toBe(500)
    expect(clampPosition(500, 0)).toBe(500)
  })
})

describe("displayName", () => {
  it("first + last, falls back to email local part", () => {
    expect(displayName({ firstName: " Ana ", lastName: "Roy", email: "a@x.com" })).toBe("Ana Roy")
    expect(displayName({ firstName: "Ana", lastName: null, email: "a@x.com" })).toBe("Ana")
    expect(displayName({ firstName: null, lastName: null, email: "jean.paul@x.com" })).toBe("jean.paul")
  })
})

describe("isUniqueConflict (column paths, never message text)", () => {
  const wrapped = (path: string | null, message = "Value must be unique") =>
    new ValidationError({ errors: [{ message, path: path as string }] })

  it("matches composite and single column paths", () => {
    expect(isUniqueConflict(wrapped("customer_id, lesson_id"), PROGRESS_UNIQUE_COLS)).toBe(true)
    expect(isUniqueConflict(wrapped("customer_id, course_id"), CERT_PAIR_UNIQUE_COLS)).toBe(true)
    expect(isUniqueConflict(wrapped("verification_code"), CERT_CODE_UNIQUE_COLS)).toBe(true)
    expect(isUniqueConflict(wrapped("verificationCode"), CERT_CODE_UNIQUE_COLS)).toBe(true)
  })

  it("is language independent", () => {
    expect(isUniqueConflict(wrapped("customer_id, lesson_id", "La valeur doit être unique"), PROGRESS_UNIQUE_COLS)).toBe(true)
  })

  it("rejects other paths, empty paths and unrelated errors", () => {
    expect(isUniqueConflict(wrapped("customer_id, course_id"), PROGRESS_UNIQUE_COLS)).toBe(false)
    expect(isUniqueConflict(wrapped("email"), CERT_CODE_UNIQUE_COLS)).toBe(false)
    expect(isUniqueConflict(wrapped(null), PROGRESS_UNIQUE_COLS)).toBe(false)
    expect(isUniqueConflict(new Error("boom"), PROGRESS_UNIQUE_COLS)).toBe(false)
    expect(isUniqueConflict(null, PROGRESS_UNIQUE_COLS)).toBe(false)
    expect(isUniqueConflict(new Error("Value must be unique"), PROGRESS_UNIQUE_COLS)).toBe(false)
  })

  it("matches raw PG 23505 up to two causes deep", () => {
    expect(isUniqueConflict({ code: "23505" }, PROGRESS_UNIQUE_COLS)).toBe(true)
    expect(isUniqueConflict({ cause: { code: "23505" } }, PROGRESS_UNIQUE_COLS)).toBe(true)
    expect(isUniqueConflict({ cause: { cause: { code: "23505" } } }, PROGRESS_UNIQUE_COLS)).toBe(true)
    expect(isUniqueConflict({ code: "23503" }, PROGRESS_UNIQUE_COLS)).toBe(false)
  })
})
