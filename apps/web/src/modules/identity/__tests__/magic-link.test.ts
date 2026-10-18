import { createHash } from "node:crypto"
import type { Payload } from "payload"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { getTestPayload, hasTestDb, uid } from "../../../../test/integration"
import { makeStaff } from "../../../../test/fixtures"
import type { MagicLinkEmailInput } from "../server/ports"

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex")
const randomIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`

describe.skipIf(!hasTestDb)("identity magic-link (integration)", () => {
  let payload: Payload
  const sent: MagicLinkEmailInput[] = []
  let request: typeof import("@/app/api/auth/magic-link/request/route")
  let verify: typeof import("@/app/api/auth/magic-link/verify/route")
  let logout: typeof import("@/app/api/auth/logout/route")
  let identity: typeof import("../index")
  let ports: typeof import("../server/ports")

  // Real Postgres over the network: each request is several round trips.
  vi.setConfig({ testTimeout: 30_000 })

  beforeAll(async () => {
    payload = await getTestPayload()
    request = await import("@/app/api/auth/magic-link/request/route")
    verify = await import("@/app/api/auth/magic-link/verify/route")
    logout = await import("@/app/api/auth/logout/route")
    identity = await import("../index")
    ports = await import("../server/ports")
    // Never send real mail from tests: swap the port.
    ports.setMagicLinkEmailSender(async (mail) => {
      sent.push(mail)
    })
  }, 60_000)

  afterAll(() => ports?.resetMagicLinkEmailSender())

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    new Request(`http://localhost:3000${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    })

  const requestLink = (email: string, extra: { next?: string; ip?: string; locale?: string } = {}) =>
    request.POST(
      post(
        "/api/auth/magic-link/request",
        { email, locale: extra.locale ?? "fr", next: extra.next },
        { "x-forwarded-for": extra.ip ?? randomIp() },
      ),
    )

  const tokenFor = (email: string) => {
    const mail = [...sent].reverse().find((m) => m.to === email)
    if (!mail) throw new Error(`no email captured for ${email}`)
    return new URL(mail.link).searchParams.get("token") as string
  }

  const doVerify = (token: string, headers: Record<string, string> = {}) =>
    verify.POST(post("/api/auth/magic-link/verify", { token }, headers))

  const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0] ?? ""

  async function signIn(extra: { next?: string } = {}) {
    const email = `ml-${uid()}@example.com`
    expect((await requestLink(email, extra)).status).toBe(200)
    const res = await doVerify(tokenFor(email))
    return { email, res, cookie: cookieOf(res), token: tokenFor(email) }
  }

  it("request: same 200 body for new and existing emails; stores only the hash", async () => {
    const email = `ml-${uid()}@example.com`
    const first = await requestLink(email)
    const second = await requestLink(email)
    const other = await requestLink(`ml-${uid()}@example.com`)
    for (const res of [first, second, other]) {
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
    }

    const customers = await payload.find({ collection: "customers", where: { email: { equals: email } } })
    expect(customers.totalDocs).toBe(1)

    const raw = tokenFor(email)
    expect(Buffer.from(raw, "base64url")).toHaveLength(32)
    const rows = await payload.find({
      collection: "magic-link-tokens",
      where: { customer: { equals: customers.docs[0]!.id } },
      sort: "-createdAt",
    })
    expect(rows.totalDocs).toBe(2)
    const row = rows.docs[0]!
    expect(row.tokenHash).toBe(sha256(raw))
    expect(JSON.stringify(row)).not.toContain(raw)
    const ttlMs = new Date(row.expiresAt).getTime() - Date.now()
    expect(ttlMs).toBeGreaterThan(14 * 60_000)
    expect(ttlMs).toBeLessThanOrEqual(15 * 60_000)
    expect(row.usedAt ?? null).toBeNull()
  })

  it("request: sends the link in the customer's locale", async () => {
    const email = `ml-${uid()}@example.com`
    await requestLink(email, { locale: "en" })
    const mail = sent.find((m) => m.to === email)!
    expect(mail.locale).toBe("en")
    expect(mail.link).toMatch(/^https?:\/\/[^/]+\/en\/auth\/verify\?token=[A-Za-z0-9_-]{43}$/)
    expect(mail.expiresInMinutes).toBe(15)
  })

  it("request: an email send failure still answers 200", async () => {
    ports.setMagicLinkEmailSender(async () => {
      throw new Error("resend down")
    })
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const res = await requestLink(`ml-${uid()}@example.com`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
      ports.setMagicLinkEmailSender(async (mail) => {
        sent.push(mail)
      })
    }
  })

  it("request: validates the body and the Origin header", async () => {
    const badEmail = await request.POST(post("/api/auth/magic-link/request", { email: "nope", locale: "fr" }))
    expect(badEmail.status).toBe(400)
    const badLocale = await request.POST(post("/api/auth/magic-link/request", { email: "a@example.com", locale: "de" }))
    expect(badLocale.status).toBe(400)
    const crossSite = await request.POST(
      post("/api/auth/magic-link/request", { email: "a@example.com", locale: "fr" }, { origin: "https://evil.com" }),
    )
    expect(crossSite.status).toBe(403)
  })

  it("verify: valid token → 303 + cookie → payload.auth resolves a customer", async () => {
    const { email, res, cookie } = await signIn()
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe("/fr/account")
    const setCookie = res.headers.get("set-cookie") ?? ""
    expect(setCookie).toMatch(/^payload-token=/)
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Lax/i)

    const auth = await payload.auth({ headers: new Headers({ cookie }) })
    expect(auth.user?.collection).toBe("customers")
    expect(auth.user?.email).toBe(email)

    const row = (await payload.find({ collection: "magic-link-tokens", where: { usedAt: { exists: true } }, limit: 1, sort: "-usedAt" })).docs[0]
    expect(row?.usedAt).toBeTruthy()
  })

  it("verify: replay of a used token fails with MAGIC_LINK_INVALID", async () => {
    const { token } = await signIn()
    const replay = await doVerify(token)
    expect(replay.status).toBe(400)
    expect(replay.headers.get("set-cookie")).toBeNull()
    expect(await replay.json()).toEqual({
      ok: false,
      error: { code: "MAGIC_LINK_INVALID", messageKey: "errors.MAGIC_LINK_INVALID" },
    })
  })

  it("verify: concurrent redemptions of one token succeed exactly once", async () => {
    const email = `ml-${uid()}@example.com`
    await requestLink(email)
    const token = tokenFor(email)
    const results = await Promise.all(Array.from({ length: 5 }, () => doVerify(token)))
    expect(results.filter((r) => r.status === 303)).toHaveLength(1)
    expect(results.filter((r) => r.status === 400)).toHaveLength(4)
  })

  it("verify: expired and unknown tokens return the identical response", async () => {
    const email = `ml-${uid()}@example.com`
    await requestLink(email)
    const token = tokenFor(email)
    const row = (await payload.find({ collection: "magic-link-tokens", where: { tokenHash: { equals: sha256(token) } } })).docs[0]!
    await payload.update({
      collection: "magic-link-tokens",
      id: row.id,
      data: { expiresAt: new Date(Date.now() - 1000).toISOString() },
      overrideAccess: true,
    })
    const expired = await doVerify(token)
    const unknown = await doVerify("A".repeat(43))
    const garbage = await verify.POST(post("/api/auth/magic-link/verify", { nope: 1 }))
    for (const res of [expired, unknown, garbage]) {
      expect(res.status).toBe(400)
      expect(res.headers.get("set-cookie")).toBeNull()
    }
    const [a, b, c] = await Promise.all([expired.text(), unknown.text(), garbage.text()])
    expect(a).toBe(b)
    expect(b).toBe(c)
  })

  it("verify: GET never consumes (POST-only handler)", () => {
    expect((verify as Record<string, unknown>).GET).toBeUndefined()
  })

  it("verify: cross-site Origin is refused", async () => {
    const email = `ml-${uid()}@example.com`
    await requestLink(email)
    const res = await doVerify(tokenFor(email), { origin: "https://evil.com" })
    expect(res.status).toBe(403)
    // Token untouched: still redeemable from a same-origin request.
    expect((await doVerify(tokenFor(email))).status).toBe(303)
  })

  it("next: open redirects fall back to the default; same-origin paths are honored", async () => {
    for (const next of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)"]) {
      const { res } = await signIn({ next })
      expect(res.headers.get("location")).toBe("/fr/account")
    }
    const { res } = await signIn({ next: "/en/account/orders?page=2" })
    expect(res.headers.get("location")).toBe("/en/account/orders?page=2")
  })

  it("rate limit: 6th request for one email in an hour → 429 with a message key", { timeout: 60_000 }, async () => {
    const email = `ml-${uid()}@example.com`
    const ip = randomIp()
    for (let i = 0; i < 5; i++) expect((await requestLink(email, { ip: randomIp() })).status).toBe(200)
    const blocked = await requestLink(email, { ip })
    expect(blocked.status).toBe(429)
    expect(await blocked.json()).toEqual({
      ok: false,
      error: { code: "RATE_LIMITED", messageKey: "errors.MAGIC_LINK_RATE_LIMITED" },
    })
    expect(blocked.headers.get("retry-after")).toBeTruthy()
    // Other emails are unaffected.
    expect((await requestLink(`ml-${uid()}@example.com`, { ip: randomIp() })).status).toBe(200)
  })

  it("rate limit: 21st request from one IP in an hour → 429", { timeout: 60_000 }, async () => {
    const { IP_LIMIT } = await import("../server/rate-limit")
    expect(IP_LIMIT).toBe(20)
    const ip = randomIp()
    // Seed 20 prior attempts in one statement, then the 21st goes through the route.
    const table = payload.db.tables["auth_rate_limits"]
    await payload.db.drizzle.insert(table).values(
      Array.from({ length: IP_LIMIT }, () => ({ scope: "ip" as const, keyHash: sha256(ip) })),
    )
    const blocked = await requestLink(`ml-${uid()}@example.com`, { ip })
    expect(blocked.status).toBe(429)
    expect((await requestLink(`ml-${uid()}@example.com`, { ip: randomIp() })).status).toBe(200)
  })

  it("rate limit: state is in Postgres and attempts older than an hour stop counting", async () => {
    const { consumeRateLimit } = await import("../server/rate-limit")
    const key = `rl-${uid()}`
    // Backdated attempt (createdAt is system-managed, so insert it directly).
    const past = new Date(Date.now() - 2 * 3_600_000).toISOString()
    await payload.db.drizzle
      .insert(payload.db.tables["auth_rate_limits"])
      .values({ scope: "email", keyHash: sha256(key), createdAt: past, updatedAt: past })
    for (let i = 0; i < 5; i++) expect((await consumeRateLimit(payload, { scope: "email", key, limit: 5 })).allowed).toBe(true)
    expect((await consumeRateLimit(payload, { scope: "email", key, limit: 5 })).allowed).toBe(false)
  })

  it("getCurrentCustomer: customer cookie → customer; staff and anonymous → null", async () => {
    const { email, cookie } = await signIn()
    const customer = await identity.getCurrentCustomer(new Headers({ cookie }))
    expect(customer?.email).toBe(email)
    expect(customer?.preferredLocale).toBe("fr")

    const staff = await makeStaff(payload, "staff")
    const login = await payload.login({ collection: "users", data: { email: staff.email, password: "unused" } }).catch(() => null)
    expect(login).toBeNull() // wrong password never yields a session

    expect(await identity.getCurrentCustomer(new Headers())).toBeNull()
  })

  it("staff: password login works; staff cookie is not a customer; wrong password fails", async () => {
    const password = `pw-${uid()}${uid()}`
    const email = `staff-${uid()}@example.com`
    await payload.create({ collection: "users", data: { email, password, role: "staff" } })

    await expect(payload.login({ collection: "users", data: { email, password: "wrong-password" } })).rejects.toThrow()
    const login = await payload.login({ collection: "users", data: { email, password } })
    expect(login.token).toBeTruthy()

    const headers = new Headers({ cookie: `payload-token=${login.token}` })
    const auth = await payload.auth({ headers })
    expect(auth.user?.collection).toBe("users")
    expect(auth.permissions.canAccessAdmin).toBe(true)
    expect(await identity.getCurrentCustomer(headers)).toBeNull()
  })

  it("admin: a customers cookie cannot access /admin", async () => {
    const { cookie } = await signIn()
    const auth = await payload.auth({ headers: new Headers({ cookie }) })
    expect(auth.user?.collection).toBe("customers")
    expect(auth.permissions.canAccessAdmin ?? false).toBe(false)
  })

  it("session: a tampered customers cookie is anonymous", async () => {
    const { cookie } = await signIn()
    const [name, value] = cookie.split("=") as [string, string]
    const [h, p, s] = value.split(".") as [string, string, string]
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url").toString()), id: 999999 })).toString("base64url")
    const auth = await payload.auth({ headers: new Headers({ cookie: `${name}=${h}.${forged}.${s}` }) })
    expect(auth.user).toBeNull()
  })

  it("requireCustomer: returns the customer, or throws a redirect to the login page", async () => {
    const { cookie } = await signIn()
    expect((await identity.requireCustomer(new Headers({ cookie }))).email).toMatch(/@example\.com$/)
    await expect(identity.requireCustomer(new Headers({ "x-next-intl-locale": "en" }))).rejects.toMatchObject({
      digest: expect.stringContaining("/en/auth/login"),
    })
    await expect(identity.requireCustomer(new Headers())).rejects.toMatchObject({
      digest: expect.stringContaining("/fr/auth/login"),
    })
  })

  it("logout: clears the customer cookie and redirects to the locale home", async () => {
    const { cookie } = await signIn()
    const res = await logout.POST(post("/api/auth/logout", {}, { cookie }))
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe("/fr")
    const cleared = res.headers.get("set-cookie") ?? ""
    expect(cleared).toMatch(/^payload-token=;/)
    const expires = /Expires=([^;]+)/i.exec(cleared)?.[1]
    expect(new Date(expires ?? "").getTime()).toBeLessThanOrEqual(Date.now())
  })

  it("revocation: logout rejects the old cookie and every other cookie of the same customer; new login works", async () => {
    const email = `ml-${uid()}@example.com`
    const login = async () => {
      expect((await requestLink(email)).status).toBe(200)
      return cookieOf(await doVerify(tokenFor(email)))
    }
    const deviceA = await login()
    const deviceB = await login()
    const resolve = async (cookie: string) => (await payload.auth({ headers: new Headers({ cookie }) })).user
    expect((await resolve(deviceA))?.collection).toBe("customers")
    expect((await resolve(deviceB))?.collection).toBe("customers")

    const res = await logout.POST(post("/api/auth/logout", {}, { cookie: deviceA }))
    expect(res.status).toBe(303)

    expect(await resolve(deviceA)).toBeNull()
    expect(await resolve(deviceB)).toBeNull()
    expect(await identity.getCurrentCustomer(new Headers({ cookie: deviceB }))).toBeNull()

    const fresh = await login()
    expect((await resolve(fresh))?.collection).toBe("customers")
    const stored = await payload.find({ collection: "customers", where: { email: { equals: email } }, overrideAccess: true })
    expect(stored.docs[0]?.sessionVersion).toBe(1)
  })

  it("revocation: another customer is unaffected; a replayed logout with a stale cookie changes nothing", async () => {
    const a = await signIn()
    const b = await signIn()
    await logout.POST(post("/api/auth/logout", {}, { cookie: a.cookie }))
    const again = await logout.POST(post("/api/auth/logout", {}, { cookie: a.cookie }))
    expect(again.status).toBe(303)
    expect((await payload.auth({ headers: new Headers({ cookie: b.cookie }) })).user?.collection).toBe("customers")
    const stored = await payload.find({ collection: "customers", where: { email: { equals: a.email } }, overrideAccess: true })
    expect(stored.docs[0]?.sessionVersion).toBe(1)
  })

  it("revocation: sessionVersion is not writable through a customer-level update", async () => {
    const { email } = await signIn()
    const found = await payload.find({ collection: "customers", where: { email: { equals: email } }, overrideAccess: true })
    const customer = found.docs[0]!
    await payload.update({
      collection: "customers",
      id: customer.id,
      data: { sessionVersion: 99 },
      user: { ...customer, collection: "customers" },
      overrideAccess: false,
    })
    const after = await payload.findByID({ collection: "customers", id: customer.id, overrideAccess: true })
    expect(after.sessionVersion).toBe(0)
  })

  it("logout: anonymous is a harmless 303; a staff cookie is left untouched", async () => {
    const anon = await logout.POST(post("/api/auth/logout", {}))
    expect(anon.status).toBe(303)

    const password = `pw-${uid()}${uid()}`
    const email = `staff-${uid()}@example.com`
    await payload.create({ collection: "users", data: { email, password, role: "staff" } })
    const { token } = await payload.login({ collection: "users", data: { email, password } })
    const res = await logout.POST(post("/api/auth/logout", {}, { cookie: `payload-token=${token}` }))
    expect(res.status).toBe(303)
    expect(res.headers.get("set-cookie")).toBeNull()
  })
})
