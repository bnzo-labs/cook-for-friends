import { getTranslations } from "next-intl/server"

import { Button } from "@/components/ui/button"
import { Link } from "@/i18n/navigation"
import type { Locale } from "@/modules/_shared"

/** Localized 403: no entitlement. No playback request is ever issued from this view. */
export async function PlayerForbidden({ locale, slug }: { locale: Locale; slug: string }) {
  const t = await getTranslations({ locale, namespace: "portal.player" })
  return (
    <div
      role="alert"
      data-player-forbidden
      className="flex flex-col items-start gap-4 rounded-card border border-border bg-surface p-8"
    >
      <h1 className="font-display text-xl font-semibold text-fg">{t("forbidden_title")}</h1>
      <p className="max-w-prose text-fg-muted">{t("forbidden_body")}</p>
      <Button asChild>
        <Link href={{ pathname: "/courses/[slug]", params: { slug } }}>{t("forbidden_cta")}</Link>
      </Button>
    </div>
  )
}
