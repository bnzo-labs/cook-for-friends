import { getPayload as _getPayload } from "payload"
import config from "@payload-config"
import { cache } from "react"

/**
 * Cached Payload instance.
 * React's `cache()` deduplicates calls within a single render tree.
 * Safe to call from any server component or route handler.
 */
export const getPayload = cache(async () => {
  return _getPayload({ config })
})
