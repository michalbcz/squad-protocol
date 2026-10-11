# AGENTS.md

Instructions for coding agents (and humans) working in this repo.

## Project

**Squad Protocol**: a spiritual remake of 8-bit turn-based squad tactics. It is web-first (TypeScript, PixiJS 8, Svelte 5) and will be wrapped for desktop/Steam (Tauri) and mobile (Capacitor).

- Game rules: [DESIGN.md](DESIGN.md)
- System structure: [ARCHITECTURE.md](ARCHITECTURE.md)
- Why things are the way they are: [docs/adr](docs/adr/README.md)

## Commands

Run `just` to see every recipe. Common ones:

```sh
just doctor      # verify toolchain
just install     # pnpm install
just dev         # dev server :5173
just run         # production build + preview :4173
just check       # typecheck + unit + e2e (what CI runs)
just test        # unit tests only (Vitest)
just e2e         # Playwright (desktop + mobile-touch)
just balance 20  # AI-vs-AI balance report
just adr "Title" # new decision record
```

Before declaring work done, run `just typecheck && just test`. If you touched UI, input or flows, also run `just e2e`.

## Hard rules

1. **The engine stays pure.** `packages/engine` must not import DOM, Pixi, Svelte, Node APIs or other workspace packages. All randomness goes through the seeded RNG in state. Never use `Math.random` or `Date.now` in rules.
2. **Rules belong in the engine, not the UI.** If the UI needs a number (cost, hit chance, path), add or reuse a pure engine helper.
3. **Never leak hidden information.** Clients get only `viewFor` / `eventsFor` output. New event types must set `seenBy` (and `originSeenBy` for anything with a hidden origin), and `eventsFor` must redact them. Add a test proving no leak.
4. **Commands are plain data.** Snapshot Svelte `$state` before building commands (`$state.snapshot`).
5. **No hard-coded user-facing text.** Add keys to `packages/i18n/locales/en.json` **and** `cs.json`. The i18n test fails on missing keys. Never draw text in the Pixi canvas: use DOM overlays.
6. **Every input method is first-class.** New interactions must work with touch (no hover), mouse, keyboard and gamepad. Dialog and tutorial primary buttons get `data-primary`.
7. **Original content only** ([ADR 0006](docs/adr/0006-spiritual-remake-ip.md)). Don't add names, maps, art or text from the original games.
8. **Versioned formats** (scenario, replay, and the future net protocol) need a version bump, a migration and an ADR when they change.

## Keeping docs in sync (required)

- **Changed a game rule, formula, tunable, unit/weapon stat, victory condition or UX rule?** Use the **`update-design`** skill (`.claude/skills/update-design/SKILL.md`). It updates DESIGN.md and writes a Game design ADR when the change matters.
- **Changed packages, boundaries, data flow, the trust model, a persisted/wire format, a platform or a dependency with structural impact?** Use the **`update-architecture`** skill (`.claude/skills/update-architecture/SKILL.md`).
- **Any significant decision:** use the **`adr`** skill (`.claude/skills/adr/SKILL.md`). ADRs are immutable once accepted. To reverse one, supersede it with a new ADR.
- Pure refactors, bug fixes and test-only changes need no ADR, but DESIGN.md and ARCHITECTURE.md must still match the code.

## Code style

- TypeScript strict with `noUncheckedIndexedAccess`. Comments are sparse and explain *why*.
- Svelte 5 runes. Put reactive classes in `*.svelte.ts`.
- Tests: unit tests in `packages/*/test/*.test.ts`, e2e tests in `e2e/*.spec.ts`. The e2e hook `window.__sp` only exists with `?e2e`.
