import { afterEach, describe, expect, it, vi } from "vitest"

import { buildSentryOptions } from "../init"

afterEach(() => vi.unstubAllEnvs())

describe("buildSentryOptions", () => {
  it("returns null (no-op, no Sentry.init, no network) without a DSN", () => {
    vi.stubEnv("SENTRY_DSN", "")
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "")
    expect(buildSentryOptions("server")).toBeNull()
    expect(buildSentryOptions("edge")).toBeNull()
    expect(buildSentryOptions("client")).toBeNull()
  })

  it("is privacy-safe when configured", () => {
    vi.stubEnv("SENTRY_DSN", "https://k@o1.ingest.sentry.io/1")
    vi.stubEnv("SENTRY_ENVIRONMENT", "production")
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abc")
    const o = buildSentryOptions("server")!
    expect(o.sendDefaultPii).toBe(false)
    expect(o.tracesSampleRate).toBe(0.1)
    expect(o.environment).toBe("production")
    expect(o.release).toBe("abc")
    expect(o).not.toHaveProperty("integrations")
    expect(o).not.toHaveProperty("replaysSessionSampleRate")
    expect(typeof o.beforeSend).toBe("function")
    expect(typeof o.beforeSendTransaction).toBe("function")
    expect(typeof o.beforeBreadcrumb).toBe("function")
  })

  it("client reads only the public DSN; non-prod samples no traces", () => {
    vi.stubEnv("SENTRY_DSN", "https://k@o1.ingest.sentry.io/1")
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "")
    expect(buildSentryOptions("client")).toBeNull()
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://k@o1.ingest.sentry.io/1")
    vi.stubEnv("SENTRY_ENVIRONMENT", "preview")
    expect(buildSentryOptions("client")!.tracesSampleRate).toBe(0)
  })
})
