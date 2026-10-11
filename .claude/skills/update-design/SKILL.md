---
name: update-design
description: Sync DESIGN.md (game rules) with the engine and content after any gameplay change. Use when changing rules, AP costs, formulas, weapons/unit stats, vision, reaction fire, victory conditions, turn structure, scenarios or onboarding/UX rules, or when asked to update the game design doc.
---

# Update DESIGN.md

DESIGN.md describes the **current** rules. The code is the source of truth: the docs follow the code, never the other way round.

## Steps

1. **Find what changed.** Run `git diff` and `git diff --staged`, or read the described change. Focus on:
   - `packages/engine/src/`: `rules.ts` (combat, reaction, victory, turns), `path.ts` (AP costs), `grid.ts` (view range/arc, LOS, blocking), `scenario.ts` (legend, feature HP, schema), `view.ts` (what a side knows).
   - `packages/content/src/weapons.ts` and `packages/content/src/scenarios/*.json`.
   - `packages/ai/src`, for AI behavior notes.
   - `apps/web/src/lib/controller.svelte.ts`, `apps/web/src/tutorial/steps.ts` and `apps/web/src/lib/settings.svelte.ts`, for UX and onboarding rules.
2. **Read the matching DESIGN.md sections** and compare every number, formula and table against the code. Fix every mismatch, including old drift you didn't cause.
3. **Update status tags** (✅ / 🟡 / 📋) when a planned rule ships, and move it out of "Planned rules".
4. **Balance changes:** run `just balance 20 <scenario>` and add a row to the "Balance log" table: date, scenario, result, notes.
5. **Decide on an ADR.** If the change alters how the game plays, rather than only fixing a bug toward the documented rule, use the `adr` skill:
   - Kind `Game design`, with exact before → after numbers.
   - If it reverses an earlier design ADR, supersede that one.
   - Link the new ADR from the DESIGN.md section.
6. **Player-facing text:** if the rule is explained to players, update the matching `codex.*`, `tut.*` or `coach.*` strings in **both** `packages/i18n/locales/en.json` and `cs.json`.
7. **Verify:** run `just test`. The i18n coverage test catches missing keys. Add or adjust an engine test that pins the new rule.

## Output

Summarize for the user: which DESIGN.md sections changed, which ADR was created or superseded, which strings were updated, and the test results.
