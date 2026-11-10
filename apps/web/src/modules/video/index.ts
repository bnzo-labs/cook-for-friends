import type { CollectionConfig } from "payload"

/** The video module owns no collections: video ids live on `lessons.video` (catalog). */
export const videoCollections: CollectionConfig[] = []

// CONTRACT §4 `@/modules/video` (CCR-W3-7)
export type { VideoProvider, VideoProviderName, VideoWebhookEvent } from "./types"
export { PLAYBACK_TTL_SECONDS } from "./types"
export { getVideoProvider } from "./server/provider"
export { getLessonPlayback, getLessonPlaybackForStaff } from "./server/playback"
export type { PlaybackView } from "./server/playback"

// Route-handler support (src/app/api/video/**)
export { applyVideoEvent } from "./server/webhook"
export { completeFakeUpload, createLessonUpload, pollLessonUpload, FAKE_UPLOAD_MAX_BYTES } from "./server/uploads"
export { verifyFake } from "./server/fake-token"
export { fakeEnabled, payloadSecret } from "./server/config"
export {
  forbiddenOrigin,
  isAllowedOrigin,
  jsonResponse,
  rateLimited,
  resolveActor,
  serverError,
  unauthenticated,
  videoErrorResponse,
} from "./server/http"
