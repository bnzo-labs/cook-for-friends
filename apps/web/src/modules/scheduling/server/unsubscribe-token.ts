import { createHmac, timingSafeEqual } from "node:crypto"

/** W4-08: signed single-purpose token for the waitlist "remove me" link. No PII: entry id + expiry only. */
export const WAITLIST_REMOVE_TTL_SECONDS = 90 * 24 * 3600

const PURPOSE = "waitlist-remove"

function secret(): string {
  const s = process.env.PAYLOAD_SECRET
  if (!s) throw new Error("PAYLOAD_SECRET is not set")
  return s
}

const mac = (id: number, exp: number, key: string): string =>
  createHmac("sha256", key).update(`${PURPOSE}|${id}|${exp}`).digest("base64url")

/** `<entryId>.<expUnixSec>.<hmac b64url>` */
export function signWaitlistRemoveToken(entryId: number, now: Date = new Date(), ttlSeconds = WAITLIST_REMOVE_TTL_SECONDS): string {
  const exp = Math.floor(now.getTime() / 1000) + ttlSeconds
  return `${entryId}.${exp}.${mac(entryId, exp, secret())}`
}

/** Returns the entry id, or null for any malformed / tampered / expired token (no reason leaked). */
export function verifyWaitlistRemoveToken(token: unknown, now: Date = new Date()): number | null {
  if (typeof token !== "string" || token.length > 200) return null
  const parts = token.split(".")
  if (parts.length !== 3) return null
  const [idRaw, expRaw, sig] = parts as [string, string, string]
  if (!/^[1-9]\d{0,9}$/.test(idRaw) || !/^\d{1,12}$/.test(expRaw)) return null
  const id = Number(idRaw)
  const exp = Number(expRaw)
  const expected = Buffer.from(mac(id, exp, secret()))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  if (exp <= Math.floor(now.getTime() / 1000)) return null
  return id
}
