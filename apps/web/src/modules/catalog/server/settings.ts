import type { CancellationPolicy, SiteSettings } from "../types"
import { mapCancellationPolicy, mapSiteSettings, type Rec } from "./mappers"
import { getPayload } from "./payload"

/** Empty/never-saved global → CONTRACT §3.1 defaults. */
export async function getSiteSettings(): Promise<SiteSettings> {
  const payload = await getPayload()
  const doc = await payload.findGlobal({ slug: "site-settings", depth: 0, overrideAccess: true })
  return mapSiteSettings(doc as unknown as Rec)
}

export async function getCancellationPolicy(): Promise<CancellationPolicy> {
  const payload = await getPayload()
  const doc = await payload.findGlobal({ slug: "cancellation-policy", depth: 0, overrideAccess: true })
  return mapCancellationPolicy(doc as unknown as Rec)
}
