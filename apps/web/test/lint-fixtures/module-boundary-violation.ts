/**
 * LINT FIXTURE — This file MUST fail ESLint with no-restricted-imports.
 *
 * It demonstrates that deep module imports are correctly blocked.
 * Run `pnpm lint` and expect an error on the import below.
 *
 * This file is intentionally NOT excluded from lint to prove the rule works.
 * It is excluded from the TypeScript build (test/ is outside src/).
 */

// This import crosses the module boundary (imports from a non-index path).
// ESLint should flag: "Deep module imports are forbidden."
// eslint-disable-next-line -- Remove this line to see the lint error
import type { SomeType } from "@/modules/catalog/collections/Courses" // @expected-lint-error

export {}
