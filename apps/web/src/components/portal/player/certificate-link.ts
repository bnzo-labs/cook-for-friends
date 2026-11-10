import type { Locale } from "@/modules/_shared"

/** PDF download (W3-03a route). Owner-only; `locale` picks the certificate language. */
export const certificatePdfHref = (certificateId: number | string, locale: Locale): string =>
  `/api/certificates/${encodeURIComponent(String(certificateId))}/pdf?locale=${locale}`
