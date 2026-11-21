/**
 * G-3 unit tests: payload-locked-documents shadow route.
 *
 * Proves that:
 * - Unauthenticated → 404 (no Payload handler called)
 * - Signed-in customer (customers collection) → 404
 * - Signed-in staff (users collection, role=staff) → Payload handler forwarded (200)
 * - Signed-in admin (users collection, role=admin) → Payload handler forwarded (200)
 *
 * Payload's `getPayload` and the REST handlers are mocked; no DB required.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

// vi.mock factories are hoisted before module evaluation, so variables must be initialised
// before hoisting with vi.hoisted so the factory closures capture the real vi.fn() instances.
const { mockAuth, mockRestHandler } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockRestHandler: vi.fn(),
}))

vi.mock("payload", () => ({
  getPayload: async () => ({ auth: mockAuth }),
}))

vi.mock("@payloadcms/next/routes", () => ({
  REST_GET: () => mockRestHandler,
  REST_POST: () => mockRestHandler,
  REST_DELETE: () => mockRestHandler,
  REST_PATCH: () => mockRestHandler,
  REST_PUT: () => mockRestHandler,
  REST_OPTIONS: () => mockRestHandler,
}))

vi.mock("@payload-config", () => ({ default: {} }))

// Mock only the isStaff function used by the route. The identity barrel has
// transitive Payload collection imports that require a full DB context in tests.
vi.mock("@/modules/identity", async () => {
  const { isStaff: realIsStaff } = await import("@/modules/identity/access")
  return { isStaff: realIsStaff }
})

// import after mocks
import { GET, POST, DELETE } from "../[[...rest]]/route"

function makeRequest(method = "GET"): Request {
  return new Request("http://localhost:3000/api/payload-locked-documents", { method })
}

function makeCtx(rest?: string[]): { params: Promise<{ rest?: string[] }> } {
  return { params: Promise.resolve(rest?.length ? { rest } : {}) }
}

describe("G-3 payload-locked-documents shadow route", () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockRestHandler.mockReset().mockResolvedValue(new Response("{}", { status: 200 }))
  })

  it("returns 404 for unauthenticated (no user)", async () => {
    mockAuth.mockResolvedValue({ user: null })
    const res = await GET(makeRequest(), makeCtx())
    expect(res.status).toBe(404)
    expect(mockRestHandler).not.toHaveBeenCalled()
  })

  it("returns 404 for authenticated customer (customers collection)", async () => {
    mockAuth.mockResolvedValue({ user: { id: 7, collection: "customers" } })
    const res = await GET(makeRequest(), makeCtx())
    expect(res.status).toBe(404)
    expect(mockRestHandler).not.toHaveBeenCalled()
  })

  it("returns 404 for a users record without a staff/admin role", async () => {
    mockAuth.mockResolvedValue({ user: { id: 1, collection: "users" } })
    const res = await GET(makeRequest(), makeCtx())
    expect(res.status).toBe(404)
    expect(mockRestHandler).not.toHaveBeenCalled()
  })

  it("forwards GET to Payload for staff (users collection, role=staff)", async () => {
    mockAuth.mockResolvedValue({ user: { id: 1, collection: "users", role: "staff" } })
    const res = await GET(makeRequest(), makeCtx())
    expect(res.status).toBe(200)
    expect(mockRestHandler).toHaveBeenCalledOnce()
    // params forwarded with correct slug prefix
    const [, args] = mockRestHandler.mock.calls[0] as [Request, { params: Promise<{ slug: string[] }> }]
    const params = await args.params
    expect(params.slug[0]).toBe("payload-locked-documents")
  })

  it("forwards GET to Payload for admin (users collection, role=admin)", async () => {
    mockAuth.mockResolvedValue({ user: { id: 2, collection: "users", role: "admin" } })
    const res = await GET(makeRequest(), makeCtx())
    expect(res.status).toBe(200)
    expect(mockRestHandler).toHaveBeenCalledOnce()
  })

  it("passes rest segments through to Payload slug", async () => {
    mockAuth.mockResolvedValue({ user: { id: 1, collection: "users", role: "staff" } })
    await GET(makeRequest(), makeCtx(["some-id"]))
    const [, args] = mockRestHandler.mock.calls[0] as [Request, { params: Promise<{ slug: string[] }> }]
    const params = await args.params
    expect(params.slug).toEqual(["payload-locked-documents", "some-id"])
  })

  it("POST: returns 404 for customer", async () => {
    mockAuth.mockResolvedValue({ user: { id: 7, collection: "customers" } })
    const res = await POST(makeRequest("POST"), makeCtx())
    expect(res.status).toBe(404)
    expect(mockRestHandler).not.toHaveBeenCalled()
  })

  it("POST: forwards to Payload for staff", async () => {
    mockAuth.mockResolvedValue({ user: { id: 1, collection: "users", role: "staff" } })
    const res = await POST(makeRequest("POST"), makeCtx())
    expect(res.status).toBe(200)
    expect(mockRestHandler).toHaveBeenCalledOnce()
  })

  it("DELETE: returns 404 for customer", async () => {
    mockAuth.mockResolvedValue({ user: { id: 7, collection: "customers" } })
    const res = await DELETE(makeRequest("DELETE"), makeCtx())
    expect(res.status).toBe(404)
    expect(mockRestHandler).not.toHaveBeenCalled()
  })

  it("DELETE: forwards to Payload for staff", async () => {
    mockAuth.mockResolvedValue({ user: { id: 1, collection: "users", role: "staff" } })
    const res = await DELETE(makeRequest("DELETE"), makeCtx())
    expect(res.status).toBe(200)
    expect(mockRestHandler).toHaveBeenCalledOnce()
  })
})
