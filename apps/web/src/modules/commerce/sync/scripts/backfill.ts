/**
 * Backfill the Stripe catalog from Payload (idempotent).
 * Run: pnpm payload run src/modules/commerce/sync/scripts/backfill.ts
 * Syncs every published course and every active, non-personal discount code.
 */
import { getPayload, type Payload } from "payload"

import config from "../../../../payload.config"

import { syncCourseToStripe } from "../course"
import { syncDiscountToStripe } from "../discount"

async function main(payload: Payload): Promise<number> {
  let failed = 0

  const courses = await payload.find({
    collection: "courses",
    where: { _status: { equals: "published" } },
    limit: 1000,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  for (const c of courses.docs) {
    const r = await syncCourseToStripe(c.id)
    if (!r.ok) failed += 1
    console.log(`course ${c.id}: ${r.ok ? `synced ${r.data.productId} ${r.data.priceId}` : JSON.stringify(r.error)}`)
  }

  const codes = await payload.find({
    collection: "discount-codes",
    where: { active: { equals: true } },
    limit: 1000,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  for (const dc of codes.docs) {
    const r = await syncDiscountToStripe(dc.id)
    if (!r.ok) failed += 1
    console.log(`discount ${dc.id}: ${r.ok ? r.data.status : JSON.stringify(r.error)}`)
  }

  console.log(`backfill done: ${courses.docs.length} courses, ${codes.docs.length} discount codes, ${failed} failed`)
  return failed
}

// Top-level await: `payload run` exits as soon as the module import settles.
const payload = await getPayload({ config })
try {
  process.exitCode = (await main(payload)) ? 1 : 0
} catch (err) {
  console.error(err)
  process.exitCode = 1
} finally {
  await payload.destroy()
}
