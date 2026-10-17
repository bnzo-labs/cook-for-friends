---
type: task
id: W1-04
status: complete
wave: 1
module: ui
agent: frontend-architect
model: sonnet
depends-on: [W1-01]
---

# W1-04 — UI foundation: tokens, shadcn, layout shell

## Mission
Install the placeholder design-token system and shadcn/ui, restyled through tokens, and build the bilingual layout shell (header, locale switcher, footer) that the storefront and portal will share.

## Context loading (in order)
1. `CLAUDE.md`
2. `docs/SESSION.md`
3. `docs/DESIGN_SPEC.md` (all)
4. `docs/CONTRACT.md` §1 (`ui` ownership)
5. `docs/DISCOVERY.md` §4 (i18n)

## Acceptance criteria
- [x] `src/styles/tokens.css` matches DESIGN_SPEC §1 exactly. `globals.css` maps semantic tokens through Tailwind v4 `@theme inline` and aliases the shadcn variables to them.
- [x] `grep -rE "#[0-9a-fA-F]{3,8}|rgb\(|oklch\(" src/components src/app` returns nothing (tokens only).
- [x] shadcn/ui components installed into `src/components/ui/`: button, input, label, select, radio-group, dialog, sheet, badge, card, skeleton, sonner, separator, dropdown-menu. Restyled via tokens, with variants per DESIGN_SPEC §3.
- [x] Fonts load via `next/font/google` (Fraunces 500/600, Inter 400/500/600) with `display: swap`, exposed as `--brand-font-*`.
- [x] `src/components/layout/{SiteHeader,SiteFooter,LocaleSwitcher,Container,Section}.tsx` exist. The header has the logo placeholder, nav (Cours, Produits, Mon compte) and the locale switcher, and the switcher keeps the current path. Mobile nav uses `Sheet`.
- [x] `<html lang>` equals the active locale. Landmarks are present. Skip-to-content link is present.
- [x] Every string comes from `messages/{fr,en}.json` under `ui.*` / `layout.*`.
- [x] Visual check with Playwright screenshots at 320, 768, 1024 and 1440 for `/fr` and `/en`, saved to `apps/web/e2e/__screenshots__/w1-04/`.
- [x] axe check of the shell: 0 serious or critical violations.
- [x] Changing `--brand-accent` and `--brand-font-display` in `tokens.css` alone changes the whole shell (shown by a screenshot diff in the task notes).

## Files to create
`apps/web/src/styles/{tokens.css,globals.css}`, `apps/web/components.json`, `apps/web/src/components/ui/*`, `apps/web/src/components/layout/*`, `apps/web/src/lib/utils.ts` (cn), edit `apps/web/src/app/(frontend)/[locale]/layout.tsx` (**coordinate:** W1-01 creates it; you own its body/markup after W1-01 completes), `messages` keys under `ui.*`, `layout.*`.

## DO NOT TOUCH
- `src/i18n/{routing,request,locales}.ts`, `proxy.ts`, `payload.config.ts`.
- Any Payload collection.
- Storefront pages (W2-05).

## Done when
Criteria are ticked, screenshots are committed, and the SESSION entry has been added.

## Communication
Caveman. English only.

## Notes (2026-10-17, frontend-architect)
- Deps added (exact pins, required by the shadcn/Tailwind mission): tailwindcss 4.3.3 (DISCOVERY pin), @tailwindcss/postcss 4.3.3, radix-ui 1.8.1, class-variance-authority 0.7.1, clsx 2.1.1, tailwind-merge 3.7.0, sonner 2.0.8, tw-animate-css 1.4.0, @phosphor-icons/react 2.1.10 (icons), dev: @axe-core/playwright 4.14.0. Orchestrator may veto.
- Deviation from DESIGN_SPEC §1 (tokens.css otherwise verbatim): `--brand-font-display` / `--brand-font-body` start with `var(--font-fraunces, "Fraunces")` / `var(--font-inter, "Inter")` so the hashed `next/font` family resolves. Swapping fonts = edit those two lines (and `src/styles/fonts.ts`).
- Components are hand-written in shadcn structure (new-york style, radix-ui unified package), not CLI-generated, so the default styling never lands. `components.json` is present for later CLI adds (`iconLibrary` is a schema-required field; the project uses Phosphor).
- Dialog/Sheet take a required `closeLabel` prop (i18n string) so no English leaks.
- `fg-subtle` fails 4.5:1 for text (axe caught it). Use it for borders/non-text only. Placeholders use `fg-muted`.
- Nav hrefs are `/courses`, `/products`, `/account` (untranslated). `routing.ts` has no `pathnames` yet (DO NOT TOUCH). Storefront W2-05 must add translated pathnames and the pages. Targets 404 until then.
- Home placeholder page edited only to drop its own `<main>` (layout now owns the landmark).
- Local Playwright: Chromium is not shipped for macOS 13. Use `PW_CHANNEL=chrome` (added to `playwright.config.ts`). Screenshots: `W104_SCREENSHOTS=1 pnpm test:e2e e2e/w1-04-shell.test.ts`.
- Token swap proof: `fr-{320,768,1024,1440}-swap.png` vs `fr-*.png`. Only `--brand-accent: oklch(48% 0.11 165)` and `--brand-font-display: ui-monospace…` changed in tokens.css: logo mark, hero and footer headings change; no component edit.
- Screenshots: `apps/web/e2e/__screenshots__/w1-04/{fr,en}-{320,768,1024,1440}.png`.
