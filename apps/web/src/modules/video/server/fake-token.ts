import { createHmac, timingSafeEqual } from "node:crypto"

/** sig = HMAC-SHA256(secret, `asset|exp|viewer`), hex. */
export function signFake(secret: string, i: { assetId: string; exp: number; viewerId: string }): string {
  return createHmac("sha256", secret).update(`${i.assetId}|${i.exp}|${i.viewerId}`).digest("hex")
}

export type FakeVerifyResult = { ok: true } | { ok: false; reason: "malformed" | "expired" | "bad_signature" }

export function verifyFake(
  secret: string,
  i: { assetId: string; exp: number; viewerId: string; sig: string },
  nowMs: number = Date.now(),
): FakeVerifyResult {
  if (!i.assetId || !i.viewerId || !Number.isInteger(i.exp) || !/^[0-9a-f]{64}$/.test(i.sig)) {
    return { ok: false, reason: "malformed" }
  }
  const expected = Buffer.from(signFake(secret, i), "hex")
  const given = Buffer.from(i.sig, "hex")
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "bad_signature" }
  }
  if (i.exp * 1000 <= nowMs) return { ok: false, reason: "expired" }
  return { ok: true }
}
