import { handleWaitlistRemove } from "@/modules/scheduling"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/waitlist/remove — W4-08. Public, Origin check, 10/IP/h. Idempotent. */
export const POST = (request: Request) => handleWaitlistRemove(request)
