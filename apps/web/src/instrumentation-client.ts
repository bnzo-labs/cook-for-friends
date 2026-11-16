import * as Sentry from "@sentry/nextjs"

import { buildSentryOptions } from "@/lib/observability/init"

// Strict no-op without NEXT_PUBLIC_SENTRY_DSN. Session Replay is never enabled.
const options = buildSentryOptions("client")
if (options) Sentry.init(options)

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
