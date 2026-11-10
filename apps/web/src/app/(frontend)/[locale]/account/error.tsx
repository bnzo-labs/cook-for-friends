"use client"

import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"

export default function AccountError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("portal.error")
  return (
    <div role="alert" className="flex flex-col items-start gap-4 rounded-card border border-border bg-surface p-8">
      <h1 className="font-display text-xl font-semibold text-fg">{t("title")}</h1>
      <p className="text-fg-muted">{t("body")}</p>
      <Button onClick={reset}>{t("retry")}</Button>
    </div>
  )
}
