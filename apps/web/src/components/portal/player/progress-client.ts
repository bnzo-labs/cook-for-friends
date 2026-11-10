/** Browser-side wrapper for POST /api/progress (CONTRACT §5.1). */
export type ProgressBody = { lessonId: number; completed?: boolean; positionSec?: number }
export type ProgressResult = { courseCompleted: boolean; certificateId: number | null }

const ENDPOINT = "/api/progress"

export async function postProgress(body: ProgressBody): Promise<{ ok: true; data: ProgressResult } | { ok: false; status: number }> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      keepalive: true,
    })
    if (!res.ok) return { ok: false, status: res.status }
    const json: unknown = await res.json()
    const data = (json as { data?: { courseCompleted?: unknown; certificateId?: unknown } } | null)?.data
    return {
      ok: true,
      data: {
        courseCompleted: data?.courseCompleted === true,
        certificateId: typeof data?.certificateId === "number" ? data.certificateId : null,
      },
    }
  } catch {
    return { ok: false, status: 0 }
  }
}

/** Last-chance position save on `pagehide`. Same-origin POST, so Origin is sent. */
export function beaconProgress(body: ProgressBody): boolean {
  if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return false
  return navigator.sendBeacon(ENDPOINT, new Blob([JSON.stringify(body)], { type: "application/json" }))
}
