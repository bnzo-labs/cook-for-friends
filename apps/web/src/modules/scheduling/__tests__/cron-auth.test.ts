import { NextRequest } from "next/server"
import { afterEach, describe, expect, it } from "vitest"

import { GET } from "../../../app/api/cron/reminders/route"

describe("GET /api/cron/reminders auth (no database)", () => {
  const prior = process.env.CRON_SECRET
  afterEach(() => {
    if (prior === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = prior
  })
  const call = (headers: Record<string, string> = {}) => GET(new NextRequest("http://localhost:3000/api/cron/reminders", { headers }))

  it("401 without bearer, with a wrong bearer, or when CRON_SECRET is unset", async () => {
    process.env.CRON_SECRET = "s3cret-w305"
    expect((await call()).status).toBe(401)
    expect((await call({ authorization: "Bearer nope" })).status).toBe(401)
    delete process.env.CRON_SECRET
    expect((await call({ authorization: "Bearer undefined" })).status).toBe(401)
  })
})
