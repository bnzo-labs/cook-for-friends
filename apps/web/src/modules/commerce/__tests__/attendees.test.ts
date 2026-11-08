import type { Payload } from "payload"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { makeCustomer, makeOrder } from "../../../../test/fixtures"
import { getTestPayload, hasTestDb, uid } from "../../../../test/integration"
import { buildAttendeesCsv, csvCell } from "../attendees/csv"
import type { AttendeeEntry } from "../attendees/list"
import { splitName } from "../attendees/list"
import { addHold, makeBookableSession } from "./helpers"

const entry = (over: Partial<AttendeeEntry["row"]> = {}, seatCount = 1): AttendeeEntry => ({
  seatCount,
  row: {
    enrollmentId: 1,
    attendeeIndex: 0,
    isBuyer: true,
    firstName: "Ana",
    lastName: "Roy",
    email: "ana@example.com",
    bookedBy: { name: "Ana Roy", email: "ana@example.com" },
    orderNumber: "CFF-1",
    enrollmentStatus: "confirmed",
    attendance: "unknown",
    paidAt: "2026-11-01T00:00:00.000Z",
    ...over,
  },
})

describe("csv (unit)", () => {
  it("guards injection prefixes, escapes quotes, quotes delimiters", () => {
    for (const v of ["=1+1", "+1514", "-2", "@x", "\tx", "\rx"]) expect(csvCell(v).replace(/^"/, "")).toMatch(/^'/)
    expect(csvCell('a"b')).toBe('"a""b"')
    expect(csvCell("a;b")).toBe('"a;b"')
    expect(csvCell(undefined)).toBe("")
    expect(csvCell("safe")).toBe("safe")
  })

  it("BOM, ; delimiter, FR/EN headers, seat n/N, booked-by on every row", () => {
    const csv = buildAttendeesCsv(
      [entry({}, 2), entry({ attendeeIndex: 1, isBuyer: false, firstName: "=cmd", lastName: "Zed" }, 2)],
      "fr",
    )
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const lines = csv.slice(1).trim().split("\r\n")
    expect(lines[0]).toBe("Nom;Prénom;Courriel;Téléphone;Notes alimentaires;Statut;Présence;Commande;Réservé par;Place;Invité")
    expect(lines[1]).toContain("Ana Roy <ana@example.com>")
    expect(lines[1]).toContain(";1/2;Non")
    expect(lines[2]).toContain("'=cmd")
    expect(lines[2]).toContain(";2/2;Oui")
    expect(lines[2]).toContain("Ana Roy <ana@example.com>")
    expect(buildAttendeesCsv([], "en")).toContain("Last name;First name;Email")
  })

  it("splitName splits at first whitespace", () => {
    expect(splitName("Marie Ève Tremblay")).toEqual({ firstName: "Marie", lastName: "Ève Tremblay" })
    expect(splitName("  Cher ")).toEqual({ firstName: "Cher", lastName: "" })
  })
})

describe.skipIf(!hasTestDb)("listAttendees + CSV route (integration)", () => {
  let payload: Payload
  let commerce: typeof import("../index")
  vi.setConfig({ testTimeout: 30_000 })

  beforeAll(async () => {
    payload = await getTestPayload()
    commerce = await import("../index")
  }, 60_000)

  function seat(sessionId: number, orderId: number, customerId: number, i: number, over: Record<string, unknown> = {}) {
    return payload.create({
      collection: "enrollments",
      data: { session: sessionId, order: orderId, customer: customerId, attendeeIndex: i, status: "confirmed", attendance: "unknown", ...over },
      overrideAccess: true,
    })
  }

  it("3-seat order → 3 rows, bookedBy buyer, own emails, entered name wins, sorted, all statuses", async () => {
    const { course, session } = await makeBookableSession(payload, 10)
    const buyer = await payload.create({
      collection: "customers",
      data: { email: `buyer-${uid()}@example.com`, firstName: "Béa", lastName: "Zimmer", phone: "514-555-0100", dietaryNotes: "vegan", preferredLocale: "fr" },
    })
    const g1 = await makeCustomer(payload)
    const preexisting = await payload.create({
      collection: "customers",
      data: { email: `pre-${uid()}@example.com`, firstName: "Old", lastName: "Name", preferredLocale: "fr" },
    })
    const order = await makeOrder(payload, buyer.id, course.id)
    await seat(session.id, order.id, buyer.id, 0)
    await seat(session.id, order.id, g1.id, 1, { attendeeName: "Adam Able" })
    await seat(session.id, order.id, preexisting.id, 2, { attendeeName: "Carl Entered", status: "cancelled" })

    const rows = await commerce.listAttendees(session.id)
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.lastName)).toEqual(["Able", "Entered", "Zimmer"])
    expect(rows.every((r) => r.bookedBy.email === buyer.email && r.bookedBy.name === "Béa Zimmer")).toBe(true)
    const [guest1, guest2, b] = rows
    expect(guest1).toMatchObject({ firstName: "Adam", email: g1.email, isBuyer: false, attendeeIndex: 1 })
    expect(guest2).toMatchObject({ firstName: "Carl", email: preexisting.email, enrollmentStatus: "cancelled" })
    expect(b).toMatchObject({ firstName: "Béa", isBuyer: true, phone: "514-555-0100", dietaryNotes: "vegan", orderNumber: order.number })
  })

  it("seat summary counts seats: confirmed enrollments + hold quantity", async () => {
    const { course, session } = await makeBookableSession(payload, 6)
    const c = await makeCustomer(payload)
    const order = await makeOrder(payload, c.id, course.id)
    await seat(session.id, order.id, c.id, 0)
    await addHold(payload, session.id, { quantity: 2 })
    await addHold(payload, session.id, { quantity: 1, status: "expired" })
    expect(await commerce.getSeatSummary(session.id)).toEqual({ capacity: 6, confirmed: 1, activeHolds: 2, available: 3 })
    expect(await commerce.getSeatSummary(999_999_999)).toBeNull()
  })

  describe("GET attendees.csv", () => {
    const call = (id: string, token?: string, qs = "") =>
      commerce.handleAttendeesCsv(
        new Request(`http://localhost/api/sessions/${id}/attendees.csv${qs}`, {
          headers: token ? { authorization: `JWT ${token}` } : {},
        }),
        id,
      )

    async function loginToken(role: "admin" | "staff") {
      const pw = `${uid()}${uid()}`
      const u = await payload.create({
        collection: "users",
        data: { email: `${role}-${uid()}@example.com`, password: pw, role },
      })
      const r = await payload.login({ collection: "users", data: { email: u.email, password: pw } })
      return r.token as string
    }

    it("anon 401, staff/admin 200 with CSV headers, unknown/invalid id 404", async () => {
      const { course, session } = await makeBookableSession(payload, 4)
      const c = await makeCustomer(payload)
      const order = await makeOrder(payload, c.id, course.id)
      await seat(session.id, order.id, c.id, 0)

      expect((await call(String(session.id))).status).toBe(401)

      const staff = await loginToken("staff")
      const res = await call(String(session.id), staff)
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8")
      expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="participants-.+-\d{4}-\d{2}-\d{2}\.csv"$/)
      const body = await res.text()
      expect(body.charCodeAt(0)).toBe(0xfeff)
      expect(body).toContain("Nom;Prénom")
      expect(body).toContain(c.email)

      const en = await call(String(session.id), await loginToken("admin"), "?locale=en")
      expect(en.status).toBe(200)
      expect(await en.text()).toContain("Last name;First name")
      expect((await call("999999999", staff)).status).toBe(404)
      expect((await call("abc", staff)).status).toBe(404)
    })

    it("a customer session is refused with 403", async () => {
      const { session } = await makeBookableSession(payload, 2)
      const c = await makeCustomer(payload)
      const spy = vi
        .spyOn(payload, "auth")
        .mockResolvedValueOnce({ user: { ...c, collection: "customers" }, permissions: {} } as never)
      try {
        expect((await call(String(session.id), "customer-token")).status).toBe(403)
      } finally {
        spy.mockRestore()
      }
    })
  })
})
