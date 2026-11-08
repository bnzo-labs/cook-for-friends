import { getTranslations } from "next-intl/server"
import { Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { Container } from "@/components/layout"
import type { Locale } from "@/i18n/locales"

interface FallbackHomePageProps {
  locale: Locale
}

/**
 * Minimal home page rendered when the CMS "home" / "accueil" page doc is
 * absent (e.g. fresh staging env with no seeded content).
 *
 * Returns HTTP 200 so the route is reachable even without seed data.
 * Uses only i18n strings — no DB access.
 */
export async function FallbackHomePage({ locale }: FallbackHomePageProps) {
  const [tCommon, tStorefront] = await Promise.all([
    getTranslations({ locale, namespace: "common" }),
    getTranslations({ locale, namespace: "storefront.home" }),
  ])

  return (
    <section
      aria-labelledby="fallback-hero-heading"
      className="relative overflow-hidden bg-bg"
    >
      <Container className="flex flex-col justify-center py-[var(--space-section)] md:max-w-[36rem]">
        <h1
          id="fallback-hero-heading"
          className="font-display text-hero font-semibold leading-[var(--leading-tight)] tracking-tight text-fg"
        >
          {tCommon("site_name")}
        </h1>
        <p className="mt-6 max-w-[45ch] text-lg leading-[var(--leading-body)] text-fg-muted">
          {tCommon("tagline")}
        </p>
        <div className="mt-10">
          <Button asChild size="lg" variant="primary">
            <Link href="/courses">{tStorefront("discover_courses")}</Link>
          </Button>
        </div>
      </Container>
    </section>
  )
}
