// Usage (CI): NODE_OPTIONS="--import ./test/e2e-esm-register.mjs" pnpm exec playwright test
import { register } from "node:module"

register("./e2e-esm-hooks.mjs", import.meta.url)
