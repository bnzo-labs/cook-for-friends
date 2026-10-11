import nextConfig from "eslint-config-next/core-web-vitals"

/**
 * Cook for Friends — ESLint flat config (ESLint 9 + Next.js 16)
 *
 * eslint-config-next@16.3.8 ships as a flat config array.
 * We spread it and add the module-boundary rule on top.
 */

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  // Next.js core-web-vitals rules (React, hooks, TypeScript, a11y, etc.)
  ...nextConfig,

  // Module boundary: block deep imports across modules.
  // Only @/modules/<name> (index) is importable from outside.
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules/*/!(index)"],
              message:
                "Deep module imports are forbidden. Import from '@/modules/<name>' (index only).",
            },
            {
              group: ["@/modules/*/*/**"],
              message:
                "Deep module imports are forbidden. Import from '@/modules/<name>' (index only).",
            },
          ],
        },
      ],
    },
  },
]

export default eslintConfig
