"use client"

import dynamic from "next/dynamic"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

import { createPlaybackController, type PlaybackController, type PlaybackErrorReason } from "./playback-controller"

// Mux player JS must never reach pages without a video (W3-03b criterion).
const MuxStage = dynamic(() => import("./MuxStage"), {
  ssr: false,
  loading: () => <Skeleton className="aspect-video w-full rounded-card" />,
})

const POSITION_SAVE_INTERVAL_MS = 15_000

export interface VideoPlayerProps {
  lessonId: number
  title: string
  /** Catalog video state; only `ready` triggers a playback request. */
  videoStatus: string | null
  initialPositionSec: number
  onSavePosition: (positionSec: number) => void
  onTrackPosition: (positionSec: number) => void
  onEnded: () => void
}

type View = { url: string; poster: string | null; startAt: number }
type Phase = { kind: "loading" } | { kind: "ready"; view: View } | { kind: "error"; reason: PlaybackErrorReason }

/** Providers other than Mux (the `fake` one used by e2e) render a placeholder panel. */
export function isMuxUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".mux.com")
  } catch {
    return false
  }
}

const ERROR_KEY: Record<PlaybackErrorReason, string> = {
  unauthorized: "video_error_unauthorized",
  forbidden: "video_error_forbidden",
  unavailable: "video_error_unavailable",
  failed: "video_error_failed",
}

export function VideoPlayer(props: VideoPlayerProps) {
  const { lessonId, title, videoStatus, initialPositionSec, onSavePosition, onTrackPosition, onEnded } = props
  const t = useTranslations("portal.player")
  const [phase, setPhase] = useState<Phase>({ kind: "loading" })
  const controllerRef = useRef<PlaybackController | null>(null)
  const playingRef = useRef(false)
  const lastTimeRef = useRef(initialPositionSec)
  const appliedUrlRef = useRef<string | null>(null)
  const latestRef = useRef<{ url: string; poster: string | null } | null>(null)
  const forceApplyRef = useRef(false)
  const [playing, setPlaying] = useState(false)
  const hasVideo = videoStatus === "ready"

  const apply = useCallback(
    (next: { url: string; poster: string | null }) => {
      appliedUrlRef.current = next.url
      forceApplyRef.current = false
      const startAt = lastTimeRef.current > 0 ? lastTimeRef.current : initialPositionSec
      setPhase({ kind: "ready", view: { url: next.url, poster: next.poster, startAt } })
    },
    [initialPositionSec],
  )

  useEffect(() => {
    if (!hasVideo) return
    const controller = createPlaybackController({
      lessonId,
      onState: (state) => {
        if (state.status === "loading") {
          if (appliedUrlRef.current === null) setPhase({ kind: "loading" })
        } else if (state.status === "error") {
          setPhase({ kind: "error", reason: state.reason })
        } else {
          latestRef.current = { url: state.url, poster: state.posterUrl }
          // Never swap the source under a playing video; apply on pause/error instead.
          if (appliedUrlRef.current === null || !playingRef.current || forceApplyRef.current) apply(latestRef.current)
        }
      },
    })
    controllerRef.current = controller
    controller.start()
    return () => {
      controller.stop()
      controllerRef.current = null
      appliedUrlRef.current = null
      latestRef.current = null
    }
  }, [apply, hasVideo, lessonId])

  // Position save every 15 s while playing.
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => onSavePosition(lastTimeRef.current), POSITION_SAVE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [onSavePosition, playing])

  const setPlayingBoth = useCallback((value: boolean) => {
    playingRef.current = value
    setPlaying(value)
  }, [])

  const track = useCallback(
    (sec: number) => {
      lastTimeRef.current = sec
      onTrackPosition(sec)
    },
    [onTrackPosition],
  )

  const onPause = useCallback(
    (sec: number) => {
      setPlayingBoth(false)
      track(sec)
      onSavePosition(sec)
      const latest = latestRef.current
      if (latest && latest.url !== appliedUrlRef.current) apply(latest)
    },
    [apply, onSavePosition, setPlayingBoth, track],
  )

  const onEndedInner = useCallback(
    (sec: number) => {
      setPlayingBoth(false)
      track(sec)
      onSavePosition(sec)
      onEnded()
    },
    [onEnded, onSavePosition, setPlayingBoth, track],
  )

  const onPlaybackError = useCallback(() => {
    forceApplyRef.current = true
    controllerRef.current?.refresh()
  }, [])

  const frame = "relative aspect-video w-full overflow-hidden rounded-card border border-border bg-surface-muted"

  if (!hasVideo) {
    return (
      <div role="region" aria-label={t("video_region")} className={`${frame} flex items-center justify-center p-6`} data-video-state="none">
        <p className="max-w-prose text-center text-fg-muted">
          {videoStatus === null || videoStatus === "none" ? t("video_no_video") : t("video_error_unavailable")}
        </p>
      </div>
    )
  }

  return (
    <div role="region" aria-label={t("video_region")} data-video-state={phase.kind}>
      {phase.kind === "loading" ? (
        <div className={frame} role="status" aria-live="polite">
          <Skeleton className="absolute inset-0 rounded-none" />
          <span className="sr-only">{t("video_loading")}</span>
        </div>
      ) : null}

      {phase.kind === "error" ? (
        <div className={`${frame} flex flex-col items-center justify-center gap-4 p-6 text-center`} role="alert">
          <p className="max-w-prose text-fg">{t(ERROR_KEY[phase.reason])}</p>
          {phase.reason === "forbidden" || phase.reason === "failed" ? (
            <Button variant="secondary" onClick={() => controllerRef.current?.retry()}>
              {t("video_retry")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {phase.kind === "ready" && isMuxUrl(phase.view.url) ? (
        <MuxStage
          src={phase.view.url}
          poster={phase.view.poster}
          title={title}
          startTime={phase.view.startAt}
          onPlay={() => setPlayingBoth(true)}
          onPause={onPause}
          onEnded={onEndedInner}
          onTime={track}
          onPlaybackError={onPlaybackError}
        />
      ) : null}

      {phase.kind === "ready" && !isMuxUrl(phase.view.url) ? (
        <div
          className={`${frame} flex items-center justify-center p-6`}
          data-video-placeholder
          data-playback-ready="true"
          aria-live="polite"
        >
          <p className="max-w-prose text-center font-display text-lg text-fg">{t("video_placeholder", { title })}</p>
        </div>
      ) : null}
    </div>
  )
}
