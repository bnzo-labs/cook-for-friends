---
type: task
id: W1-04
status: pending
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
- [ ] `src/styles/tokens.css` matches DESIGN_SPEC §1 exactly. `globals.css` maps semantic tokens through Tailwind v4 `@theme inline` and aliases the shadcn variables to them.
- [ ] `grep -rE "#[0-9a-fA-F]{3,8}|rgb\(|oklch\(" src/components src/app` returns nothing (tokens only).
- [ ] shadcn/ui components installed into `src/components/ui/`: button, input, label, select, radio-group, dialog, sheet, badge, card, skeleton, sonner, separator, dropdown-menu. Restyled via tokens, with variants per DESIGN_SPEC §3.
- [ ] Fonts load via `next/font/google` (Fraunces 500/600, Inter 400/500/600) with `display: swap`, exposed as `--brand-font-*`.
- [ ] `src/components/layout/{SiteHeader,SiteFooter,LocaleSwitcher,Container,Section}.tsx` exist. The header has the logo placeholder, nav (Cours, Produits, Mon compte) and the locale switcher, and the switcher keeps the current path. Mobile nav uses `Sheet`.
- [ ] `<html lang>` equals the active locale. Landmarks are present. Skip-to-content link is present.
- [ ] Every string comes from `messages/{fr,en}.json` under `ui.*` / `layout.*`.
- [ ] Visual check with Playwright screenshots at 320, 768, 1024 and 1440 for `/fr` and `/en`, saved to `apps/web/e2e/__screenshots__/w1-04/`.
- [ ] axe check of the shell: 0 serious or critical violations.
- [ ] Changing `--brand-accent` and `--brand-font-display` in `tokens.css` alone changes the whole shell (shown by a screenshot diff in the task notes).

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
