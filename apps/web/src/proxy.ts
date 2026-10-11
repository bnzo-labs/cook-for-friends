import createMiddleware from "next-intl/middleware"
import { routing } from "./i18n/routing"

/**
 * Locale middleware (proxy.ts is the Next 16 rename of middleware.ts).
 * Excludes Payload admin, API routes, static files and _next internals.
 */
export default createMiddleware(routing)

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - /admin (Payload admin panel — handled by Payload's own routing)
     * - /api (Payload REST API and custom route handlers)
     * - /_next (Next.js internals)
     * - /favicon.ico, /sitemap.xml, /robots.txt and other static files
     * - Files with an extension (.png, .jpg, .css, .js, etc.)
     */
    "/((?!admin|api|_next|_vercel|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\..*).*)",
  ],
}
