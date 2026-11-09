import { randomInt } from "node:crypto"

/** Crockford base32: no I, L, O, U. */
export const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
export const CODE_LENGTH = 10

export function generateVerificationCode(): string {
  let out = ""
  for (let i = 0; i < CODE_LENGTH; i++) out += CROCKFORD[randomInt(CROCKFORD.length)]
  return out
}

/**
 * User-typed code → canonical form: uppercase, drop spaces/hyphens,
 * O→0, I/L→1 (Crockford decoding). Returns null when the result cannot be a code.
 */
export function normalizeVerificationCode(raw: string): string | null {
  const code = raw
    .toUpperCase()
    .replace(/[\s-]+/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
  return new RegExp(`^[${CROCKFORD}]{${CODE_LENGTH}}$`).test(code) ? code : null
}
