/**
 * Lazy env access for the video module. Read at call time (never at import) so
 * unit tests can change process.env and so importing never needs the secrets.
 * All values here are server-only.
 */
export type VideoProviderSetting = "mux" | "bunny" | "fake" | "none"

export function videoProviderSetting(): VideoProviderSetting {
  const v = process.env.VIDEO_PROVIDER
  return v === "mux" || v === "bunny" || v === "fake" ? v : "none"
}

let warnedProdFake = false

/**
 * Fake adapter is non-prod only: provider=fake AND explicit opt-in (env.ts also fails boot otherwise).
 * W4-03b (W3-10 L-5): never on the Vercel production deployment, even with the opt-in
 * (a copied staging env). Video is then unavailable (provider null) instead of fake.
 */
export function fakeEnabled(): boolean {
  if (videoProviderSetting() !== "fake" || process.env.VIDEO_FAKE_ALLOWED !== "true") return false
  if (process.env.VERCEL_ENV === "production") {
    if (!warnedProdFake) {
      warnedProdFake = true
      console.error(JSON.stringify({ event: "video.fake_refused_in_production", level: "error" }))
    }
    return false
  }
  return true
}

export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL
  if (!raw) throw new Error("NEXT_PUBLIC_SITE_URL is not set")
  return raw.replace(/\/+$/, "")
}

export function payloadSecret(): string {
  const s = process.env.PAYLOAD_SECRET
  if (!s) throw new Error("PAYLOAD_SECRET is not set")
  return s
}

export type MuxConfig = {
  tokenId: string
  tokenSecret: string
  signingKeyId: string
  signingKeyPrivate: string
  webhookSecret: string | null
}

export function muxConfig(): MuxConfig {
  const need = (k: string): string => {
    const v = process.env[k]
    if (!v) throw new Error(`${k} is not set`)
    return v
  }
  return {
    tokenId: need("MUX_TOKEN_ID"),
    tokenSecret: need("MUX_TOKEN_SECRET"),
    signingKeyId: need("MUX_SIGNING_KEY_ID"),
    signingKeyPrivate: need("MUX_SIGNING_KEY_PRIVATE"),
    webhookSecret: process.env.MUX_WEBHOOK_SECRET || null,
  }
}
