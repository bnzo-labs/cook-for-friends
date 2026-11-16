/**
 * W4-04 — shared Sentry init options. Strict no-op without a DSN: callers must
 * check `sentryEnabled()` (or use `buildSentryOptions()` which returns null).
 * Reads process.env directly (not lib/env.ts): runs in edge + client bundles.
 */
import { scrubBreadcrumbHook, scrubEvent } from "./scrub"

export type SentryRuntime = "server" | "edge" | "client"

export function resolveDsn(runtime: SentryRuntime): string | undefined {
  const dsn = runtime === "client" ? process.env.NEXT_PUBLIC_SENTRY_DSN : process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
  return dsn && dsn.length > 0 ? dsn : undefined
}

export function resolveEnvironment(): string {
  return (
    process.env.SENTRY_ENVIRONMENT ||
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
    process.env.VERCEL_ENV ||
    process.env.NEXT_PUBLIC_VERCEL_ENV ||
    "development"
  )
}

export function resolveRelease(): string | undefined {
  return process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || undefined
}

export function buildSentryOptions(runtime: SentryRuntime) {
  const dsn = resolveDsn(runtime)
  if (!dsn) return null
  const environment = resolveEnvironment()
  return {
    dsn,
    environment,
    release: resolveRelease(),
    sendDefaultPii: false,
    tracesSampleRate: environment === "production" ? 0.1 : 0,
    // Session Replay is intentionally never configured (no replayIntegration).
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumbHook,
  }
}
