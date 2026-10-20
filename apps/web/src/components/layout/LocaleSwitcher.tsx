"use client"

import type { ComponentProps } from "react"
import { useParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/navigation"
import { locales, type Locale } from "@/i18n/locales"
import { cn } from "@/lib/utils"

const SWITCH_KEY: Record<Locale, "switch_fr" | "switch_en"> = {
  fr: "switch_fr",
  en: "switch_en",
}

/** `FR · EN` text toggle. Keeps the current path when switching language. */
export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations("layout.locale")
  const current = useLocale()
  const pathname = usePathname()
  const params = useParams()
  // Typed pathnames: dynamic routes need their params (next-intl documented pattern).
  const href = { pathname, params } as ComponentProps<typeof Link>["href"]

  return (
    <nav aria-label={t("label")} className={className}>
      <ul className="flex items-center text-sm font-semibold tracking-wider">
        {locales.map((locale, index) => {
          const active = locale === current
          return (
            <li key={locale} className="flex items-center">
              {index > 0 ? (
                <span aria-hidden="true" className="px-1 text-fg-subtle">
                  ·
                </span>
              ) : null}
              {active ? (
                <span aria-current="true" className="px-1.5 py-1 text-fg">
                  {locale.toUpperCase()}
                  <span className="sr-only"> — {t("current")}</span>
                </span>
              ) : (
                <Link
                  href={href}
                  locale={locale}
                  lang={locale}
                  hrefLang={locale}
                  aria-label={t(SWITCH_KEY[locale])}
                  className={cn(
                    "rounded-sm px-1.5 py-1 text-fg-muted transition-colors duration-(--duration-fast)",
                    "hover:text-primary active:translate-y-px",
                  )}
                >
                  {locale.toUpperCase()}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
