import type { Where } from "payload"

/**
 * Only the published version is ever read: the main table holds the last
 * published snapshot while drafts live in the versions table. `status` guards
 * archived/unpublished courses whose snapshot is still `_status: published`.
 */
export const PUBLISHED: Where = {
  and: [{ _status: { equals: "published" } }, { status: { equals: "published" } }],
}
