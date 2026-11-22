"use client"

import MuxPlayer, { type MuxPlayerRefAttributes as MuxPlayerElement } from "@mux/mux-player-react"

export interface MuxStageProps {
  src: string
  poster: string | null
  title: string
  startTime: number
  onPlay: () => void
  onPause: (positionSec: number) => void
  onEnded: (positionSec: number) => void
  onTime: (positionSec: number) => void
  onPlaybackError: () => void
}

/**
 * Thin wrapper over @mux/mux-player-react. Loaded only through `next/dynamic`
 * (ssr: false) from VideoPlayer, so none of this ships on pages without video.
 * Captions: the player renders the HLS text tracks when the asset has them.
 *
 * Law 25 / privacy: `disableCookies` suppresses the persistent `muxData`
 * first-party cookie that Mux Data sets by default. QoS beacon pings to
 * *.litix.io still fire (acceptable); no viewer-id cookie is written.
 * If Mux Data analytics must be removed entirely, replace with
 * `disableTracking` and drop `*.litix.io` from the CSP connect-src.
 */
export default function MuxStage(props: MuxStageProps) {
  return (
    <MuxPlayer
      src={props.src}
      poster={props.poster ?? undefined}
      streamType="on-demand"
      startTime={props.startTime}
      metadata={{ video_title: props.title }}
      className="aspect-video w-full overflow-hidden rounded-card bg-surface-muted"
      disableCookies
      onPlay={props.onPlay}
      onPause={(e) => props.onPause((e.target as MuxPlayerElement).currentTime)}
      onEnded={(e) => props.onEnded((e.target as MuxPlayerElement).currentTime)}
      onTimeUpdate={(e) => props.onTime((e.target as MuxPlayerElement).currentTime)}
      onError={props.onPlaybackError}
    />
  )
}
