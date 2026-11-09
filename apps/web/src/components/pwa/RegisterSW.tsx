"use client"

import { useEffect } from "react"

/**
 * Registers /sw.js once (scope "/"). Production only: a dev service worker
 * would mask HMR and stale-cache local work. Renders nothing.
 */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return
    if (!("serviceWorker" in navigator)) return
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Non-fatal: the site works fully without a service worker.
    })
  }, [])
  return null
}
