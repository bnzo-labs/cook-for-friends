"use client"

import { useState, type FormEvent } from "react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { FormField } from "./FormField"

type Phase = "idle" | "sending" | "sent"
type ErrorKey = "error_email" | "error_rate" | "error_generic" | null

export interface LoginFormProps {
  locale: string
  /** Raw `next` query value; identity validates it again server-side. */
  next?: string
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Magic-link request. Any 200 shows the same "check your inbox" state, whether
 * or not the address has an account (no enumeration).
 */
export function LoginForm({ locale, next }: LoginFormProps) {
  const t = useTranslations("auth.login")
  const [phase, setPhase] = useState<Phase>("idle")
  const [email, setEmail] = useState("")
  const [error, setError] = useState<ErrorKey>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (phase === "sending") return
    const value = email.trim()
    if (!EMAIL_SHAPE.test(value)) {
      setError("error_email")
      return
    }
    setError(null)
    setPhase("sending")
    try {
      const res = await fetch("/api/auth/magic-link/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: value, locale, ...(next ? { next } : {}) }),
      })
      if (res.ok) {
        setPhase("sent")
        return
      }
      setError(res.status === 429 ? "error_rate" : res.status === 400 ? "error_email" : "error_generic")
    } catch {
      setError("error_generic")
    }
    setPhase("idle")
  }

  if (phase === "sent") {
    return (
      <div role="status" data-login-sent className="flex flex-col gap-3 rounded-card border border-border bg-surface p-6 shadow-card">
        <h2 className="font-display text-xl font-semibold text-fg">{t("sent_title")}</h2>
        <p className="text-fg">{t("sent_body", { email: email.trim() })}</p>
        <p className="text-sm text-fg-muted">{t("sent_hint")}</p>
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => {
            setPhase("idle")
            setEmail("")
          }}
        >
          {t("use_other")}
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5 rounded-card border border-border bg-surface p-6 shadow-card">
      <FormField id="login-email" label={t("email_label")} error={error === "error_email" ? t("error_email") : undefined}>
        {(control) => (
          <Input
            {...control}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            placeholder={t("email_placeholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
      </FormField>
      {error === "error_rate" || error === "error_generic" ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {t(error)}
        </p>
      ) : null}
      <Button type="submit" loading={phase === "sending"} className="sm:self-start">
        {phase === "sending" ? t("sending") : t("submit")}
      </Button>
      <p className="text-sm text-fg-muted">{t("no_account_note")}</p>
    </form>
  )
}
