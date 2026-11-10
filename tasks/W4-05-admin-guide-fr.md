---
type: task
id: W4-05
status: pending
wave: 4
batch: 4a
module: docs
agent: doc-updater
model: sonnet
depends-on: [W3-11]
migration-owner: false
---

# W4-05 — Guide d'administration en français (`docs/GUIDE_ADMIN_FR.md`)

## Mission
A French, non-technical usage guide that lets the client's staff run the platform with no developer help (MASTER §9: "A French admin usage guide exists in `docs/`"; rule 5 "Stripe is not the admin"). Every label quoted in the guide matches the real FR admin label in code.

## Context loading (in order)
1. `CLAUDE.md` · 2. `docs/SESSION.md` (all Wave 2–3 entries: defaults D1, D3, D9, D10, Q6–Q17) · 3. this file
4. `docs/MASTER_BUILD_SPEC.md` §3, §4, §6 · `docs/CONTRACT.md` §3, §5, §6 · `docs/DISCOVERY.md` §8
5. Source of truth for labels/behaviour (read only): `src/modules/catalog/{collections,globals}/**`, `src/modules/commerce/collections/**`, `src/modules/scheduling/**`, `src/modules/learning/collections/**`, `src/modules/video/admin/**`, `src/admin/**`, `src/i18n/messages/fr.json`, Payload `admin.group` names (Catalogue / Ventes / Clients / Apprentissage / Paramètres)

## Ownership
`docs/GUIDE_ADMIN_FR.md` only.

## Dependencies
Wave 3 merged (W3-11). Parallel with W4-00, W4-03b. Re-check in 4d against W4-03b changes (L-3/L-8 change nothing visible to staff; confirm).

