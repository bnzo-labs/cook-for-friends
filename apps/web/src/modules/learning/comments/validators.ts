import { z } from "zod"

import { COMMENT_MAX_LENGTH } from "./constants"

const id = z.union([z.number().int().positive(), z.string().regex(/^\d{1,18}$/)])

/** Body is trimmed, 1..2000 chars, stored verbatim otherwise (plain text, no HTML processing). */
export const postCommentSchema = z.object({
  lessonId: id,
  body: z.string().trim().min(1).max(COMMENT_MAX_LENGTH),
  parentId: id.optional(),
})
export type PostCommentInput = z.infer<typeof postCommentSchema>
