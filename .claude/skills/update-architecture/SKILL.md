---
name: update-architecture
description: Sync ARCHITECTURE.md with the codebase after structural changes. Use when adding/removing packages or apps, changing dependencies between packages, the Session/Transport/authority model, event redaction, persisted or wire formats, platforms/wrappers, build tooling or quality gates, or when asked to update the architecture doc.
---

# Update ARCHITECTURE.md

ARCHITECTURE.md describes the **current** structure. It must match the repo.

## Steps

1. **Find what changed.** Run `git diff --stat` and `git diff` (plus `--staged`), and check for:
   - new or removed directories under `packages/` and `apps/`, and changes to `pnpm-workspace.yaml`;
   - `package.json` dependency changes, especially imports that cross the dependency rule (engine must import nothing from the workspace, and nothing below `apps/` may import Pixi or Svelte). You can check with `grep -rn "from '@sp/" packages/engine/src` and `grep -rln "pixi.js\|svelte" packages/`;
   - changes to `Session`, `SessionUpdate`, `Match`, `viewFor`, `eventsFor`, command or event types;
   - format version changes in `scenario.ts` and `match.ts` (Replay), or a new storage key;
   - changes to the `justfile`, CI workflow or test setup.
2. **Update the matching sections:**
   - §1 overview diagram and §2 layout table (path, status, responsibility, allowed dependencies);
   - §4 trust model;
   - §5 sessions;
   - §9 formats table;
   - §12 quality gates.
   Fix every drift you find, and keep status tags (✅ / 🟡 / 📋) accurate.
3. **Decide on an ADR.** If the change alters a boundary, the trust model, a format, a platform or a major dependency, use the `adr` skill (Kind `Architecture`, or `Both` if it affects play too). Supersede earlier ADRs it replaces, and link the ADR from the section.
4. **Cross-check AGENTS.md.** If a hard rule or a command changed, update AGENTS.md too.
5. **Verify:** run `just typecheck && just test`. If anything user-facing moved, also run `just e2e`.

## Output

Summarize: which sections changed, the ADR created or superseded, any dependency-rule violations found, and the verification results.
