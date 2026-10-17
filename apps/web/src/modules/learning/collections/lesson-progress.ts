import type { CollectionConfig } from "payload"

import { isAdmin, ownsDocument } from "@/modules/identity"
import { learningGroup } from "../labels"

/**
 * `lesson-progress` — per-lesson progress. CONTRACT §3.6. UNIQUE `(customer, lesson)`.
 * Access §3.7: customer reads own (writes via learning module), staff read, admin CRUD.
 */
export const LessonProgress: CollectionConfig = {
  slug: "lesson-progress",
  labels: {
    singular: { fr: "Progression", en: "Lesson progress" },
    plural: { fr: "Progressions", en: "Lesson progress" },
  },
  admin: {
    defaultColumns: ["customer", "lesson", "completed", "updatedAt"],
    group: learningGroup,
  },
  access: {
    read: ownsDocument("customer"),
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  indexes: [{ fields: ["customer", "lesson"], unique: true }],
  fields: [
    { name: "customer", type: "relationship", relationTo: "customers", required: true },
    { name: "lesson", type: "relationship", relationTo: "lessons", required: true },
    { name: "course", type: "relationship", relationTo: "courses", required: true, index: true },
    { name: "completed", type: "checkbox", defaultValue: false },
    { name: "completedAt", type: "date" },
    { name: "positionSec", type: "number", defaultValue: 0, min: 0 },
  ],
}
