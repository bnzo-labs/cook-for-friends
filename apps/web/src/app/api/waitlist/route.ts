import { handleWaitlist } from "@/modules/scheduling"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/waitlist — CONTRACT §5.1. Public, Origin check, 5/IP/h + 3/email/h. */
export const POST = (request: Request) => handleWaitlist(request)
