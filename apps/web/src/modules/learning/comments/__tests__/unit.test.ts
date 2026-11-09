import { describe, expect, it } from "vitest"

import { authorDisplay } from "../server/display"
import { lessonUrl } from "../server/moderation"
import { postCommentSchema } from "../validators"

describe("authorDisplay (Q14)", () => {
  it("first name + last initial, upper-cased", () => {
    expect(authorDisplay("Marie", "dubois", "fr")).toBe("Marie D.")
    expect(authorDisplay("  Marie ", " Émond", "en")).toBe("Marie É.")
  })
  it("first name only", () => expect(authorDisplay("Marie", null, "fr")).toBe("Marie"))
  it("no name → localized fallback, never an email", () => {
    expect(authorDisplay(null, "Dubois", "fr")).toBe("Participant·e")
    expect(authorDisplay("", undefined, "en")).toBe("Participant")
    expect(authorDisplay("   ", "x", "en")).toBe("Participant")
  })
})

describe("postCommentSchema", () => {
  const ok = { lessonId: 3, body: "Super leçon" }
  it("trims and accepts 1..2000 chars", () => {
    expect(postCommentSchema.parse({ ...ok, body: "  hi  " }).body).toBe("hi")
    expect(postCommentSchema.safeParse({ ...ok, body: "a".repeat(2000) }).success).toBe(true)
  })
  it("rejects empty, whitespace-only and > 2000", () => {
    expect(postCommentSchema.safeParse({ ...ok, body: "" }).success).toBe(false)
    expect(postCommentSchema.safeParse({ ...ok, body: "   " }).success).toBe(false)
    expect(postCommentSchema.safeParse({ ...ok, body: "a".repeat(2001) }).success).toBe(false)
  })
  it("rejects bad ids and non-strings", () => {
    expect(postCommentSchema.safeParse({ ...ok, lessonId: "abc" }).success).toBe(false)
    expect(postCommentSchema.safeParse({ ...ok, lessonId: -1 }).success).toBe(false)
    expect(postCommentSchema.safeParse({ ...ok, body: 5 }).success).toBe(false)
    expect(postCommentSchema.safeParse({ ...ok, parentId: "x" }).success).toBe(false)
    expect(postCommentSchema.safeParse({ ...ok, parentId: "12" }).success).toBe(true)
  })
  it("does not transform HTML", () => {
    const body = "<img src=x onerror=alert(1)>"
    expect(postCommentSchema.parse({ ...ok, body }).body).toBe(body)
  })
})

describe("lessonUrl", () => {
  it("is absolute and localized", () => {
    expect(new URL(lessonUrl("fr", "pates", 7)).pathname).toBe("/fr/compte/cours/pates/7")
    expect(new URL(lessonUrl("en", "pasta", 7)).pathname).toBe("/en/account/courses/pasta/7")
  })
})
