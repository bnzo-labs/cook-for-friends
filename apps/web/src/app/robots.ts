import type { MetadataRoute } from "next"
import { absoluteUrl, isIndexable } from "@/components/storefront/seo/indexable"

/** Private surfaces never crawled even on an indexable host. */
const PRIVATE_PATHS = [
  "/api/",
  "/admin",
  "/fr/compte",
  "/en/account",
  "/fr/connexion",
  "/en/auth/",
  "/fr/panier",
  "/en/cart",
  "/fr/commande/",
  "/en/checkout/",
  "/fr/certificats/",
  "/en/certificates/",
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: isIndexable()
      ? { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS }
      : { userAgent: "*", disallow: "/" },
    sitemap: absoluteUrl("/sitemap.xml"),
  }
}
