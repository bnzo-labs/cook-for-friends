import { fakeEnabled, jsonResponse, payloadSecret, verifyFake } from "@/modules/video"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/video/fake?asset&exp&viewer&sig — stand-in for the CDN manifest
 * (fake adapter, non-prod). 404 unless VIDEO_PROVIDER=fake.
 */
export async function GET(request: Request): Promise<Response> {
  if (!fakeEnabled()) return new Response(null, { status: 404 })
  const q = new URL(request.url).searchParams
  const result = verifyFake(payloadSecret(), {
    assetId: q.get("asset") ?? "",
    exp: Number(q.get("exp")),
    viewerId: q.get("viewer") ?? "",
    sig: q.get("sig") ?? "",
  })
  if (!result.ok) return jsonResponse(403, { ok: false, error: { code: "FORBIDDEN", messageKey: "errors.FORBIDDEN" } }, { "cache-control": "private, no-store" })
  return jsonResponse(200, { fake: true, assetId: q.get("asset") }, { "cache-control": "private, no-store" })
}
