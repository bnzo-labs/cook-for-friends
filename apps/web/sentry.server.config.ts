import * as Sentry from "@sentry/nextjs"

import { buildSentryOptions } from "@/lib/observability/init"

// Strict no-op without a DSN: Sentry.init is never called.
const options = buildSentryOptions("server")
if (options) Sentry.init(options)
