import type Stripe from "stripe"

/** In-memory Stripe catalog fake (products/prices/coupons/promotion codes). Test helper only. */
type Rec = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export function makeCatalogFake() {
  let n = 0
  const products = new Map<string, Rec>()
  const prices = new Map<string, Rec>()
  const coupons = new Map<string, Rec>()
  const promos = new Map<string, Rec>()
  const keys = new Map<string, Rec>()
  const writes: string[] = []
  let failNext: unknown = null

  const missing = () => Object.assign(new Error("No such resource"), { code: "resource_missing", type: "StripeInvalidRequestError" })
  const guard = () => {
    if (failNext) {
      const e = failNext
      failNext = null
      throw e
    }
  }
  const idem = (key: string | undefined, make: () => Rec): Rec => {
    if (key && keys.has(key)) return keys.get(key)!
    const r = make()
    if (key) keys.set(key, r)
    return r
  }
  const w = (name: string) => writes.push(name)
  const get = (m: Map<string, Rec>, id: string) => {
    const r = m.get(id)
    if (!r) throw missing()
    return structuredClone(r)
  }

  const client = {
    products: {
      create: async (p: Rec, o?: { idempotencyKey?: string }) => {
        guard()
        return idem(o?.idempotencyKey, () => {
          w("products.create")
          const r = { id: `prod_${++n}`, description: null, default_price: null, tax_code: null, ...p, metadata: p.metadata ?? {} }
          if (p.tax_code) r.tax_code = p.tax_code
          products.set(r.id, r)
          return r
        })
      },
      retrieve: async (id: string) => get(products, id),
      search: async ({ query }: { query: string }) => {
        const m = /metadata\['(\w+)'\]:'([^']*)'/.exec(query)
        const data = [...products.values()].filter((p) => m && p.metadata?.[m[1]!] === m[2]).map((p) => structuredClone(p))
        return { data }
      },
      update: async (id: string, p: Rec) => {
        guard()
        w("products.update")
        const r = products.get(id)
        if (!r) throw missing()
        Object.assign(r, p)
        return structuredClone(r)
      },
    },
    prices: {
      create: async (p: Rec, o?: { idempotencyKey?: string }) =>
        idem(o?.idempotencyKey, () => {
          w("prices.create")
          const r = { id: `price_${++n}`, active: true, ...p }
          prices.set(r.id, r)
          return r
        }),
      retrieve: async (id: string) => get(prices, id),
      update: async (id: string, p: Rec) => {
        w("prices.update")
        const r = prices.get(id)
        if (!r) throw missing()
        Object.assign(r, p)
        return structuredClone(r)
      },
    },
    coupons: {
      create: async (p: Rec, o?: { idempotencyKey?: string }) =>
        idem(o?.idempotencyKey, () => {
          w("coupons.create")
          const r = { id: `coupon_${++n}`, valid: true, percent_off: null, amount_off: null, ...p }
          coupons.set(r.id, r)
          return r
        }),
      retrieve: async (id: string) => get(coupons, id),
    },
    promotionCodes: {
      create: async (p: Rec, o?: { idempotencyKey?: string }) =>
        idem(o?.idempotencyKey, () => {
          w("promotionCodes.create")
          const live = [...promos.values()].find((x) => x.active && x.code === p.code)
          if (live) throw Object.assign(new Error("code already exists"), { type: "StripeInvalidRequestError" })
          const r = { id: `promo_${++n}`, active: true, ...p }
          promos.set(r.id, r)
          return r
        }),
      retrieve: async (id: string) => get(promos, id),
      update: async (id: string, p: Rec) => {
        w("promotionCodes.update")
        const r = promos.get(id)
        if (!r) throw missing()
        Object.assign(r, p)
        return structuredClone(r)
      },
    },
  } as unknown as Stripe

  return {
    client,
    products,
    prices,
    coupons,
    promos,
    writes,
    failNext: (e: unknown = Object.assign(new Error("stripe down"), { type: "StripeAPIError" })) => {
      failNext = e
    },
    clearWrites: () => {
      writes.length = 0
    },
  }
}
