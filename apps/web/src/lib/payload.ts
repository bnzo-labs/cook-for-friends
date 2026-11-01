import { getPayload as _getPayload } from "payload"
import { cache } from "react"

/**
 * Cached Payload instance.
 * React's `cache()` deduplicates calls within a single render tree.
 * Safe to call from any server component or route handler.
 *
 * Uses a dynamic import for @payload-config so that importing this module
 * does NOT trigger env.ts validation at import time — only when getPayload()
 * is actually called. This matches the lazy-import pattern in transport.ts
 * and allows integration test files to load without requiring all env vars.
 */
export const getPayload = cache(async () => {
  const { default: config } = await import("@payload-config")
  return _getPayload({ config })
})
