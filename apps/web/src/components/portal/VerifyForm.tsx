"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Link } from "@/i18n/navigation"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Phase = "idle" | "submitting" | "invalid" | "error"

export interface VerifyFormProps {
  /** Token from the query string, or null when missing. Never logged or sent anywhere but the verify route. */
  token: string | null
}

/**
 * The page load never consumes the token (mail scanners prefetch links). Only
 * this click POSTs it; the 303 sets the cookie and we land on `next`.
 */
export function VerifyForm({ token }: VerifyFormProps) {
  const t = useTranslations("auth.verify")
  const [phase, setPhase] = useState<Phase>(token ? "idle" : "invalid")

  async function confirm() {
    if (!token || phase === "submitting") return
    setPhase("submitting")
    // Strip the token from the address bar and history right away.
    window.history.replaceState(window.history.state, "", window.location.pathname)
    try {
      const res = await fetch("/api/auth/magic-link/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
        credentials: "same-origin",
      })
      if (res.redirected && res.ok) {
        window.location.replace(res.url)
        return
      }
      setPhase(res.status === 400 ? "invalid" : "error")
    } catch {
      setPhase("error")
    }
  }

  if (phase === "invalid") {
    return (
      <div role="alert" data-verify-invalid className="flex flex-col gap-3 rounded-card border border-border bg-surface p-6 shadow-card">
        <h2 className="font-display text-xl font-semibold text-fg">{t("invalid_title")}</h2>
        <p className="text-fg-muted">{t("invalid_body")}</p>
        <Link href="/auth/login" className={cn(buttonVariants({ variant: "primary" }), "self-start")}>
          {t("request_new")}
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-6 shadow-card">
      <Button onClick={confirm} loading={phase === "submitting"} size="lg" className="self-start" data-verify-submit>
        {phase === "submitting" ? t("submitting") : t("submit")}
      </Button>
      {phase === "error" ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {t("error_generic")}
        </p>
      ) : null}
    </div>
  )
}
