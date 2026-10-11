import { withPayload } from "@payloadcms/next/withPayload"
import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts")

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep sharp as an external package for Payload image resizing
  serverExternalPackages: ["sharp", "@payloadcms/richtext-lexical"],
  experimental: {},
}

export default withNextIntl(withPayload(nextConfig))
