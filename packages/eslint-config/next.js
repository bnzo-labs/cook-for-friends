const base = require("./index.js")

/** @type {import('eslint').Linter.Config[]} */
const nextConfig = [
  ...base,
  {
    rules: {
      // Prefer server components — no client-side only APIs in server files
      // (next-intl lint plugin covers i18n string usage)
    },
  },
]

module.exports = nextConfig
