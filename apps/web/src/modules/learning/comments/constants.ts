export const COMMENT_MAX_LENGTH = 2000
/** 10 comments per customer per hour (CONTRACT §5.1). */
export const COMMENT_RATE_LIMIT = { namespace: "comments", limit: 10, windowSeconds: 3600 } as const
