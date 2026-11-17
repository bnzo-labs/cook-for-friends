import localFont from "next/font/local"

/**
 * Self-hosted brand fonts (DESIGN_SPEC §1): no network font fetch at build or runtime
 * (next/font/google flaked the CI build twice). Both are variable woff2, latin subset
 * (covers all FR + EN text). Licenses: Fraunces and Inter are SIL OFL 1.1.
 * Swap here and in `--brand-font-*` of tokens.css when the real brand lands (D4).
 * Files: src/styles/fonts-files/ (from Google Fonts, v38 / v20).
 */
export const fontDisplay = localFont({
  src: [{ path: "./fonts-files/fraunces-latin-var.woff2", weight: "500 600", style: "normal" }],
  display: "swap",
  adjustFontFallback: "Times New Roman",
  fallback: ["Georgia", "serif"],
  variable: "--font-fraunces",
})

export const fontBody = localFont({
  src: [{ path: "./fonts-files/inter-latin-var.woff2", weight: "400 600", style: "normal" }],
  display: "swap",
  adjustFontFallback: "Arial",
  fallback: ["system-ui", "sans-serif"],
  variable: "--font-inter",
})
