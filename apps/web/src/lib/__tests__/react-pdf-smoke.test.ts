// Server-only smoke: @react-pdf/renderer renders a PDF to a Buffer under Node (no Chromium).
import { createElement } from "react"
import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer"
import { describe, expect, it } from "vitest"

describe("@react-pdf/renderer smoke", () => {
  it("renders a 1-page PDF buffer", async () => {
    const doc = createElement(
      Document,
      null,
      createElement(Page, { size: "A4" }, createElement(Text, null, "Cook For Friends")),
    )
    const buf = await renderToBuffer(doc as Parameters<typeof renderToBuffer>[0])
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-")
    expect(buf.length).toBeGreaterThan(500)
  })
})
