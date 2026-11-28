/**
 * W2-12 staging acceptance fixtures (idempotent). Run with a COPY of the target env:
 *
 *   set -a; . apps/web/.env.staging; set +a
 *   NODE_ENV=production pnpm payload run test/staging-fixtures.ts <cmd> [arg]
 *
 * NODE_ENV=production is mandatory: dev mode makes the Postgres adapter push the
 * schema (rewrites enums on the shared Neon DB). Never point at Neon production.
 *
 * Commands: up | status | query "<SELECT ...>" | expire-hold <id> | down
 * State (ids, temp staff creds) goes to W2_12_STATE (default: ./.w2-12-state.json, gitignored by
 * convention; keep it outside the repo). Secrets are never printed.
 */
import { randomBytes } from "node:crypto"
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { sql } from "@payloadcms/db-postgres/drizzle"
import { getPayload, type Payload } from "payload"
import Stripe from "stripe"

import config from "../src/payload.config"

const STATE = process.env.W2_12_STATE ?? ".w2-12-state.json"
const SLUG = { fr: "test-atelier-w2", en: "test-atelier-w2-en" }
const STAFF_EMAIL = "w2-12-staff@example.com"

type State = { courseId: number; sessions: { cap4: number; cap1: number }; staffId: number; staffEmail: string; staffPassword: string }

const readState = (): State | null => (existsSync(STATE) ? (JSON.parse(readFileSync(STATE, "utf8")) as State) : null)
const writeState = (s: State) => {
  writeFileSync(STATE, JSON.stringify(s), { mode: 0o600 })
  chmodSync(STATE, 0o600)
}

function assertSafeTarget(): void {
  if (process.env.NODE_ENV !== "production") throw new Error("run with NODE_ENV=production (no schema push)")
  if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) throw new Error("Stripe test key required")
}

const rich = (t: string) => ({
  root: {
    type: "root", format: "", indent: 0, version: 1, direction: "ltr",
    children: [{ type: "paragraph", format: "", indent: 0, version: 1, direction: "ltr", children: [{ type: "text", text: t, version: 1, format: 0, detail: 0, mode: "normal", style: "" }] }],
  },
})

async function findCourse(p: Payload): Promise<number | null> {
  const r = await p.find({ collection: "courses", where: { slug: { equals: SLUG.fr } }, locale: "fr", limit: 1, depth: 0, draft: true, overrideAccess: true })
  return (r.docs[0]?.id as number | undefined) ?? null
}

async function startsIn(days: number, hour: number) {
  const s = new Date()
  s.setUTCDate(s.getUTCDate() + days)
  s.setUTCHours(hour, 0, 0, 0)
  return { startsAt: s.toISOString(), endsAt: new Date(s.getTime() + 2 * 3600_000).toISOString() }
}

async function mkSession(p: Payload, course: number, days: number, capacity: number): Promise<number> {
  const doc = await p.create({
    collection: "sessions", locale: "fr", overrideAccess: true,
    data: { course, ...(await startsIn(days, 22)), capacity, status: "scheduled", location: { name: "Atelier test", address: "1 rue Exemple", city: "Montréal", postalCode: "H2X 0A0" } },
  })
  await p.update({ collection: "sessions", id: doc.id, locale: "en", overrideAccess: true, data: { location: { name: "Test studio" } } })
  return doc.id as number
}

