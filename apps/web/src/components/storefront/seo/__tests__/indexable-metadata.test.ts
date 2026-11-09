import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/i18n/navigation", () => ({
  getPathname: ({ locale, href }: { locale: string; href: string | { pathname: string; params?: { slug: string } } }) => {
    if (typeof href === "string") return href === "/" ? `/${locale}` : `/${locale}${href}`
    return `/${locale}/${locale === "fr" ? "cours" : "courses"}/${href.params?.slug}`
  },
}))

const original = { ...process.env }
afterEach(() => {
  process.env = { ...original }
  vi.resetModules()
})

async function load() {
  const indexable = await import("../indexable")
  const metadata = await import("../metadata")
  return { ...indexable, ...metadata }
}

describe("isIndexable", () => {
  it("is false by default and for non-listed hosts", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://cook-for-friends.vercel.app"
    delete process.env.SEO_INDEXABLE_HOSTS
    expect((await load()).isIndexable()).toBe(false)
    process.env.SEO_INDEXABLE_HOSTS = "cookforfriends.ca"
    expect((await load()).isIndexable()).toBe(false)
  })
  it("is true only when the canonical host is allow-listed", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://cookforfriends.ca"
    process.env.SEO_INDEXABLE_HOSTS = "other.test, CookForFriends.ca"
    expect((await load()).isIndexable()).toBe(true)
  })
})

describe("buildPageMetadata", () => {
  it("emits translated-slug canonical + hreflang + noindex on staging", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.vercel.app"
    delete process.env.SEO_INDEXABLE_HOSTS
    const m = await load()
    const meta = m.buildPageMetadata({
      locale: "en",
      paths: m.slugPaths("/courses/[slug]", { fr: "pain-au-levain", en: "sourdough-bread" }),
      title: "Sourdough",
      siteName: "Cook for Friends",
      image: "/media/hero.jpg",
    })
    expect(meta.alternates?.canonical).toBe("https://staging.vercel.app/en/courses/sourdough-bread")
    expect(meta.alternates?.languages).toEqual({
      "fr-CA": "https://staging.vercel.app/fr/cours/pain-au-levain",
      "en-CA": "https://staging.vercel.app/en/courses/sourdough-bread",
      "x-default": "https://staging.vercel.app/fr/cours/pain-au-levain",
    })
    expect(meta.robots).toEqual({ index: false, follow: false })
    expect(meta.openGraph?.images).toEqual([{ url: "https://staging.vercel.app/media/hero.jpg" }])
    expect(meta.twitter).toMatchObject({ card: "summary_large_image" })
  })
  it("drops noindex on an allow-listed host", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://cookforfriends.ca"
    process.env.SEO_INDEXABLE_HOSTS = "cookforfriends.ca"
    const m = await load()
    const meta = m.buildPageMetadata({ locale: "fr", paths: m.staticPaths("/"), title: "x", siteName: "s" })
    expect(meta.robots).toBeUndefined()
  })
})
