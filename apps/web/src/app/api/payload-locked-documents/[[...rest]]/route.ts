/**
 * G-3 (W4-03c): Shadow route for Payload's built-in `payload-locked-documents` REST endpoints.
 *
 * Problem: Payload's default access is `Boolean(req.user)`; customers are Payload auth users
 * (magic-link strategy). A signed-in customer can enumerate which admin docs are locked, by
 * whom, and POST/DELETE locks — breaking admin integrity without exposing any business data.
 *
 * Fix: This Next.js route takes priority over `(payload)/api/[[...slug]]` for the
 * `payload-locked-documents` path. Non-staff (unauthenticated, customers) get 404. Staff
 * requests are forwarded to the Payload REST handler with the correct slug parameter.
 *
 * `payload-preferences` uses own-only access (user.value=req.user.id, user.relationTo=collection)
 * and is unaffected: each auth user can only read/write their own preferences. No change needed.
 */
import { REST_DELETE, REST_GET, REST_OPTIONS, REST_PATCH, REST_POST } from "@payloadcms/next/routes"
import { getPayload } from "payload"
import config from "@payload-config"

import { isStaff } from "@/modules/identity"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SLUG = "payload-locked-documents"

type Ctx = { params: Promise<{ rest?: string[] }> }

/** Returns true when the request comes from an authenticated staff user. */
async function isStaffRequest(request: Request): Promise<boolean> {
  try {
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: request.headers })
    return isStaff(user)
  } catch {
    return false
  }
}

/** Builds the params shape the Payload REST handlers expect. */
function payloadParams(rest: string[] | undefined): { params: Promise<{ slug: string[] }> } {
  const slug: string[] = rest?.length ? [SLUG, ...rest] : [SLUG]
  return { params: Promise.resolve({ slug }) }
}

function deny(): Response {
  return new Response(null, { status: 404 })
}

export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  if (!(await isStaffRequest(request))) return deny()
  return REST_GET(config)(request, payloadParams((await ctx.params).rest))
}

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  if (!(await isStaffRequest(request))) return deny()
  return REST_POST(config)(request, payloadParams((await ctx.params).rest))
}

export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  if (!(await isStaffRequest(request))) return deny()
  return REST_DELETE(config)(request, payloadParams((await ctx.params).rest))
}

export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  if (!(await isStaffRequest(request))) return deny()
  return REST_PATCH(config)(request, payloadParams((await ctx.params).rest))
}

export async function OPTIONS(request: Request, ctx: Ctx): Promise<Response> {
  if (!(await isStaffRequest(request))) return deny()
  return REST_OPTIONS(config)(request, payloadParams((await ctx.params).rest))
}
