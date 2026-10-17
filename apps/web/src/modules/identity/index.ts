import type { CollectionConfig } from "payload"

import { Customers } from "./collections/customers"
import { MagicLinkTokens } from "./collections/magic-link-tokens"
import { Users } from "./collections/users"

export const identityCollections: CollectionConfig[] = [Users, Customers, MagicLinkTokens]

// Access helpers — the only way other modules should build `access` rules.
export {
  adminOrOwner,
  allowAll,
  denyAll,
  isAdmin,
  isAdminField,
  isAdminUser,
  isCustomerUser,
  isSelfCustomer,
  isStaff,
  isStaffField,
  isStaffOrAdmin,
  ownsDocument,
  publishedOrStaff,
} from "./access"
export type { StaffRole } from "./access"
