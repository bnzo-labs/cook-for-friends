import { inflateSync } from "node:zlib"

/** Decode the hex strings of every (deflated) content stream, in order. */
export function extractPdfText(buf: Buffer): string {
  const raw = buf.toString("latin1")
  let out = ""
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content: string
    try {
      content = inflateSync(Buffer.from(m[1]!, "latin1")).toString("latin1")
    } catch {
      content = m[1]!
    }
    for (const h of content.matchAll(/<([0-9a-fA-F]+)>/g)) out += Buffer.from(h[1]!, "hex").toString("latin1")
    out += "\n"
  }
  return out
}
