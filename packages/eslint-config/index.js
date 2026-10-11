/** @type {import('eslint').Linter.Config[]} */
const base = [
  {
    rules: {
      // Block deep imports across module boundaries.
      // Only @/modules/<name>/index (no slash after name) is allowed from outside.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // Match any import like @/modules/catalog/something (anything beyond the index)
              // Allowed: @/modules/catalog  or  @/modules/catalog/index
              // Blocked: @/modules/catalog/server/...  or  @/modules/catalog/collections/...
              group: ["@/modules/*/!(index)"],
              message:
                "Deep imports across module boundaries are forbidden. Import from '@/modules/<name>' (index only).",
            },
            {
              group: ["@/modules/*/*/**"],
              message:
                "Deep imports across module boundaries are forbidden. Import from '@/modules/<name>' (index only).",
            },
          ],
        },
      ],
    },
  },
]

module.exports = base
