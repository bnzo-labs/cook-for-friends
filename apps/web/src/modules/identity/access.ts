/**
 * identity/access.ts — shared Payload access helpers (CONTRACT §3.7).
 *
 * Two auth collections exist (DISCOVERY §3):
 *   - `users`     → staff, `role ∈ { admin, staff }`
 *   - `customers` → customers (magic link)
 *
 * `req.user.collection` tells them apart. Other modules import these helpers
 * from `@/modules/identity` only.
 */
import type { Access, FieldAccess, PayloadRequest, Where } from "payload"

export type StaffRole = "admin" | "staff"

type AuthUser = { id: string | number; collection?: string; role?: unknown }

function asAuthUser(user: unknown): AuthUser | null {
  if (!user || typeof user !== "object") return null
  const u = user as AuthUser
  if (u.id === undefined || u.id === null) return null
  return u
}

/** True when `user` is a staff record (`users` collection, any role). */
export function isStaff(user: unknown): boolean {
  const u = asAuthUser(user)
  return u?.collection === "users" && (u.role === "admin" || u.role === "staff")
}

/** True when `user` is a staff record with `role = admin`. */
export function isAdminUser(user: unknown): boolean {
  const u = asAuthUser(user)
  return u?.collection === "users" && u.role === "admin"
}

/** True when `user` is an authenticated customer. */
export function isCustomerUser(user: unknown): boolean {
  return asAuthUser(user)?.collection === "customers"
}

type ReqArgs = { req: PayloadRequest }

/** Collection/global access: admin only. */
export const isAdmin = ({ req }: ReqArgs): boolean => isAdminUser(req.user)

/** Collection/global access: any staff (admin or staff). */
export const isStaffOrAdmin = ({ req }: ReqArgs): boolean => isStaff(req.user)

/** Field access: admin only. */
export const isAdminField: FieldAccess = ({ req }) => isAdminUser(req.user)

/** Field access: any staff. */
export const isStaffField: FieldAccess = ({ req }) => isStaff(req.user)

/** Access that always denies (writes go through module functions / Local API). */
export const denyAll: Access = () => false

/** Access that always allows (public reads). */
export const allowAll: Access = () => true

/**
 * `customers` collection: staff see everything, a customer sees only their own
 * record, anonymous sees nothing.
 */
export const isSelfCustomer: Access = ({ req }) => {
  if (isStaff(req.user)) return true
  const u = asAuthUser(req.user)
  if (u && u.collection === "customers") return { id: { equals: u.id } }
  return false
}

/**
 * Owner-scoped access: staff see everything, a customer sees documents where
 * `<field>` points to them, anonymous sees nothing.
 */
export function ownsDocument(field: string): Access {
  return ({ req }) => {
    if (isStaff(req.user)) return true
    const u = asAuthUser(req.user)
    if (u && u.collection === "customers") return { [field]: { equals: u.id } } as Where
    return false
  }
}

/** Same as `ownsDocument`, but staff need `role = admin`. */
export function adminOrOwner(field: string): Access {
  return ({ req }) => {
    if (isAdminUser(req.user)) return true
    const u = asAuthUser(req.user)
    if (u && u.collection === "customers") return { [field]: { equals: u.id } } as Where
    return false
  }
}

/**
 * Public read limited to published documents; staff read everything.
 * `where` is the published filter for this collection.
 */
export function publishedOrStaff(where: Where): Access {
  return ({ req }) => (isStaff(req.user) ? true : where)
}
