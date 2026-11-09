import type { VideoProvider } from "../types"
import { fakeEnabled, videoProviderSetting } from "./config"
import { createFakeProvider } from "./providers/fake"
import { createMuxProvider } from "./providers/mux"

/**
 * The configured adapter, or null when video is off (`none`) or the provider
 * has no adapter (`bunny`: interface ready, adapter not built, D2). `fake`
 * additionally needs VIDEO_FAKE_ALLOWED=true.
 */
export function getVideoProvider(): VideoProvider | null {
  switch (videoProviderSetting()) {
    case "mux":
      return createMuxProvider()
    case "fake":
      return fakeEnabled() ? createFakeProvider() : null
    default:
      return null
  }
}
