/**
 * Single read point for SEO indexability (W3-06).
 *
 * Canonical origin = NEXT_PUBLIC_SITE_URL (domain late-bound, D8). Nothing is
 * indexable unless that host is listed in SEO_INDEXABLE_HOSTS (comma separated,
 * empty default). Staging (*.vercel.app) therefore stays noindex.
 *
 * TODO(W3-00): SEO_INDEXABLE_HOSTS is read from process.env until W3-00 adds it
 * to lib/env.ts — one-line swap inside `readAllowList`.
 */

const FALLBACK_ORIGIN = "http://localhost:3000"

function readAllowList(): string[] {
  return (process.env.SEO_INDEXABLE_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h.length > 0)
}

/** Canonical origin without trailing slash. */
export function siteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_ORIGIN
  try {
    return new URL(raw).origin
  } catch {
    return FALLBACK_ORIGIN
  }
}

/** Absolute URL for a site path (or pass-through for an absolute URL). */
export function absoluteUrl(pathOrUrl: string): string {
  return new URL(pathOrUrl, `${siteOrigin()}/`).toString()
}

/** True only when the canonical host is explicitly allow-listed. */
export function isIndexable(): boolean {
  const host = new URL(siteOrigin()).host.toLowerCase()
  const hostname = new URL(siteOrigin()).hostname.toLowerCase()
  const allow = readAllowList()
  return allow.includes(host) || allow.includes(hostname)
}
