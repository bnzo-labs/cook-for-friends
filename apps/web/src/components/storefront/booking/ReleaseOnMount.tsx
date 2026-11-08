"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"

type Status = "releasing" | "released" | "failed"

/** Cancelled page: releases the cart's holds once on mount (CCR-W2-4). */
export function ReleaseOnMount() {
  const t = useTranslations("storefront.booking")
  const [status, setStatus] = useState<Status>("releasing")
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true
    fetch("/api/checkout/release", { method: "POST" })
      .then((res) => setStatus(res.ok ? "released" : "failed"))
      .catch(() => setStatus("failed"))
  }, [])

  const text =
    status === "releasing" ? t("cancelled_releasing") : status === "released" ? t("cancelled_released") : t("cancelled_release_failed")

  return (
    <p role="status" aria-live="polite" className="text-lg text-fg-muted">
      {text}
    </p>
  )
}
