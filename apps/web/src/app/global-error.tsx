"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"

/**
 * Root error boundary. Renders outside the locale layout (no i18n provider), so the
 * copy is a static bilingual string. The error is reported via the scrubbed SDK.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="fr">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "4rem 1.5rem", textAlign: "center" }}>
        <main>
          <h1 style={{ fontSize: "1.5rem" }}>Une erreur est survenue / Something went wrong</h1>
          <p>Veuillez réessayer. / Please try again.</p>
          <button type="button" onClick={() => reset()} style={{ padding: "0.75rem 1.5rem", fontSize: "1rem", cursor: "pointer" }}>
            Réessayer / Retry
          </button>
        </main>
      </body>
    </html>
  )
}
