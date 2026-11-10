/**
 * Node ESM resolve hooks for the Playwright test process ONLY (never shipped).
 * Specs seed fixtures through the Payload Local API, which loads app modules
 * natively as ESM (apps/web is "type": "module"). Two things differ from the
 * bundler/Vitest resolution the app code is written for:
 *  - extensionless `next/<x>` subpaths (next/navigation, next/headers, ...)
 *  - `server-only` (throws outside the react-server condition)
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: "data:text/javascript,export {}", shortCircuit: true }
  }
  try {
    return await nextResolve(specifier, context)
  } catch (err) {
    if (err && err.code === "ERR_MODULE_NOT_FOUND" && /^next\/[\w-]+(\/[\w-]+)*$/.test(specifier)) {
      return nextResolve(`${specifier}.js`, context)
    }
    throw err
  }
}
