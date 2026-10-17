import type { CollectionConfig } from "payload"

import { Certificates } from "./collections/certificates"
import { Comments } from "./collections/comments"
import { LessonProgress } from "./collections/lesson-progress"

export const learningCollections: CollectionConfig[] = [LessonProgress, Certificates, Comments]
