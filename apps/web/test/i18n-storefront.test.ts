/**
 * Regression guard: for every message under storefront.* in en.json + fr.json,
 * verify that the set of ICU placeholders ({variable}) matches between EN and FR.
 *
 * Also verifies that EN and FR have the same keys under storefront.*.
 *
 * No DB, no network — pure static analysis.
 */
import { describe, it, expect } from "vitest"
import en from "../src/i18n/messages/en.json"
import fr from "../src/i18n/messages/fr.json"

type MessageTree = Record<string, unknown>

/** Extract all `{placeholder}` tokens from a message string. */
function extractPlaceholders(message: string): Set<string> {
  const tokens = message.match(/\{[^}]+\}/g) ?? []
  return new Set(tokens)
}

/** Flatten a nested object into a Map of dot-separated keys → string values. */
function flattenMessages(obj: MessageTree, prefix = ""): Map<string, string> {
  const result = new Map<string, string>()
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof value === "string") {
      result.set(fullKey, value)
    } else if (value !== null && typeof value === "object") {
      for (const [k, v] of flattenMessages(value as MessageTree, fullKey)) {
        result.set(k, v)
      }
    }
  }
  return result
}

const enStorefront = (en as MessageTree).storefront as MessageTree
const frStorefront = (fr as MessageTree).storefront as MessageTree

const enMessages = flattenMessages(enStorefront)
const frMessages = flattenMessages(frStorefront)

describe("storefront i18n — key parity", () => {
  it("FR has every key that EN has", () => {
    const missing: string[] = []
    for (const key of enMessages.keys()) {
      if (!frMessages.has(key)) missing.push(key)
    }
    expect(missing, `FR missing keys:\n${missing.join("\n")}`).toHaveLength(0)
  })

  it("EN has every key that FR has", () => {
    const missing: string[] = []
    for (const key of frMessages.keys()) {
      if (!enMessages.has(key)) missing.push(key)
    }
    expect(missing, `EN missing keys:\n${missing.join("\n")}`).toHaveLength(0)
  })
})

describe("storefront i18n — ICU placeholder parity", () => {
  it("EN and FR placeholders match for every storefront key", () => {
    const mismatches: string[] = []

    for (const [key, enValue] of enMessages) {
      const frValue = frMessages.get(key)
      if (!frValue) continue // caught by key-parity test

      const enPlaceholders = extractPlaceholders(enValue)
      const frPlaceholders = extractPlaceholders(frValue)

      const missingInFr = [...enPlaceholders].filter((p) => !frPlaceholders.has(p))
      const extraInFr = [...frPlaceholders].filter((p) => !enPlaceholders.has(p))

      if (missingInFr.length > 0 || extraInFr.length > 0) {
        mismatches.push(
          `Key "${key}":\n` +
            `  EN: "${enValue}"\n` +
            `  FR: "${frValue}"\n` +
            (missingInFr.length ? `  FR missing: ${missingInFr.join(", ")}\n` : "") +
            (extraInFr.length ? `  FR extra:   ${extraInFr.join(", ")}\n` : ""),
        )
      }
    }

    expect(mismatches, `\nPlaceholder mismatches:\n\n${mismatches.join("\n")}`).toHaveLength(0)
  })
})
