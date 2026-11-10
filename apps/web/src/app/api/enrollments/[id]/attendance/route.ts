import { handleAttendance } from "@/modules/scheduling"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/enrollments/:id/attendance — CONTRACT §5.1. Staff only, Origin check. Body `{ attendance }`. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleAttendance(request, (await ctx.params).id)
}
