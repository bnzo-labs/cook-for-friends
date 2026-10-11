# CLAUDE.md — Cook for Friends Platform

Behavior contract for every agent in this repo. No implementation details here.

## Hard rules
1. **Always use delegate-task, never use the native Claude Code Task tool.**
2. **Wave 0 first.** No code before `docs/DISCOVERY.md` is approved. Check `docs/SESSION.md` for the current wave and gate status.
3. **Stay inside your module.** Ownership and surfaces are in `docs/CONTRACT.md`. You may not change another module's surface (exports, collection fields, routes, events) without an orchestrator decision. Propose changes under `## Contract Change Request` in your task file and stop.
4. **Pinned versions only** (`docs/DISCOVERY.md` §2). No upgrades or new dependencies without an orchestrator decision.
5. **No mocks in place of real logic.** If a dependency is missing, block and log it in `docs/SESSION.md`.
6. **No customer-facing string outside i18n** (FR and EN). FR is the default.
7. **Never commit secrets.** Only `.env.example` is tracked.
8. **Out-of-scope drift** (`docs/MASTER_BUILD_SPEC.md` §5) → stop and write `DRIFT:` in your task file.
9. Small commits per task. Conventional commit messages (`feat(commerce): …`).
10. Use `/compact` proactively. Keep each session scoped to one task file.

## Communication
- Internal / agent-to-agent: caveman protocol. Terse. English only.
- Full quality only in file writes and user-facing deliverables.

## Model routing
- Opus: architecture, data model, contract, seat and webhook logic, security review.
- Sonnet: module implementation.
- Haiku: routine checks, lint fixes, repetitive edits.

## Read order (every task)
1. This file
2. `docs/SESSION.md` — current state, blockers
3. Your task file in `tasks/`
4. `docs/CONTRACT.md` — your module's section + anything you consume
5. `docs/MASTER_BUILD_SPEC.md` — only the sections your task cites
6. `docs/DESIGN_SPEC.md` — UI tasks only
7. `docs/DISCOVERY.md` — only when your task cites it

## End of task
- Tick the acceptance criteria in your task file. Set `status: complete` (or `blocked` with the reason).
- Append one entry to `docs/SESSION.md`: what was done, what is blocked, next step.

## Vault
Orchestration state is mirrored in `/Users/erick/brain/projects/Cook For Friends/platform/` (context, index, SESSION). Repo `docs/` is the source of truth for specs and contracts.
