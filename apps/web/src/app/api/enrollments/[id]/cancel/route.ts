import { handleCancel } from "@/modules/scheduling"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/enrollments/:id/cancel — CONTRACT §5.1. Buyer or staff, Origin check → `{ ok, data: { outcome, amount } }`. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleCancel(request, (await ctx.params).id)
}
