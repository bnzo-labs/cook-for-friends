import type { Payload } from "payload"

/**
 * Lazy Payload accessor. `payload.config.ts` imports the catalog index, so a
 * static import of `@/lib/payload` (which imports the config) would be circular.
 */
export async function getPayload(): Promise<Payload> {
  const mod = await import("@/lib/payload")
  return mod.getPayload()
}
