import { isStaff } from "@/modules/identity"

import type { Actor } from "../types"
import { getPayload } from "./payload"

/** Resolve the caller from request headers (customer cookie or staff cookie). */
export async function getRequestActor(headers: Headers): Promise<Actor> {
  const payload = await getPayload()
  const { user } = await payload.auth({ headers })
  if (!user) return null
  if (user.collection === "customers") return { kind: "customer", id: user.id }
  if (isStaff(user)) return { kind: "staff" }
  return null
}
