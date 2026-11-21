import type { PayloadRequest } from "payload"
import { describe, expect, it } from "vitest"

import {
  adminOrOwner,
  isAdmin,
  isAdminUser,
  isCustomerUser,
  isSelfCustomer,
  isStaff,
  isStaffOrAdmin,
  ownsDocument,
  publishedOrStaff,
} from "../access"
import { Users } from "../collections/users"

const admin = { id: 1, collection: "users", role: "admin" }
const staff = { id: 2, collection: "users", role: "staff" }
const customer = { id: 7, collection: "customers" }
const req = (user: unknown) => ({ req: { user } as unknown as PayloadRequest })

describe("identity access helpers", () => {
  it("classifies users", () => {
    expect(isStaff(admin)).toBe(true)
    expect(isStaff(staff)).toBe(true)
    expect(isStaff(customer)).toBe(false)
    expect(isStaff(null)).toBe(false)
    expect(isStaff({ collection: "users", role: "staff" })).toBe(false) // no id
    expect(isStaff({ id: 3, collection: "users", role: "owner" })).toBe(false)
    expect(isAdminUser(admin)).toBe(true)
    expect(isAdminUser(staff)).toBe(false)
    expect(isCustomerUser(customer)).toBe(true)
    expect(isCustomerUser(staff)).toBe(false)
    expect(isCustomerUser("x")).toBe(false)
  })

  it("isAdmin / isStaffOrAdmin", () => {
    expect(isAdmin(req(admin))).toBe(true)
    expect(isAdmin(req(staff))).toBe(false)
    expect(isStaffOrAdmin(req(staff))).toBe(true)
    expect(isStaffOrAdmin(req(customer))).toBe(false)
    expect(isStaffOrAdmin(req(undefined))).toBe(false)
  })

  it("isSelfCustomer scopes customers to their own record", () => {
    expect(isSelfCustomer(req(staff) as never)).toBe(true)
    expect(isSelfCustomer(req(customer) as never)).toEqual({ id: { equals: 7 } })
    expect(isSelfCustomer(req(undefined) as never)).toBe(false)
  })

  it("ownsDocument scopes by field", () => {
    const access = ownsDocument("customer")
    expect(access(req(admin) as never)).toBe(true)
    expect(access(req(customer) as never)).toEqual({ customer: { equals: 7 } })
    expect(access(req(undefined) as never)).toBe(false)
  })

  it("adminOrOwner excludes plain staff", () => {
    const access = adminOrOwner("customer")
    expect(access(req(admin) as never)).toBe(true)
    expect(access(req(staff) as never)).toBe(false)
    expect(access(req(customer) as never)).toEqual({ customer: { equals: 7 } })
  })

  it("publishedOrStaff returns the published filter for non-staff", () => {
    const where = { status: { equals: "published" } }
    const access = publishedOrStaff(where)
    expect(access(req(staff) as never)).toBe(true)
    expect(access(req(customer) as never)).toEqual(where)
    expect(access(req(undefined) as never)).toEqual(where)
  })

  // G-1 (W4-03c): staff payload-token cookie must be Secure in production
  it("Users collection: auth is a config object with sameSite=Lax and secure tied to NODE_ENV", () => {
    const authConfig = Users.auth
    // auth must be an object (not just `true`) so the cookie config can be set
    expect(typeof authConfig).toBe("object")
    expect(authConfig).not.toBe(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cookies = (authConfig as any)?.cookies as { secure?: unknown; sameSite?: unknown } | undefined
    expect(cookies).toBeDefined()
    expect(cookies?.sameSite).toBe("Lax")
    // In a test/dev environment NODE_ENV !== 'production', so secure=false
    expect(cookies?.secure).toBe(process.env.NODE_ENV === "production")
  })
})
