/**
 * Integration-test helpers (real Postgres).
 *
 * Schema tests run only when TEST_DATABASE_URL points at a THROWAWAY database
 * (e.g. a Neon branch) that already has the migrations applied. Never point it
 * at staging or production. When it is absent (CI today) the suites are skipped.
 */
import type { Payload } from "payload"

export const hasTestDb = Boolean(process.env.TEST_DATABASE_URL)

let cached: Promise<Payload> | null = null

export function getTestPayload(): Promise<Payload> {
  if (!cached) cached = init()
  return cached
}

async function init(): Promise<Payload> {
  const { loadEnv } = await import("payload/node")
  // @next/env skips .env.local when NODE_ENV=test; load it as development, then
  // restore. Never overrides variables already set in the shell.
  const env = process.env as Record<string, string | undefined>
  const nodeEnv = env.NODE_ENV
  env.NODE_ENV = "development"
  try {
    loadEnv()
  } finally {
    env.NODE_ENV = nodeEnv
  }
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  process.env.DATABASE_URL_DIRECT = process.env.TEST_DATABASE_URL
  // Services not exercised by schema tests: non-secret placeholders if unset.
  process.env.VIDEO_PROVIDER = process.env.VIDEO_PROVIDER || "none"
  for (const k of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]) {
    process.env[k] = process.env[k] || "placeholder"
  }
  process.env.R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || "https://example.com"

  const { getPayload } = await import("payload")
  const { default: config } = await import("@/payload.config")
  return getPayload({ config })
}

/** Unique suffix so parallel/re-run suites never collide on unique keys. */
export function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

type AuthCollection = "users" | "customers"

/** Shape `req.user` the way Payload does after authentication. */
export function asUser<T extends { id: number | string }>(doc: T, collection: AuthCollection) {
  return { ...doc, collection } as T & { collection: AuthCollection }
}
