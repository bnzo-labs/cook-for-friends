/**
 * W4-01 (signed-events mode only): preloaded into `next start` via
 * NODE_OPTIONS=--require. Redirects the Stripe SDK's HTTPS calls
 * (api.stripe.com) to the local fake (`fake-stripe-server.mjs`). Test-only.
 */
const https = require("node:https")

const port = Number(process.env.E2E_FAKE_STRIPE_PORT || 12111)
const original = https.request

https.request = function patchedRequest(...args) {
  const [first, ...rest] = args
  if (first && typeof first === "object" && !(first instanceof URL)) {
    const host = first.host || first.hostname
    if (host === "api.stripe.com") {
      return original.call(
        this,
        { ...first, host: "127.0.0.1", hostname: "127.0.0.1", port, servername: "api.stripe.com", rejectUnauthorized: false },
        ...rest,
      )
    }
  }
  return original.apply(this, args)
}
