import { ArrowSquareOut } from "@phosphor-icons/react/dist/ssr"
import { getTranslations } from "next-intl/server"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Locale } from "@/modules/_shared"

export interface CommunityBlockProps {
  /** Already validated http(s) URL; the caller renders nothing when unset. */
  url: string
  locale: Locale
}

export async function CommunityBlock({ url, locale }: CommunityBlockProps) {
  const t = await getTranslations({ locale, namespace: "portal.community" })
  return (
    <section aria-labelledby="community-heading" data-community className="flex flex-col items-start gap-3 rounded-card bg-surface-muted p-6">
      <h2 id="community-heading" className="font-display text-xl font-semibold leading-tight text-fg">
        {t("title")}
      </h2>
      <p className="max-w-prose text-fg-muted">{t("body")}</p>
      <a href={url} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "secondary" }))}>
        {t("cta")}
        <span className="sr-only"> {t("new_tab")}</span>
        <ArrowSquareOut aria-hidden="true" className="size-4" />
      </a>
    </section>
  )
}
