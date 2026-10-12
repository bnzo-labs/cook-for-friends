import { withPayload } from "@payloadcms/next/withPayload"
import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts")

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep sharp as an external package for Payload image resizing
  serverExternalPackages: ["sharp", "@payloadcms/richtext-lexical"],
  experimental: {},
  // Explicitly forward these env vars to all worker processes (Turbopack workers
  // don't inherit workflow-level env by default).
  env: {
    SKIP_ENV_VALIDATION: process.env.SKIP_ENV_VALIDATION ?? "0",
    // NEXT_PUBLIC_* are already inlined by Next.js — no need to list them here.
  },
}

export default withNextIntl(withPayload(nextConfig))
