import { getTranslations } from "next-intl/server"
import { Container } from "./Container"
import { Logo } from "./Logo"
import { LocaleSwitcher } from "./LocaleSwitcher"
import { MobileNav } from "./MobileNav"
import { NavLinks } from "./NavLinks"

export async function SiteHeader({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "layout" })

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between gap-6 md:h-20">
        <Logo label={t("brand_home")} name={t("brand")} />
        <div className="flex items-center gap-4 md:gap-10">
          <nav aria-label={t("main_nav_label")} className="hidden md:block">
            <NavLinks />
          </nav>
          <LocaleSwitcher className="hidden md:block" />
          <MobileNav />
        </div>
      </Container>
    </header>
  )
}
