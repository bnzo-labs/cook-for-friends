/**
 * W4-10 — Law 25 consent: MuxStage must pass disableCookies to MuxPlayer.
 *
 * We mock @mux/mux-player-react so no real web component is instantiated.
 * react-dom/server.renderToStaticMarkup runs server-side (node env) and
 * triggers the mock, letting us inspect the props MuxPlayer receives.
 *
 * We cannot observe a real muxData cookie in a node environment; the proof
 * is that the disableCookies prop is forwarded — the Mux SDK's own code
 * suppresses the cookie when it receives that prop.
 */

import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

// Capture the latest props passed to the mocked MuxPlayer.
const captured: { props: Record<string, unknown> | null } = { props: null }

vi.mock("@mux/mux-player-react", () => ({
  default: (props: Record<string, unknown>) => {
    captured.props = { ...props }
    return React.createElement("div", { "data-testid": "mux-player-mock" })
  },
}))

// Import after the mock is wired.
import MuxStage, { type MuxStageProps } from "../MuxStage"

const baseProps: MuxStageProps = {
  src: "https://stream.mux.com/test.m3u8",
  poster: null,
  title: "Test lesson",
  startTime: 0,
  onPlay: vi.fn(),
  onPause: vi.fn(),
  onEnded: vi.fn(),
  onTime: vi.fn(),
  onPlaybackError: vi.fn(),
}

describe("MuxStage — Law 25 cookie compliance (W4-10)", () => {
  beforeEach(() => {
    captured.props = null
  })

  it("passes disableCookies to MuxPlayer (suppresses muxData persistent cookie)", () => {
    renderToStaticMarkup(React.createElement(MuxStage, baseProps))

    expect(captured.props).not.toBeNull()
    // disableCookies is a boolean prop — JSX shorthand sets it to true.
    expect(captured.props?.disableCookies).toBe(true)
  })

  it("does not pass disableTracking (QoS beacons kept — only cookie suppressed)", () => {
    renderToStaticMarkup(React.createElement(MuxStage, baseProps))

    // disableTracking would remove all Mux Data pings; we only want no cookie.
    expect(captured.props?.disableTracking).toBeUndefined()
  })
})
