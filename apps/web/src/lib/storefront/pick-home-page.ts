import type { Page } from "@/payload-types"

/**
 * Pure function: return the first published home page doc from a Payload
 * find() result, or null when the collection is empty / CMS not seeded.
 *
 * Extracted so it can be unit-tested without a DB connection.
 */
export function pickHomePage(docs: Page[]): Page | null {
  return docs[0] ?? null
}