## Tasks — sections (French, `vous`, short steps, one task per heading)
1. **Premiers pas:** connexion `/admin`, rôles admin vs personnel, changer de langue de l'interface, langue du contenu (FR par défaut, champs EN à remplir — sinon repli FR).
2. **Cours:** créer, champs obligatoires, format (en personne / en ligne), prix en dollars (stockés en cents), image, SEO, brouillon vs publié, archiver; **synchronisation Stripe automatique** (statut `stripeSyncStatus`: en attente / synchronisé / échec → que faire: réenregistrer, contacter le développeur si l'échec persiste). Jamais modifier le prix dans Stripe.
3. **Sessions (en personne):** date/heure (fuseau Montréal), lieu, niveau, capacité, places restantes, annuler une session.
4. **Leçons, matériel et vidéo:** créer une leçon, téléverser une vidéo (bouton Téléverser, progression, statut prêt/erreur, Remplacer, Prévisualiser), PDF/recettes, leçons d'aperçu (Q13).
5. **Codes promo:** créer, pourcentage vs montant, limite d'utilisation, expiration, désactiver; avertissement codes à 100 %.
6. **Crédits:** codes de crédit personnels émis par l'annulation (Q17: 365 jours), où les voir.
7. **Participants:** vue Participants d'une session, places invitées (« réservé par »), **export CSV** (Excel FR), marquer présence/absence.
8. **Annulations et remboursements:** politique d'annulation (global `cancellation-policy`: paliers, valeurs par défaut D1 ≥ 72 h remboursement, 24–72 h crédit, < 24 h aucun), annulation par le client vs par le personnel, remboursement partiel par place, délais Stripe.
9. **Liste d'attente:** fonctionnement (D10: `waitlistNotifyCount`, premier qui paie), courriels envoyés.
10. **Commentaires:** modération (en attente / approuvé / refusé), pas de réponses du personnel (Q14).
11. **Commandes et reçus:** consulter une commande, statut, reçu/facture Stripe, TPS/TVQ (D6: actif quand `STRIPE_TAX_ENABLED`).
12. **Réglages du site (`site-settings`):** `communityUrl` (lien vide = masqué), `maxSeatsPerPurchase` (1–10, défaut 4), `waitlistNotifyCount` (défaut 3), autres champs présents dans le global.
13. **Pages et blocs:** page d'accueil, blocs (héros, galerie, témoignages, appel à l'action, texte), page Politique de confidentialité (Loi 25).
14. **Courriels automatiques:** liste (confirmation, invité, rappels 48 h/24 h, attente, annulation, certificat, lien de connexion), langue = langue du client.
15. **Certificats:** émission automatique (cours en ligne, Q15), vérification publique par code.
16. **Ce qu'il ne faut jamais faire dans Stripe** + **Dépannage / FAQ** (cours absent du site, courriel non reçu, client sans accès → vérifier droit d'accès, double paiement).
17. Glossaire FR ↔ termes techniques (droit d'accès = entitlement, place retenue = seat hold).

## Done When
- [ ] All 17 sections present; every quoted admin label/field name matches the FR label in code (spot-check list of 20 labels with file:line in Completion notes).
- [ ] No developer jargon without a glossary entry; no secrets, URLs of staging, or env values.
- [ ] Defaults documented exactly as implemented (D1, D9, D10, Q13–Q17); where a value is still an open client decision, the guide says so in one line.
- [ ] Proofread pass (French typography: espaces insécables before `: ; ? !`, guillemets « »).
- [ ] PR open with the doc only.

## Erick handoffs
- Client review of the guide (tone, missing tasks). [ship as v1]

## DO NOT TOUCH
Any code, any other doc.

## Operating rules (Wave 4 — standing, from Wave 1–3 lessons)
- **Worktree:** `git -C /Users/erick/work/CookForFriends fetch origin && git -C /Users/erick/work/CookForFriends worktree add ../cff-<id> -b <id> origin/main` (`<id>` = lower-case task id, e.g. `w4-01`); then `cp -p /Users/erick/work/CookForFriends/apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit original `.env*`. Never `vercel env pull` / `vercel link` in the repo. Never commit `apps/web/AGENTS.md` / `apps/web/CLAUDE.md`.
- **Node 22 via nvm** (`nvm use 22`) before any `pnpm` command. `VIDEO_PROVIDER=fake` + `VIDEO_FAKE_ALLOWED=true` locally and in tests. Never in production.
- **Machine load rule: NO full local `next build`, NO `next start`/`next dev` app boot, NO parallel `tsc` runs.** Allowed locally: targeted `vitest run <file>`, single `pnpm -C apps/web typecheck` (one at a time), `pnpm -C apps/web lint`. **CI is the evidence** — push to your PR branch and read the CI run (`gh run watch`, `gh run view --log-failed`). Playwright and Lighthouse run only in the CI `e2e` job.
- **Never set `PAYLOAD_DB_PUSH=1`** and never boot Payload in dev mode against shared Neon `dev`/`staging` (schema push corrupted enums once, PR #12).
- **Neon:** `neonctl branches create` may be denied — do **not** work around it (no other credentials, no other tools). Integration tests run in CI on the per-run branch; make sure your tests actually run there (not skipped). **Never Neon `production` (`main` branch).** **Never write to staging** (DB, Stripe staging webhook, Vercel env) without an explicit Erick OK recorded in this file.
- **Migrations:** only the migration owner named in the plan (Wave 4: W4-03b, only if a finding needs it) runs `migrate:create` and regenerates `src/payload-types.ts`; up/down/up proven in CI. Orchestrator applies after merge. Anyone else needing schema → `## Contract Change Request` here, `status: blocked`, exit.
- **Payload unique conflicts:** detect by the error's column/field **path** (e.g. `error.data.errors[].path`), never by matching message text (localized / driver-specific).
- **i18n:** every next-intl `t()` with ICU placeholders gets its values. FR + EN key parity (i18n test): add both or neither, only under your namespace(s); on rebase conflict keep both sides.
- **`[locale]` routes:** `assertLocale(params.locale)` before any DB/module call.
- **Dates:** `Intl.DateTimeFormat(locale, { timeZone: 'America/Toronto' })`; no CSS `capitalize`/`uppercase` on FR dates.
- **Contrast:** text ≥ 4.5:1; secondary text `text-fg-muted`, never `text-fg-subtle`; no hard-coded colors (DESIGN_SPEC §7).
- **E2E:** Playwright with system Chrome in CI (`PW_CHANNEL=chrome`); deterministic waits (poll DB/HTTP), no fixed sleeps; assertions scoped to your own fixtures (no global counts — the CI branch is shared by all specs in the run).
- **Secrets:** never print, log or commit keys/secrets/bypass tokens; `::add-mask::` anything derived in CI.
- **Git:** small conventional commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Never force push** (need main? merge `origin/main` into your branch). Push, **open a PR** (`gh pr create`, title `<type>(<ID>): …`), **never merge** — the orchestrator merges. PR body: summary, criteria checklist, CI run link(s), deviations, Erick handoffs; last line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Do not edit `docs/SESSION.md`** or `docs/MASTER_BUILD_SPEC.md`. Notes go in the PR body and `## Completion notes` at the bottom of this file. Tick criteria here; set `status: complete` (or `blocked` + reason).
- **Fully autonomous.** Never wait for Erick: every handoff has a workaround; use it and record it. Real blocker → `status: blocked` + reason here + PR note, exit. Out-of-scope drift (MASTER §5) → stop, write `DRIFT:` here.

## Communication
Caveman. English only.
