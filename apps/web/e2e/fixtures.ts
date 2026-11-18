/**
 * W4-03a — shared e2e `test`: every page opened through the default `context`
 * fails the test on any CSP violation (securitypolicyviolation event or CSP console error).
 * Specs import { test, expect } from "./fixtures" instead of "@playwright/test".
 * Contexts created manually via browser.newContext() are not covered.
 */
import { test as base } from "@playwright/test"

export * from "@playwright/test"

export const test = base.extend<{ cspGuard: void }>({
  cspGuard: [
    async ({ context }, use) => {
      const violations: string[] = []
      await context.exposeBinding("__reportCsp", (_src, msg: string) => {
        console.log(`[CSP] ${msg}`)
        violations.push(msg)
      })
      await context.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (e) => {
          const report = (window as unknown as { __reportCsp?: (m: string) => void }).__reportCsp
          report?.(`${e.violatedDirective} blocked=${e.blockedURI} at=${location.pathname}`)
        })
      })
      const watch = (page: import("@playwright/test").Page) =>
        page.on("console", (m) => {
          if (/content security policy/i.test(m.text())) {
            console.log(`[CSP console] ${m.text().slice(0, 300)}`)
            violations.push(m.text().slice(0, 300))
          }
        })
      context.pages().forEach(watch)
      context.on("page", watch)
      await use()
      if (violations.length > 0) {
        throw new Error(`CSP violations:\n${[...new Set(violations)].join("\n")}`)
      }
    },
    { auto: true },
  ],
})
