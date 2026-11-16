import { Fraunces, Inter } from "next/font/google"

/**
 * Placeholder brand fonts (DESIGN_SPEC §1). Swap here and in
 * `--brand-font-*` of tokens.css when the real brand lands (D4).
 */
export const fontDisplay = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  // EXPERIMENT (W4-02): optional avoids the late swap that moves LCP to font arrival.
  display: "optional",
  variable: "--font-fraunces",
})

export const fontBody = Inter({
  subsets: ["latin"],
  // Variable font: one file instead of three static weights (fewer requests, same 400-600 range).
  display: "swap",
  adjustFontFallback: true,
  variable: "--font-inter",
})
