import fr from "@/i18n/messages/fr.json"
import en from "@/i18n/messages/en.json"
import { defaultLocale, locales, type Locale } from "@/i18n/locales"

/**
 * Offline fallback page served by the service worker (precached, never an
 * app route). Copy lives under `pwa.*` in the message files. Colors use CSS
 * system colors so no palette is hard-coded here.
 */
export const dynamic = "force-static"

const COPY: Record<Locale, typeof fr.pwa> = { fr: fr.pwa, en: en.pwa }

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export function renderOffline(locale: Locale): string {
  const c = COPY[locale]
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(c.offline_title)}</title>
<style>
:root{color-scheme:light dark}
body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:1.5rem;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:Canvas;color:CanvasText;line-height:1.6}
main{max-width:32rem}
h1{font-family:Georgia,"Times New Roman",serif;font-size:2rem;line-height:1.1;margin:0 0 1rem}
a{display:inline-block;margin-top:1.5rem;padding:.75rem 1.25rem;border:2px solid currentColor;border-radius:.5rem;color:inherit;font-weight:600;text-decoration:none}
a:hover,a:focus-visible{background:CanvasText;color:Canvas}
</style>
</head>
<body>
<main>
<h1>${esc(c.offline_title)}</h1>
<p>${esc(c.offline_body)}</p>
<a href="/${locale}">${esc(c.offline_retry)}</a>
</main>
</body>
</html>
`
}

export function GET(request: Request): Response {
  const lang = new URL(request.url).searchParams.get("lang")
  const locale = locales.find((l) => l === lang) ?? defaultLocale
  return new Response(renderOffline(locale), {
    headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" },
  })
}
