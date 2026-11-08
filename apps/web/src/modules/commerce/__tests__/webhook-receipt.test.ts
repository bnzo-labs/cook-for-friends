import type { Payload } from "payload"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { makeCustomer, makeOrder, makeStaff } from "../../../../test/fixtures"
import { getTestPayload, hasTestDb, uid } from "../../../../test/integration"
import { makePurchasableCourse } from "./helpers"

/** `GET /api/orders/:id/receipt` access (CONTRACT §5.1). */
describe.skipIf(!hasTestDb)("W2-07 receipt route (integration)", () => {
  let payload: Payload
  let route: typeof import("@/app/api/orders/[id]/receipt/route")
  let identity: typeof import("@/modules/identity")
  const links: { to: string; link: string }[] = []
  vi.setConfig({ testTimeout: 120_000 })

  beforeAll(async () => {
    payload = await getTestPayload()
    route = await import("@/app/api/orders/[id]/receipt/route")
    identity = await import("@/modules/identity")
    identity.setMagicLinkEmailSender(async (mail) => {
      links.push({ to: mail.to, link: mail.link })
    })
  }, 60_000)
  afterAll(() => identity?.resetMagicLinkEmailSender())

  async function customerCookie(email: string): Promise<string> {
    const r = await identity.requestMagicLink({ email, locale: "fr", ip: `10.7.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` })
    expect(r.ok).toBe(true)
    const mail = [...links].reverse().find((m) => m.to === email)!
    const token = new URL(mail.link).searchParams.get("token") as string
    const v = await identity.verifyMagicLink(token)
    if (!v.ok) throw new Error(JSON.stringify(v.error))
    return v.data.setCookie.split(";")[0]!
  }

  const get = (id: string | number, cookie?: string) =>
    route.GET(new Request(`http://localhost:3000/api/orders/${id}/receipt`, { headers: cookie ? { cookie } : {} }), {
      params: Promise.resolve({ id: String(id) }),
    })

  it("owner → 302 to invoice PDF; other customer → 403; anonymous → 404; staff → 302; no PDF / unknown → 404", async () => {
    const course = await makePurchasableCourse(payload, "online")
    const owner = await makeCustomer(payload)
    const order = await makeOrder(payload, owner.id, course.id)
    const pdf = `https://pay.stripe.com/invoice/in_test_${uid()}/pdf`
    await payload.update({ collection: "orders", id: order.id, data: { invoicePdfUrl: pdf, stripeInvoiceId: "in_x" }, overrideAccess: true })
    const bare = await makeOrder(payload, owner.id, course.id)

    const ownerCookie = await customerCookie(owner.email)
    const res = await get(order.id, ownerCookie)
    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toBe(pdf)
    expect((await get(bare.id, ownerCookie)).status).toBe(404)

    const other = await makeCustomer(payload)
    expect((await get(order.id, await customerCookie(other.email))).status).toBe(403)

    expect((await get(order.id)).status).toBe(404)
    expect((await get(999_999_999)).status).toBe(404)
    expect((await get("abc", ownerCookie)).status).toBe(404)

    const password = `pw-${uid()}${uid()}`
    const staff = await makeStaff(payload, "staff")
    await payload.update({ collection: "users", id: staff.id, data: { password }, overrideAccess: true })
    const login = await payload.login({ collection: "users", data: { email: staff.email, password } })
    const staffRes = await get(order.id, `payload-token=${login.token}`)
    expect(staffRes.status).toBe(302)
    expect(staffRes.headers.get("location")).toBe(pdf)
  })
})
