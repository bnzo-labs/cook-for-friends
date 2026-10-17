import { getTranslations } from "next-intl/server"
import { Link } from "@/i18n/navigation"
import { Container } from "./Container"
import { LocaleSwitcher } from "./LocaleSwitcher"
import { NAV_ITEMS } from "./nav-items"

export async function SiteFooter({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "layout" })
  const year = new Date().getFullYear()

  return (
    <footer aria-label={t("footer.label")} className="mt-auto border-t border-border bg-surface-muted">
      <Container className="grid gap-12 py-12 md:grid-cols-[1.6fr_1fr] md:gap-16 md:py-16">
        <div className="flex flex-col gap-4">
          <p className="font-display text-2xl font-semibold tracking-tight md:text-3xl">{t("brand")}</p>
          <p className="max-w-[40ch] text-fg-muted">{t("footer.tagline")}</p>
          <p className="text-sm text-fg-muted">{t("footer.place")}</p>
        </div>
        <div className="flex flex-col gap-8 sm:flex-row sm:gap-16 md:justify-end">
          <nav aria-label={t("footer.nav_label")}>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-fg-muted">
              {t("footer.explore")}
            </p>
            <ul className="flex flex-col gap-2">
              {NAV_ITEMS.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="rounded-sm text-fg transition-colors duration-(--duration-fast) hover:text-primary"
                  >
                    {t(`nav.${item.labelKey}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-fg-muted">
              {t("locale.label")}
            </p>
            <LocaleSwitcher />
          </div>
        </div>
      </Container>
      <div className="border-t border-border">
        <Container className="py-4 text-sm text-fg-muted">{t("footer.rights", { year })}</Container>
      </div>
    </footer>
  )
}
