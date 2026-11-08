import { handleAttendeesCsv } from "@/modules/commerce"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params
  return handleAttendeesCsv(request, id)
}
