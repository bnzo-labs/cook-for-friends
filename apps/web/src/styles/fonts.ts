import { Fraunces, Inter } from "next/font/google"

/**
 * Placeholder brand fonts (DESIGN_SPEC §1). Swap here and in
 * `--brand-font-*` of tokens.css when the real brand lands (D4).
 */
export const fontDisplay = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
  variable: "--font-fraunces",
})

export const fontBody = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-inter",
})
