/**
 * env.ts — validated environment variables.
 *
 * Fail fast with a readable error when a required variable is missing.
 * All variables from MASTER_BUILD_SPEC §7 are declared here.
 *
 * NEVER export raw process.env — always use the typed exports from this file.
 */
import { z } from "zod"

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const videoProviderEnum = z.enum(["mux", "bunny"])

const serverSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_URL_DIRECT: z.string().min(1, "DATABASE_URL_DIRECT is required"),

  // Payload
  PAYLOAD_SECRET: z.string().min(32, "PAYLOAD_SECRET must be at least 32 chars"),

  // Stripe
  STRIPE_SECRET_KEY: z.string().startsWith("sk_", "STRIPE_SECRET_KEY must start with sk_"),
  STRIPE_WEBHOOK_SECRET: z
    .string()
    .min(1, "STRIPE_WEBHOOK_SECRET is required")
    .optional()
    .or(z.literal("")),
  STRIPE_TAX_ENABLED: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
  STRIPE_TAX_CODE: z.string().optional(),

  // Resend / Email
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),
  EMAIL_FROM: z.string().email("EMAIL_FROM must be a valid email"),
  EMAIL_REPLY_TO: z.string().email().optional().or(z.literal("")),

  // Cloudflare R2
  R2_ACCOUNT_ID: z.string().min(1, "R2_ACCOUNT_ID is required"),
  R2_ACCESS_KEY_ID: z.string().min(1, "R2_ACCESS_KEY_ID is required"),
  R2_SECRET_ACCESS_KEY: z.string().min(1, "R2_SECRET_ACCESS_KEY is required"),
  R2_BUCKET: z.string().min(1, "R2_BUCKET is required"),
  R2_PUBLIC_URL: z.string().url("R2_PUBLIC_URL must be a valid URL"),

  // Cron
  CRON_SECRET: z.string().min(32, "CRON_SECRET must be at least 32 chars"),

  // Video provider
  VIDEO_PROVIDER: videoProviderEnum.default("mux"),
})
  .merge(
    // Mux — required when VIDEO_PROVIDER=mux
    z.object({
      MUX_TOKEN_ID: z.string().optional(),
      MUX_TOKEN_SECRET: z.string().optional(),
      MUX_SIGNING_KEY_ID: z.string().optional(),
      MUX_SIGNING_KEY_PRIVATE: z.string().optional(),
      MUX_WEBHOOK_SECRET: z.string().optional(),
    }),
  )
  .merge(
    // Bunny — required when VIDEO_PROVIDER=bunny
    z.object({
      BUNNY_LIBRARY_ID: z.string().optional(),
      BUNNY_API_KEY: z.string().optional(),
      BUNNY_TOKEN_KEY: z.string().optional(),
      BUNNY_CDN_HOST: z.string().optional(),
    }),
  )
  .merge(
    // Sentry — optional in development
    z.object({
      SENTRY_DSN: z.string().url().optional().or(z.literal("")),
      SENTRY_AUTH_TOKEN: z.string().optional(),
    }),
  )
  .superRefine((data, ctx) => {
    // Validate video-provider-specific vars
    if (data.VIDEO_PROVIDER === "mux") {
      if (!data.MUX_TOKEN_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MUX_TOKEN_ID is required when VIDEO_PROVIDER=mux",
          path: ["MUX_TOKEN_ID"],
        })
      }
      if (!data.MUX_TOKEN_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MUX_TOKEN_SECRET is required when VIDEO_PROVIDER=mux",
          path: ["MUX_TOKEN_SECRET"],
        })
      }
    } else if (data.VIDEO_PROVIDER === "bunny") {
      if (!data.BUNNY_LIBRARY_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "BUNNY_LIBRARY_ID is required when VIDEO_PROVIDER=bunny",
          path: ["BUNNY_LIBRARY_ID"],
        })
      }
    }
  })

const clientSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url("NEXT_PUBLIC_SITE_URL must be a valid URL"),
})

// ---------------------------------------------------------------------------
// Parse + fail fast
// ---------------------------------------------------------------------------

/**
 * On the server (Node.js), parse the full server schema.
 * On the client, only client-safe vars are available.
 */
function parseEnv() {
  // Skip validation in CI builds — Turbopack workers only forward NEXT_PUBLIC_*
  // vars, so we use NEXT_PUBLIC_SKIP_ENV_VALIDATION instead of SKIP_ENV_VALIDATION.
  if (process.env.NEXT_PUBLIC_SKIP_ENV_VALIDATION === "1") {
    return {
      server: {} as z.infer<typeof serverSchema>,
      client: {} as z.infer<typeof clientSchema>,
    }
  }

  const clientResult = clientSchema.safeParse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  })

  if (!clientResult.success) {
    const messages = clientResult.error.issues
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n")
    throw new Error(`❌ Missing / invalid client env vars:\n${messages}`)
  }

  // Server-side only
  if (typeof window !== "undefined") {
    return { server: {} as z.infer<typeof serverSchema>, client: clientResult.data }
  }

  const serverResult = serverSchema.safeParse(process.env)

  if (!serverResult.success) {
    const messages = serverResult.error.issues
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n")
    throw new Error(`❌ Missing / invalid server env vars:\n${messages}`)
  }

  return { server: serverResult.data, client: clientResult.data }
}

const { server: _server, client: _client } = parseEnv()

// ---------------------------------------------------------------------------
// Typed exports
// ---------------------------------------------------------------------------

export const serverEnv = _server
export const clientEnv = _client

/** Convenience shorthand used by most server code. */
export const env = serverEnv
