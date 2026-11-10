import { getPathname } from "@/i18n/navigation"
import type { Locale } from "@/modules/_shared"

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "")
}

/** Absolute `/fr/certificats/verifier/<code>` · `/en/certificates/verify/<code>`. */
export function verifyUrl(locale: Locale, code: string): string {
  return `${siteUrl()}${getPathname({ locale, href: { pathname: "/certificates/verify/[code]", params: { code } } })}`
}

/** Absolute portal history anchor where certificates are listed. */
export function portalCertificatesUrl(locale: Locale): string {
  return `${siteUrl()}${getPathname({ locale, href: "/account/history" })}#certificates`
}
