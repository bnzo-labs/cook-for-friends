import { jwtSign } from "payload"
import { describe, expect, it } from "vitest"

import { verifyCustomerJwt } from "../strategies/magic-link"

const secret = "unit-test-secret-unit-test-secret-1234"

const sign = (fieldsToSign: Record<string, unknown>, key = secret, tokenExpiration = 3600) =>
  jwtSign({ fieldsToSign, secret: key, tokenExpiration }).then((r) => r.token)

describe("verifyCustomerJwt", () => {
  it("accepts a Payload-format customers token", async () => {
    const token = await sign({ id: 7, collection: "customers", email: "a@example.com" })
    expect(verifyCustomerJwt(token, secret)).toEqual({ id: 7, sessionVersion: 0 })
  })

  it("returns the sessionVersion claim; missing claim means 0; bad claim is rejected", async () => {
    const v3 = await sign({ id: 7, collection: "customers", sessionVersion: 3 })
    expect(verifyCustomerJwt(v3, secret)).toEqual({ id: 7, sessionVersion: 3 })
    const bad = await sign({ id: 7, collection: "customers", sessionVersion: "3" })
    expect(verifyCustomerJwt(bad, secret)).toBeNull()
  })

  it("rejects a token signed with another secret", async () => {
    const token = await sign({ id: 7, collection: "customers" }, "other-secret-other-secret-other-secret")
    expect(verifyCustomerJwt(token, secret)).toBeNull()
  })

  it("rejects staff tokens (collection users)", async () => {
    const token = await sign({ id: 1, collection: "users" })
    expect(verifyCustomerJwt(token, secret)).toBeNull()
  })

  it("rejects expired tokens", async () => {
    const token = await sign({ id: 7, collection: "customers" }, secret, 60)
    expect(verifyCustomerJwt(token, secret, Math.floor(Date.now() / 1000) + 120)).toBeNull()
  })

  it("rejects tampered payloads and malformed input", async () => {
    const token = await sign({ id: 7, collection: "customers" })
    const [h, , s] = token.split(".")
    const forged = Buffer.from(JSON.stringify({ id: 8, collection: "customers", exp: 9999999999 })).toString("base64url")
    expect(verifyCustomerJwt(`${h}.${forged}.${s}`, secret)).toBeNull()
    expect(verifyCustomerJwt("not-a-jwt", secret)).toBeNull()
    expect(verifyCustomerJwt("a.b.c", secret)).toBeNull()
  })

  it("rejects alg none", () => {
    const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url")
    const token = `${enc({ alg: "none", authVersion: 1 })}.${enc({ id: 7, collection: "customers", exp: 9999999999 })}.`
    expect(verifyCustomerJwt(token, secret)).toBeNull()
  })
})
