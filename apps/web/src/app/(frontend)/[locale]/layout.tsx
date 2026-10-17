import { NextIntlClientProvider, hasLocale } from "next-intl"
import { getMessages, getTranslations } from "next-intl/server"
import { notFound } from "next/navigation"
import { locales } from "@/i18n/locales"
import { routing } from "@/i18n/routing"
import { SiteFooter, SiteHeader } from "@/components/layout"
import { Toaster } from "@/components/ui/sonner"
import { fontBody, fontDisplay } from "@/styles/fonts"
import { cn } from "@/lib/utils"
import type { Metadata } from "next"
import "@/styles/globals.css"

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export const metadata: Metadata = {
  title: {
    template: "%s — Cook for Friends",
    default: "Cook for Friends",
  },
  description: "Cours de pâtisserie et boulangerie à Montréal.",
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()

  const messages = await getMessages({ locale })
  const t = await getTranslations({ locale, namespace: "layout" })

  return (
    <html lang={locale} className={cn(fontDisplay.variable, fontBody.variable)}>
      <body className="flex min-h-dvh flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-primary focus:px-4 focus:py-3 focus:font-medium focus:text-primary-fg focus:shadow-raised"
          >
            {t("skip_to_content")}
          </a>
          <SiteHeader locale={locale} />
          <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
            {children}
          </main>
          <SiteFooter locale={locale} />
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