async function up(p: Payload): Promise<void> {
  const settings = await p.findGlobal({ slug: "site-settings", overrideAccess: true })
  if (settings.maxSeatsPerPurchase !== 4) throw new Error(`site-settings.maxSeatsPerPurchase=${String(settings.maxSeatsPerPurchase)}, expected 4`)

  let courseId = await findCourse(p)
  if (!courseId) {
    const doc = await p.create({
      collection: "courses", locale: "fr", overrideAccess: true,
      data: { format: "in_person", level: "beginner", price: 1000, status: "published", _status: "published", durationMinutes: 120, title: "[TEST] Atelier W2", slug: SLUG.fr, summary: "Atelier de test W2-12", description: rich("Test"), seo: { title: "[TEST] Atelier W2", description: "Test" } },
    } as never)
    courseId = doc.id as number
    await p.update({ collection: "courses", id: courseId, locale: "en", overrideAccess: true, data: { title: "[TEST] Atelier W2", slug: SLUG.en, summary: "W2-12 test workshop", description: rich("Test"), _status: "published", seo: { title: "[TEST] Atelier W2", description: "Test" } } } as never)
  }
  const sess = await p.find({ collection: "sessions", where: { course: { equals: courseId } }, sort: "capacity", limit: 10, depth: 0, overrideAccess: true })
  const have = (c: number) => sess.docs.find((s) => s.capacity === c)?.id as number | undefined
  const cap4 = have(4) ?? (await mkSession(p, courseId, 20, 4))
  const cap1 = have(1) ?? (await mkSession(p, courseId, 21, 1))

  const prev = readState()
  const password = prev?.staffPassword ?? randomBytes(24).toString("base64url")
  const found = await p.find({ collection: "users", where: { email: { equals: STAFF_EMAIL } }, limit: 1, depth: 0, overrideAccess: true })
  let staffId = found.docs[0]?.id as number | undefined
  if (staffId) await p.update({ collection: "users", id: staffId, data: { password, role: "staff" }, overrideAccess: true })
  else staffId = (await p.create({ collection: "users", data: { email: STAFF_EMAIL, name: "W2-12 temp", role: "staff", password }, overrideAccess: true })).id as number
  writeState({ courseId, sessions: { cap4, cap1 }, staffId, staffEmail: STAFF_EMAIL, staffPassword: password })
  console.log(JSON.stringify({ courseId, sessions: { cap4, cap1 }, staffId, settingsMaxSeats: 4 }))
}

async function query(p: Payload, q: string): Promise<void> {
  if (!/^\s*select\s/i.test(q) || /;\s*\S/.test(q)) throw new Error("single SELECT only")
  const db = (p.db as unknown as { drizzle: { execute: (s: unknown) => Promise<{ rows: unknown[] }> } }).drizzle
  const r = await db.execute(sql.raw(q))
  console.log(JSON.stringify(r.rows))
}

async function expireHold(p: Payload, id: string): Promise<void> {
  const db = (p.db as unknown as { drizzle: { execute: (s: unknown) => Promise<{ rows: unknown[] }> } }).drizzle
  const r = await db.execute(sql`UPDATE seat_holds SET expires_at = now() - interval '1 minute' WHERE id = ${Number(id)} AND status = 'active' RETURNING id`)
  console.log(JSON.stringify({ forced: r.rows.length }))
}

async function down(p: Payload): Promise<void> {
  const st = readState()
  const courseId = st?.courseId ?? (await findCourse(p))
  if (courseId) {
    await p.update({ collection: "courses", id: courseId, overrideAccess: true, data: { status: "archived" } } as never)
    const c = await p.findByID({ collection: "courses", id: courseId, depth: 0, overrideAccess: true })
    if (c.stripeProductId) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
      await stripe.products.update(c.stripeProductId, { active: false })
    }
  }
  const staff = await p.find({ collection: "users", where: { email: { equals: STAFF_EMAIL } }, limit: 5, depth: 0, overrideAccess: true })
  for (const u of staff.docs) await p.delete({ collection: "users", id: u.id, overrideAccess: true })
  if (existsSync(STATE)) rmSync(STATE)
  console.log(JSON.stringify({ archived: courseId, staffDeleted: staff.docs.length }))
}

async function main(): Promise<void> {
  assertSafeTarget()
  const [cmd, arg] = process.argv.slice(2).filter((a) => !a.endsWith("staging-fixtures.ts"))
  const p = await getPayload({ config })
  if (cmd === "up") await up(p)
  else if (cmd === "query") await query(p, arg ?? "")
  else if (cmd === "expire-hold") await expireHold(p, arg ?? "")
  else if (cmd === "down") await down(p)
  else if (cmd === "status") console.log(JSON.stringify({ state: readState() ? "present" : "absent", course: await findCourse(p) }))
  else throw new Error("usage: up | status | query <SELECT> | expire-hold <id> | down")
  process.exit(0)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
