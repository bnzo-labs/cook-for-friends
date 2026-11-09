import { describe, expect, it, vi } from "vitest"

// env.ts parses process.env at import; skip that, we only test the exported schema.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SKIP_ENV_VALIDATION = "1"
})

import { serverSchema } from "@/lib/env"

const base = {
  DATABASE_URL: "postgres://x",
  DATABASE_URL_DIRECT: "postgres://x",
  PAYLOAD_SECRET: "a".repeat(32),
  STRIPE_SECRET_KEY: "sk_test_x",
  RESEND_API_KEY: "re_x",
  EMAIL_FROM: "a@example.com",
  R2_ACCOUNT_ID: "acc",
  R2_ACCESS_KEY_ID: "k",
  R2_SECRET_ACCESS_KEY: "s",
  R2_BUCKET: "b",
  R2_PUBLIC_URL: "https://example.com",
  CRON_SECRET: "c".repeat(32),
}
const mux = {
  MUX_TOKEN_ID: "id",
  MUX_TOKEN_SECRET: "secret",
  MUX_SIGNING_KEY_ID: "kid",
  MUX_SIGNING_KEY_PRIVATE: "priv",
}

describe("env video provider", () => {
  it("none (default) needs no video vars", () => {
    const r = serverSchema.safeParse(base)
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.VIDEO_PROVIDER).toBe("none")
      expect(r.data.VIDEO_FAKE_ALLOWED).toBe(false)
      expect(r.data.SEO_INDEXABLE_HOSTS).toBe("")
    }
  })

  it("fake without VIDEO_FAKE_ALLOWED fails", () => {
    const r = serverSchema.safeParse({ ...base, VIDEO_PROVIDER: "fake" })
    expect(r.success).toBe(false)
  })

  it("fake with VIDEO_FAKE_ALLOWED=true passes", () => {
    const r = serverSchema.safeParse({
      ...base,
      VIDEO_PROVIDER: "fake",
      VIDEO_FAKE_ALLOWED: "true",
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.VIDEO_FAKE_ALLOWED).toBe(true)
  })

  it("mux without keys fails, listing all four", () => {
    const r = serverSchema.safeParse({ ...base, VIDEO_PROVIDER: "mux" })
    expect(r.success).toBe(false)
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path[0])
      expect(paths).toEqual(
        expect.arrayContaining(Object.keys(mux)),
      )
    }
  })

  it("mux with keys passes without webhook secret", () => {
    const r = serverSchema.safeParse({ ...base, VIDEO_PROVIDER: "mux", ...mux })
    expect(r.success).toBe(true)
  })

  it("rejects unknown provider", () => {
    expect(serverSchema.safeParse({ ...base, VIDEO_PROVIDER: "vimeo" }).success).toBe(false)
  })
})
