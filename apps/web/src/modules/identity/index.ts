import type { CollectionConfig } from "payload"

import { AuthRateLimits } from "./collections/auth-rate-limits"
import { Customers } from "./collections/customers"
import { MagicLinkTokens } from "./collections/magic-link-tokens"
import { Users } from "./collections/users"

export const identityCollections: CollectionConfig[] = [Users, Customers, MagicLinkTokens, AuthRateLimits]

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

// Customer auth (CONTRACT §4)
export {
  RATE_LIMITED_REASON,
  requestMagicLink,
  upsertCustomerByEmail,
  verifyMagicLink,
} from "./server/magic-link"
export { endCustomerSession, getCurrentCustomer, requireCustomer } from "./server/session"

// HTTP helpers for src/app/api/auth/** route handlers
export {
  clientIp,
  forbiddenOrigin,
  isAllowedOrigin,
  jsonResponse,
  readBody,
  requestBodySchema,
  verifyBodySchema,
} from "./server/http"
export { sendMagicLinkEmail, setMagicLinkEmailSender, resetMagicLinkEmailSender } from "./server/ports"
export type { MagicLinkEmailInput, MagicLinkEmailSender } from "./server/ports"
export type { CustomerView } from "./types"
