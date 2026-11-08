/**
 * notifications/index.ts — public surface per CONTRACT §4 + CCR-W2-3 + CCR-W2-6.
 *
 * Other modules import ONLY from '@/modules/notifications'.
 * Deep imports are blocked by ESLint no-restricted-imports.
 */
import type { CollectionConfig, TaskConfig } from "payload"
import { sendEmailTask } from "./jobs/send-email"

// This module owns no Payload collections.
export const notificationsCollections: CollectionConfig[] = []

/** Payload Jobs Queue tasks owned by notifications (CONTRACT §1 CCR-W2-5). */
export const notificationsJobTasks: TaskConfig[] = [sendEmailTask]

// ---------------------------------------------------------------------------
// Public types (CONTRACT §4)
// ---------------------------------------------------------------------------
export type { EmailTemplate, EmailData, Attachment, IcsInput } from "./types"

// ---------------------------------------------------------------------------
// Public functions (CONTRACT §4)
// ---------------------------------------------------------------------------
export { sendEmail } from "./server/send"
export { buildIcs } from "./server/ics"
export { enqueueEmail } from "./server/enqueue"

// ---------------------------------------------------------------------------
// Test seam (not in CONTRACT — implementation detail)
// ---------------------------------------------------------------------------
export { setEmailTransportForTests, buildTestTransport } from "./server/transport"
