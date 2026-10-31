import type { Payload } from "payload"
import { beforeAll, describe, expect, it } from "vitest"

import { getTestPayload, hasTestDb, uid } from "../../../../test/integration"

/**
 * F1 regression: `courses.status` (lifecycle: draft|published|archived) must not
 * share a Postgres enum with the drafts `_status` (draft|published).
 */
describe.skipIf(!hasTestDb)("courses lifecycle status (integration)", { timeout: 30_000 }, () => {
  let payload: Payload
  beforeAll(async () => {
    payload = await getTestPayload()
  }, 60_000)

  const base = (k: string) => ({
    title: `Cours ${k}`,
    slug: `cours-${k}`,
    summary: `Résumé ${k}`,
    format: "online" as const,
    price: 5000,
    level: "beginner" as const,
  })

  it("saves status 'archived' and reads it back", async () => {
    const k = uid()
    const doc = await payload.create({
      collection: "courses",
      locale: "fr",
      overrideAccess: true,
      data: { ...base(k), status: "archived", _status: "published" },
    })
    const read = await payload.findByID({ collection: "courses", id: doc.id, locale: "fr", overrideAccess: true, depth: 0 })
    expect(read.status).toBe("archived")
    expect(read._status).toBe("published")
  })

  it("moves published -> archived on update", async () => {
    const k = uid()
    const doc = await payload.create({
      collection: "courses",
      locale: "fr",
      overrideAccess: true,
      data: { ...base(k), status: "published", _status: "published" },
    })
    const updated = await payload.update({
      collection: "courses",
      id: doc.id,
      locale: "fr",
      overrideAccess: true,
      data: { status: "archived" },
    })
    expect(updated.status).toBe("archived")
  })

  it("drafts still work (_status draft, then publish)", async () => {
    const k = uid()
    const doc = await payload.create({
      collection: "courses",
      locale: "fr",
      overrideAccess: true,
      draft: true,
      data: { ...base(k), status: "draft", _status: "draft" },
    })
    expect(doc._status).toBe("draft")
    const published = await payload.update({
      collection: "courses",
      id: doc.id,
      locale: "fr",
      overrideAccess: true,
      data: { _status: "published", status: "published" },
    })
    expect(published._status).toBe("published")
    expect(published.status).toBe("published")
  })

  it("rejects an unknown lifecycle status", async () => {
    await expect(
      payload.create({
        collection: "courses",
        locale: "fr",
        overrideAccess: true,
        data: { ...base(uid()), status: "bogus" as never },
      }),
    ).rejects.toThrow()
  })
})
