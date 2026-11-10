/**
 * Signed playback URL lifecycle (DESIGN_SPEC VideoPlayer, W3-03b). Framework-free
 * so it can be unit-tested with fake timers:
 * - fetch on start, schedule a refetch REFRESH_LEAD_MS before `expiresAt`;
 * - 401 stops at once; 404 stops at once; 403 / 5xx / network errors retry with
 *   backoff, at most MAX_RETRIES retries, then the error state sticks.
 */
export const REFRESH_LEAD_MS = 60_000
export const MAX_RETRIES = 3
export const BACKOFF_MS = [1_000, 2_000, 4_000] as const
/** Floor for the refresh delay so a short TTL can never become a request storm. */
const MIN_REFRESH_DELAY_MS = 5_000

export type PlaybackErrorReason = "unauthorized" | "forbidden" | "unavailable" | "failed"

export type PlaybackState =
  | { status: "loading" }
  | { status: "ready"; url: string; posterUrl: string | null; expiresAt: string }
  | { status: "error"; reason: PlaybackErrorReason }

type PlaybackPayload = { url: string; posterUrl?: string; expiresAt: string }

export interface PlaybackControllerOptions {
  lessonId: number | string
  onState: (state: PlaybackState) => void
  fetchImpl?: typeof fetch
}

export interface PlaybackController {
  start: () => void
  /** Force a refetch now (player error): resets nothing, counts as a retry when it fails. */
  refresh: () => void
  /** Manual "try again" from the error state: resets the retry budget. */
  retry: () => void
  stop: () => void
}

function reasonFor(status: number): PlaybackErrorReason {
  if (status === 401) return "unauthorized"
  if (status === 403) return "forbidden"
  if (status === 404) return "unavailable"
  return "failed"
}

const isTerminal = (status: number): boolean => status === 401 || status === 404 || status === 400

function isPayload(value: unknown): value is PlaybackPayload {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return typeof v.url === "string" && typeof v.expiresAt === "string"
}

export function createPlaybackController(opts: PlaybackControllerOptions): PlaybackController {
  const doFetch = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  let failures = 0
  let inflight = false

  const clear = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  const fail = (reason: PlaybackErrorReason, status: number) => {
    if (isTerminal(status) || failures >= MAX_RETRIES) {
      opts.onState({ status: "error", reason })
      return
    }
    const delay = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)] ?? BACKOFF_MS[0]
    failures += 1
    timer = setTimeout(() => void load(false), delay)
  }

  async function load(initial: boolean): Promise<void> {
    if (stopped || inflight) return
    inflight = true
    clear()
    if (initial) opts.onState({ status: "loading" })
    try {
      const res = await doFetch(`/api/video/playback?lessonId=${encodeURIComponent(String(opts.lessonId))}`, {
        credentials: "same-origin",
        cache: "no-store",
      })
      if (stopped) return
      if (!res.ok) {
        fail(reasonFor(res.status), res.status)
        return
      }
      const json: unknown = await res.json()
      const data = json && typeof json === "object" ? (json as { data?: unknown }).data : null
      if (stopped) return
      if (!isPayload(data)) {
        fail("failed", 500)
        return
      }
      failures = 0
      opts.onState({
        status: "ready",
        url: data.url,
        posterUrl: data.posterUrl ?? null,
        expiresAt: data.expiresAt,
      })
      const untilExpiry = new Date(data.expiresAt).getTime() - Date.now() - REFRESH_LEAD_MS
      timer = setTimeout(() => void load(false), Math.max(MIN_REFRESH_DELAY_MS, untilExpiry))
    } catch {
      if (!stopped) fail("failed", 500)
    } finally {
      inflight = false
    }
  }

  return {
    start: () => void load(true),
    refresh: () => void load(false),
    retry: () => {
      failures = 0
      void load(true)
    },
    stop: () => {
      stopped = true
      clear()
    },
  }
}
