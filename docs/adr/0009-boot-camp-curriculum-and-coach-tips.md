# 0009. Four-mission Boot Camp with scripted opponents and contextual coach tips

- **Status:** Accepted
- **Date:** 2026-10-11
- **Kind:** Both
- **Affects:** DESIGN.md §3, §9, §10, §11; ARCHITECTURE.md §5, §6, §9; apps/web/src/tutorial/*, apps/web/src/lib/session.ts, packages/engine/src/scenario.ts

## Context

The first tutorial was a single mission. It covered selecting, moving, doors and shooting, but not the ideas that decide real games: reaction fire, physical shots and destructible cover, range versus fire mode, and squad play. Returning players also had no lightweight way to pick up tactics they'd forgotten. Reaction fire is probabilistic and depends on what the opponent does, so a lesson that relies on the regular AI might never show the effect.

## Decision

**Curriculum.** Boot Camp is four missions on the real engine. Progress is stored per mission, any mission can be replayed, and each completed mission offers the next:
1. **First Steps** (11 steps): camera, selecting, AP, movement and path preview, doors and auto-stop on spotting, fog, facing and turning, fire modes, first shots.
2. **Cover & Fire** (8 steps): shots travel and stop at the first obstacle, crates block sight, destroying cover leaves rubble (+2 AP), previewing hit chance, Snap vs Aimed, closing the range, Auto.
3. **Reaction Fire** (8 steps): reaction fire from saved AP, facing a doorway, ending the turn with a reserve, a scripted enemy walking into view, the enemy's own reserve, movement interruption.
4. **Squad Tactics** (7 steps): switching soldiers, weapon roles, bounding overwatch, flanking, focus fire, against the regular AI.

**Scripted opponents.** `LocalSession` accepts `script: side → turn → Command[]`. Scripted commands run first on their turn, illegal ones are skipped, and the regular AI takes over afterwards. A test pins mission 3: Vega's reaction fire must trigger in at least 75% of seeds. The measured rate is about 90%, because Vega keeps 36 of 40 AP.

**Map legend.** New symbol `d` for an open door, so mission 3 can show line of sight through a doorway on turn 1.

**Tips & tricks.**
- 16 general tips, shown in How to play › Tips & tricks (searchable), as a daily "Tip of the day" in the main menu, and as 3 rotating cards in the refresher.
- 9 contextual coach tips, shown outside tutorials when coach mode is on, each **once per profile**:

| Tip | Shown when |
| --- | --- |
| `lowChance` | hit chance < 30% |
| `tooFar` | path longer than your AP |
| `spotted` | movement interrupted by a new enemy |
| `enemyReaction` / `ownReaction` | a reaction shot happens |
| `coverHit` | your miss hits cover |
| `noReserve` | ending a turn with no snap reserve anywhere |
| `wounded` | own soldier below 40% HP |
| `unitLost` | own soldier killed |

The toast can be dismissed, or tips can be turned off entirely. Settings can reset seen tips and Boot Camp progress.

## Consequences

- Tutorial missions and tips are data (`tutorial/steps.ts`, `tutorial/tips.ts`). `apps/web/test/tutorial.test.ts` checks scenario references, tile hints, string coverage and the mission 3 script. Vitest now includes `apps/*/test`.
- `UiSignal` gains `events`, `check`, a user-only `camera`, and `previewed` now carries the whole preview. `Board.onCamera(user)` distinguishes the player's pans and zooms from programmatic camera moves.
- The settings shape changed: `tutorialDone` became `bootCamp: string[]` (migrated on load), plus a new `seenTips: string[]`.
- `?seed=N` makes games reproducible for e2e tests and bug reports.
- Planned: a mission for inventory and explosives once those rules ship. Coach tips for facing and exposure need a threat model.

## Alternatives considered

- **One long tutorial mission** – tiring, and impossible to revisit in parts after a break.
- **Video or slide tutorials** – they don't teach the feel, and they can drift from the actual rules.
- **Relying on the regular AI in the reaction lesson** – the lesson might never happen. A scripted turn makes it reliable while the outcome still uses real dice.
- **Coach tips that repeat every game** – noisy for experienced players. Once per profile, plus a reset, respects both groups.
