/**
 * CI-only: creates the extra rows the gated Playwright specs need and exports
 * their ids as E2E_* variables. Run AFTER `pnpm seed` against the throwaway CI
 * Neon branch only:  pnpm payload run test/e2e-seed.ts
 *
 * Output: appends `E2E_*=value` lines to $GITHUB_ENV (or stdout when unset).
 * Never prints credentials. Fictional data, @example.com only.
 */
import { appendFileSync } from "node:fs"
import { getPayload } from "payload"

import config from "../src/payload.config"
import { makeCourse, makeLesson } from "./fixtures"
import { makeNamedCustomer, makePaidOrder, makeSeat } from "./portal-fixtures"

const HOUR = 3_600_000

const payload = await getPayload({ config })
try {
  // W2-09 / W3-05: a session that started 2 h ago (attendance control is enabled from the
  // session day) with one confirmed seat so the Participants table has a row.
  const inPerson = await makeCourse(payload, "in_person")
  const startsAt = new Date(Date.now() - 2 * HOUR)
  const session = await payload.create({
    collection: "sessions",
    overrideAccess: true,
    data: {
      course: inPerson.id,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 5 * HOUR).toISOString(),
      capacity: 4,
      status: "scheduled",
    },
  })
  const customer = await makeNamedCustomer(payload, { firstName: "Ci", lastName: "Attendee" })
  const order = await makePaidOrder(payload, customer.id, inPerson, { sessionId: session.id })
  await makeSeat(payload, {
    sessionId: session.id,
    customerId: customer.id,
    orderId: order.id,
    index: 0,
    attendeeName: "Ci Attendee",
  })

  // W3-02: a lesson with no video yet (fake upload runs in the spec).
  const online = await makeCourse(payload, "online")
  const lesson = await makeLesson(payload, online.id, 0)

  // W3-04: a pending comment on that lesson.
  const author = await makeNamedCustomer(payload, { firstName: "Ci", lastName: "Commenter" })
  const comment = await payload.create({
    collection: "comments",
    overrideAccess: true,
    data: { lesson: lesson.id, customer: author.id, body: "CI pending comment", status: "pending" },
  })

  const lines = [
    `E2E_STAFF_EMAIL=admin@example.com`,
    `E2E_SESSION_ID=${session.id}`,
    `E2E_LESSON_ID=${lesson.id}`,
    `E2E_COMMENT_ID=${comment.id}`,
  ]
  const out = process.env.GITHUB_ENV
  if (out) appendFileSync(out, `${lines.join("\n")}\n`)
  else console.log(lines.join("\n"))
} catch (err) {
  payload.logger.error({ err }, "e2e-seed failed")
  process.exitCode = 1
} finally {
  await payload.destroy()
}
