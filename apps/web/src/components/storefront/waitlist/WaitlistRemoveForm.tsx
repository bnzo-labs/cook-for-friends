"use client"

import { useTranslations } from "next-intl"
import { useRef, useState } from "react"

import { Button } from "@/components/ui/button"

type Phase = "idle" | "submitting" | "done" | "invalid" | "error"

/** Confirm-only: the page load never changes state; this click POSTs the token. */
export function WaitlistRemoveForm({ token }: { token: string | null }) {
  const t = useTranslations("storefront.waitlist.remove")
  const [phase, setPhase] = useState<Phase>(token ? "idle" : "invalid")
  const inFlight = useRef(false)

  async function confirm() {
    if (!token || inFlight.current) return
    inFlight.current = true
    setPhase("submitting")
    // Strip the token from the address bar and history right away.
    window.history.replaceState(window.history.state, "", window.location.pathname)
    try {
      const res = await fetch("/api/waitlist/remove", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ token }),
      })
      setPhase(res.ok ? "done" : res.status === 400 ? "invalid" : "error")
    } catch {
      setPhase("error")
    }
    inFlight.current = false
  }

  if (phase === "done") {
    return (
      <p role="status" data-waitlist-removed className="rounded-card border border-border bg-surface p-6 text-fg shadow-card">
        {t("done")}
      </p>
    )
  }
  if (phase === "invalid") {
    return (
      <div role="alert" data-waitlist-remove-invalid className="flex flex-col gap-2 rounded-card border border-border bg-surface p-6 shadow-card">
        <h2 className="font-display text-xl font-semibold text-fg">{t("invalid_title")}</h2>
        <p className="text-fg-muted">{t("invalid_body")}</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-6 shadow-card">
      <Button onClick={confirm} loading={phase === "submitting"} size="lg" className="self-start" data-waitlist-remove-submit>
        {t("submit")}
      </Button>
      {phase === "error" ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {t("error_generic")}
        </p>
      ) : null}
    </div>
  )
}
