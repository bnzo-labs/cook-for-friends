import { describe, expect, it } from "vitest"
import { getPathname } from "../navigation"

describe("translated pathnames", () => {
  const cases: Array<[Parameters<typeof getPathname>[0]["href"], "fr" | "en", string]> = [
    ["/courses", "fr", "/fr/cours"],
    ["/courses", "en", "/en/courses"],
    ["/cart", "fr", "/fr/panier"],
    ["/cart", "en", "/en/cart"],
    ["/checkout/success", "fr", "/fr/commande/merci"],
    ["/checkout/cancelled", "fr", "/fr/commande/annulee"],
    ["/auth/login", "fr", "/fr/connexion"],
    ["/auth/login", "en", "/en/auth/login"],
    ["/auth/verify", "fr", "/fr/connexion/verifier"],
    ["/account", "fr", "/fr/compte"],
    ["/account/receipts", "fr", "/fr/compte/recus"],
    ["/products", "fr", "/fr/produits"],
  ]
  it.each(cases)("%s [%s] -> %s", (href, locale, expected) => {
    expect(getPathname({ href, locale })).toBe(expected)
  })

  it("resolves dynamic params", () => {
    expect(
      getPathname({ href: { pathname: "/courses/[slug]", params: { slug: "pasta" } }, locale: "fr" }),
    ).toBe("/fr/cours/pasta")
    expect(
      getPathname({
        href: { pathname: "/certificates/verify/[code]", params: { code: "ABC" } },
        locale: "fr",
      }),
    ).toBe("/fr/certificats/verifier/ABC")
  })
})
