/**
 * W4-03c (brief "Secrets" item): scans the CI production build's public assets.
 * Runs in the e2e job after `next build` (cwd apps/web). No secret value is ever printed:
 * failures name the file and the env var / pattern only.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

import { expect, test } from "@playwright/test"

const STATIC_DIR = path.resolve(process.cwd(), ".next/static")

const PATTERNS: Array<[string, RegExp]> = [
  ["stripe secret key", /\b(sk|rk)_(test|live)_[A-Za-z0-9]{10,}/],
  ["stripe webhook secret", /\bwhsec_[A-Za-z0-9+/=]{10,}/],
  ["postgres url", /postgres(ql)?:\/\/[^\s"']+:[^\s"']+@/],
]

const SECRET_ENV = [
  "PAYLOAD_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "CRON_SECRET",
  "RESEND_API_KEY",
  "MUX_TOKEN_ID",
  "MUX_TOKEN_SECRET",
  "MUX_SIGNING_KEY_ID",
  "MUX_SIGNING_KEY_PRIVATE",
  "MUX_WEBHOOK_SECRET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "SENTRY_AUTH_TOKEN",
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
]

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

test.describe("W4-03c public bundle", () => {
  test.skip(!statSync(STATIC_DIR, { throwIfNoEntry: false })?.isDirectory(), "no .next/static (build not in this job)")

  test("no secret patterns or secret env values in .next/static", () => {
    const files = walk(STATIC_DIR).filter((f) => /\.(js|css|json|map|txt|html)$/.test(f))
    expect(files.length).toBeGreaterThan(0)
    const values = SECRET_ENV.map((k) => [k, process.env[k]] as const).filter(
      (e): e is readonly [string, string] => typeof e[1] === "string" && e[1].length >= 8,
    )
    console.log(`[w4-03c] scanned ${files.length} files, ${values.length} secret env values present`)
    const hits: string[] = []
    for (const f of files) {
      const body = readFileSync(f, "utf8")
      const rel = path.relative(STATIC_DIR, f)
      for (const [label, re] of PATTERNS) if (re.test(body)) hits.push(`${rel}: ${label}`)
      for (const [k, v] of values) if (body.includes(v)) hits.push(`${rel}: value of ${k}`)
    }
    expect(hits, hits.join("\n")).toEqual([])
  })

  test("client source maps are not publicly served", async ({ request }) => {
    const maps = walk(STATIC_DIR).filter((f) => f.endsWith(".map"))
    console.log(`[w4-03c] .map files in .next/static: ${maps.length}`)
    const chunks = walk(path.join(STATIC_DIR, "chunks")).filter((f) => f.endsWith(".js"))
    expect(chunks.length).toBeGreaterThan(0)
    const rel = path.relative(STATIC_DIR, chunks[0]!).split(path.sep).join("/")
    const js = await request.get(`/_next/static/${rel}`)
    expect(js.status()).toBe(200)
    const map = await request.get(`/_next/static/${rel}.map`)
    expect(map.status(), `/_next/static/${rel}.map`).not.toBe(200)
  })
})
