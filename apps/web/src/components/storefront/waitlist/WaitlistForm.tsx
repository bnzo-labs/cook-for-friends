"use client"

import { useLocale, useTranslations } from "next-intl"
import { useId, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Locale } from "@/modules/_shared"

export interface WaitlistFormProps {
  sessionId: string
  /** Human date of the session, for the accessible names. */
  dateLabel: string
  /** Prefilled from the signed-in customer (server-side read only). */
  defaultEmail: string
}

type Phase = "idle" | "open" | "sending" | "done"
type FieldError = "invalid" | "rate_limited" | "generic" | null

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Inline waitlist form for a full session. Always shows the same confirmation
 * (D10): no reservation, no hint whether the address was already on the list.
 */
export function WaitlistForm({ sessionId, dateLabel, defaultEmail }: WaitlistFormProps) {
  const t = useTranslations("storefront.waitlist")
  const locale = useLocale() as Locale
  const uid = useId()
  const panelId = `${uid}-panel`
  const inputId = `${uid}-email`
  const errorId = `${uid}-error`
  const [phase, setPhase] = useState<Phase>("idle")
  const [email, setEmail] = useState(defaultEmail)
  const [error, setError] = useState<FieldError>(null)
  const inFlight = useRef(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return
    const value = email.trim()
    if (!EMAIL_SHAPE.test(value)) {
      setError("invalid")
      return
    }
    inFlight.current = true
    setError(null)
    setPhase("sending")
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ sessionId, email: value, locale }),
      })
      if (res.ok) {
        setPhase("done")
        return
      }
      setError(res.status === 429 ? "rate_limited" : res.status === 400 ? "invalid" : "generic")
    } catch {
      setError("generic")
    }
    setPhase("open")
    inFlight.current = false
  }

  if (phase === "done") {
    return (
      <p role="status" data-waitlist-confirmation className="max-w-xs text-sm font-medium text-fg sm:text-right">
        {t("confirmation")}
      </p>
    )
  }

  const expanded = phase !== "idle"
  return (
    <div className="flex w-full flex-col gap-3 sm:items-end" data-waitlist>
      <Button
        variant="secondary"
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-label={t("cta_aria", { date: dateLabel })}
        data-waitlist-cta
        onClick={() => setPhase(expanded ? "idle" : "open")}
      >
        {t("cta")}
      </Button>
      {expanded ? (
        <form id={panelId} noValidate onSubmit={submit} className="flex w-full max-w-sm flex-col gap-2 sm:items-end" data-waitlist-form>
          <label htmlFor={inputId} className="text-sm font-medium text-fg sm:self-start">
            {t("email_label")}
          </label>
          <Input
            id={inputId}
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            invalid={error === "invalid"}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="text-sm text-fg-muted sm:self-start">{t("help")}</p>
          {error ? (
            <p id={errorId} role="alert" className="text-sm font-medium text-danger sm:self-start">
              {t(`error.${error}`)}
            </p>
          ) : null}
          <Button type="submit" loading={phase === "sending"} data-waitlist-submit>
            {t("submit")}
          </Button>
        </form>
      ) : null}
    </div>
  )
}
