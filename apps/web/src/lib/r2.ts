/**
 * r2.ts — platform-owned Cloudflare R2 helpers (server-only).
 *
 * presignR2Get: short-lived presigned GET URL for a private-bucket object.
 * Signing is offline (no network call).
 */
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

import { env } from "@/lib/env"

if (typeof window !== "undefined") {
  throw new Error("@/lib/r2 is server-only and must not be imported in the browser")
}

export type ISODate = string

export const R2_PRESIGN_MIN_TTL_SECONDS = 60
export const R2_PRESIGN_MAX_TTL_SECONDS = 900

export interface PresignR2GetInput {
  key: string
  ttlSeconds: number
  filename?: string
  contentType?: string
}

let client: S3Client | undefined

function getClient(): S3Client {
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  })
  return client
}

/** RFC 5987 / 6266 attachment disposition with ASCII fallback + UTF-8 filename*. */
export function attachmentDisposition(filename: string): string {
  const clean = filename.replace(/[\r\n]/g, " ")
  const ascii = clean.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_")
  const encoded = encodeURIComponent(clean).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

export async function presignR2Get(
  i: PresignR2GetInput,
): Promise<{ url: string; expiresAt: ISODate }> {
  const ttl = Math.min(
    R2_PRESIGN_MAX_TTL_SECONDS,
    Math.max(R2_PRESIGN_MIN_TTL_SECONDS, Math.floor(i.ttlSeconds)),
  )
  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: i.key,
    ...(i.filename ? { ResponseContentDisposition: attachmentDisposition(i.filename) } : {}),
    ...(i.contentType ? { ResponseContentType: i.contentType } : {}),
  })
  const issuedAt = Date.now()
  const url = await getSignedUrl(getClient(), command, { expiresIn: ttl })
  return { url, expiresAt: new Date(issuedAt + ttl * 1000).toISOString() }
}
