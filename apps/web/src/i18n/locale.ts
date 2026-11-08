/**
 * assertLocale — validate a raw [locale] param before any DB or catalog call.
 *
 * Next.js renders layout and page in parallel; a notFound() in
 * (frontend)/[locale]/layout.tsx does NOT prevent DB calls in page files.
 * Every generateMetadata and page function that touches the DB must call
 * this FIRST so bogus paths like /favicon.ico, /x.y/courses, etc.
 * never reach Postgres with an invalid _locales enum value.
 */
import { notFound } from "next/navigation"
import { hasLocale } from "next-intl"
import { routing } from "@/i18n/routing"
import type { Locale } from "@/i18n/locales"

export function assertLocale(locale: string): Locale {
  if (!hasLocale(routing.locales, locale)) notFound()
  return locale as Locale
}
