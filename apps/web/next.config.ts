import { withPayload } from "@payloadcms/next/withPayload"
import type { NextConfig } from "next"
import { withSentryConfig } from "@sentry/nextjs/config"
import createNextIntlPlugin from "next-intl/plugin"
import { buildSecurityHeaders } from "./src/lib/security-headers"

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts")

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep sharp as an external package for Payload image resizing.
  // @payloadcms/richtext-lexical must stay bundled: its RSC entry imports CSS,
  // which Node cannot load when the package is externalized (W1-02).
  serverExternalPackages: ["sharp"],
  images: {
    // Mux poster images only (CSP img-src mirrors this, see security-headers.ts).
    remotePatterns: [{ protocol: "https", hostname: "image.mux.com" }],
  },
  experimental: {},
  // W4-03a: MASTER §8 headers on every response (pages, API, admin, static).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders({
          siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
          r2PublicUrl: process.env.R2_PUBLIC_URL,
          sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,
          cspMode: process.env.CSP_MODE,
          isProduction: process.env.NODE_ENV === "production",
          isDevelopment: process.env.NODE_ENV === "development",
        }),
      },
    ]
  },
  // NEXT_PUBLIC_* vars are automatically forwarded to all Turbopack workers
  // by Next.js — no explicit env block needed for them.
}

const authToken = process.env.SENTRY_AUTH_TOKEN

// W4-04: source maps upload only with SENTRY_AUTH_TOKEN (Vercel prod build); the SDK
// deletes them after upload so they are never publicly reachable. Everything is a
// no-op when the Sentry env is absent (CI, local).
export default withSentryConfig(withNextIntl(withPayload(nextConfig)), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken,
  silent: true,
  telemetry: false,
  // Same-origin tunnel (CSP connect-src 'self'; adblock-safe). Excluded from proxy.ts.
  tunnelRoute: "/monitoring",
  sourcemaps: { disable: authToken ? false : "disable-upload", deleteSourcemapsAfterUpload: true },
  bundleSizeOptimizations: { excludeDebugStatements: true },
})
