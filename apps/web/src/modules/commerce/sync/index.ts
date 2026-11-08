import type { TaskConfig } from "payload"

import { stripeSyncCourseTask, stripeSyncDiscountTask } from "./jobs"

/** Stripe catalog sync job tasks (W2-08). Composed into `commerceJobTasks`. */
export const syncJobTasks: TaskConfig[] = [stripeSyncCourseTask, stripeSyncDiscountTask] as TaskConfig[]

export { syncCourseToStripe } from "./course"
export { syncDiscountToStripe } from "./discount"
