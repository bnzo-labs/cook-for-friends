import type { CollectionConfig } from "payload"

import { Entitlements } from "./collections/entitlements"

export const accessCollections: CollectionConfig[] = [Entitlements]

export { grantEntitlement, hasActiveEntitlement, listActiveEntitlements, revokeEntitlement } from "./server/entitlements"
export type { EntitlementView } from "./types"
