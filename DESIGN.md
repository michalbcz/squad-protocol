# Squad Protocol: Game Design

This file is the **current** rules of the game. Code in `packages/engine` is the source of truth, and this document must match it. The *why* behind each rule lives in [`docs/adr`](docs/adr/README.md). When a rule changes, update this file and add an ADR (use the `update-design` skill).

Status tags: ✅ implemented · 🟡 partial · 📋 planned

## 1. Scope & pillars

A spiritual remake of 8-bit turn-based squad tactics ([ADR 0006](docs/adr/0006-spiritual-remake-ip.md)). All names, maps and art are original.

1. **Every AP is a decision.** Spend it now, or save it for reaction fire.
2. **You only know what your soldiers see.** Fog hides units, not terrain.
3. **Physical shots.** Misses fly on, and cover can be destroyed.
4. **Easy to (re)learn.** Previews show cost and odds before you commit, the tutorial runs on the real rules, and a refresher greets returning players.

## 2. Turn structure ✅

- Sides act in scenario order. The **turn counter** goes up when play wraps back to the first side.
- On its turn a side may give any number of commands to its own living units, in any order, then **End turn**.
- At the start of a side's turn its living units refill to **max AP**. The outgoing side **keeps** its leftover AP as a reaction reserve ([ADR 0007](docs/adr/0007-ap-movement-and-reaction-fire.md)).
- On turn 1 every side except the first starts with **0 AP**, so there is no reaction fire before they've acted.

## 3. Map ✅

A square grid, 8-directional. Tiles have a terrain type and an optional feature.

| Symbol | Tile | Walk | Sight | Structural HP |
| --- | --- | --- | --- | --- |
| `.` | Floor | ✔ | ✔ | – |
| `,` | Grass | ✔ | ✔ | – |
| `:` | Rubble | ✔ (+2 AP) | ✔ | – |
| `~` | Water | ✘ | ✔ | – |
| ` ` | Void | ✘ | ✘ | – |
| `#` | Wall | ✘ | ✘ | 40 |
| `D` / `d` | Door, closed / open | ✔ (+2 AP, opens) / ✔ | ✘ / ✔ | 20 |
| `C` | Crate | ✘ | ✘ | 15 |
| `W` | Window | ✘ | ✔ | 1 |

A destroyed feature becomes **rubble**.

## 4. Action points & movement ✅

| Action | AP |
| --- | --- |
| Straight step | 2 |
| Diagonal step | 3 |
| Extra cost entering rubble | +2 |
| Extra cost walking through a closed door (opens it) | +2 |
| Turn, per 45° | 1 |
| Open/close an adjacent door (Door action) | 2 |
| Fire | weapon/mode cost + turning needed to face the target |

- Moving into a tile first turns the unit to face that direction, at the normal turn cost.
- Diagonal steps may not cut a corner past a blocking tile.
- You can't walk through friendly units. Paths are planned only around enemies you can see.
- **Movement interruption:**
  - The move stops after a step that brings a **new enemy into view**.
  - The move stops before a tile held by a **hidden enemy**.
  - The move ends if the mover is killed.
- A path costing more than the unit's AP is cut short to what it can afford (the UI shows unaffordable steps in red).
- A door can't be closed while a unit stands in it.

## 5. Vision & information ✅

- **View range:** 14 tiles (Euclidean).
- **View arc:** 180°, i.e. tiles whose direction is within ±90° of the unit's facing. The 8 adjacent tiles are always visible.
- **Line of sight:** a Bresenham line. Walls, crates and closed doors on the tiles in between block it; windows and open doors don't.
- **What a side knows** ([ADR 0004](docs/adr/0004-host-authority-and-redaction.md)):
  - the whole map layout;
  - its own units;
  - enemy units currently in sight, with their **AP hidden**;
  - events it witnessed, with unseen details redacted: a hidden shooter's identity and origin, the hidden start of a move, and moves out of sight are dropped.
- 📋 Remembered "last seen" markers for players. The AI already keeps one.

## 6. Combat ✅

### Fire modes & hit chance ([ADR 0008](docs/adr/0008-hit-chance-and-ballistics.md))

```
hit% = clamp(accuracy × modeMultiplier − max(0, distance − 3) × 3.5, 5, 95)
```

- The target tile must be visible after turning to face it, and within weapon range.
- **Auto** fires `autoShots` separate shots, each rolled independently.
- **Hit:** the ray travels to the target. **Miss:** the aim point is offset by a random −2..+2 tiles on each axis, and the ray continues to the weapon's range.
- The first **unit** or **blocking feature** (wall, crate, closed door, window) on the ray is struck.
- **Damage:** `roll(min..max) − armor` (at least 0) to units, and the full roll to features. A unit at 0 HP is killed.

### Weapons (`packages/content/src/weapons.ts`)

| Weapon | Range | Damage | Snap AP / mult | Aimed AP / mult | Auto AP / mult × shots |
| --- | --- | --- | --- | --- | --- |
| Pulse rifle | 16 | 12–22 | 6 / 0.80 | 12 / 1.15 | 10 / 0.60 × 3 |
| Marksman laser | 22 | 20–32 | 8 / 0.75 | 14 / 1.30 | – |
| Sidearm | 10 | 8–14 | 4 / 0.90 | 8 / 1.10 | – |

### Reaction fire ([ADR 0007](docs/adr/0007-ap-movement-and-reaction-fire.md))

After **each step** of an enemy move, every opposing unit that meets all of these:
- it can see the mover,
- the mover is within range,
- it holds AP of at least its weapon's snap cost,

fires a snap shot with probability `currentAP / maxAP`. The shot spends AP and turns the shooter as usual.

## 7. Units ✅

Each unit has max AP, max HP, armor (flat damage reduction), accuracy (0–100), one weapon, a facing and a position. Scenarios define the stats per unit.

## 8. Victory ✅

Conditions are checked in the order the scenario lists them, after every command:
- `eliminate`: when at most one side has living units, that side wins (or it's a draw if none).
- `turnLimit { turns, winner }`: when the turn counter passes `turns`, `winner` wins.

## 9. Modes

| Mode | Status |
| --- | --- |
| Single player vs AI (AI uses only its own view) | ✅ |
| Local hotseat with an opaque hand-off screen | ✅ |
| Boot Camp tutorial ([ADR 0009](docs/adr/0009-boot-camp-curriculum-and-coach-tips.md)) | ✅ 4 missions; 📋 a 5th for inventory and explosives |
| Online / LAN / tunnel multiplayer | 📋 [ADR 0005](docs/adr/0005-network-topology.md) |
| Scenario editor | 📋 |

## 10. Onboarding & UX rules ✅

- **Preview before commit:**
  - touch: first tap previews, a second tap on the same tile confirms;
  - mouse: hover previews, click confirms;
  - keyboard/gamepad: the cursor previews, confirm commits.
- Previews show AP cost and AP left (moves), or hit % and AP cost (shots).
- Tutorial prompts adapt to the last-used input device (touch / mouse / keyboard / gamepad wording and key glyphs).
- **Boot Camp** ([ADR 0009](docs/adr/0009-boot-camp-curriculum-and-coach-tips.md)): four short missions on the real rules.
  - The curriculum:
    1. **First Steps**: camera, select, AP, move, doors, fog, facing, firing.
    2. **Cover & Fire**: physical shots, destroying cover, rubble, hit chance, Snap vs Aimed, range, Auto.
    3. **Reaction Fire**: a scripted ambush and the enemy's reserve.
    4. **Squad Tactics**: switching soldiers, roles, overwatch, flanking, focus fire.
  - Progress is stored per mission, missions can be replayed, and winning one offers the next.
  - Steps advance when the player actually does the thing. Information steps use Continue, and keyboard/gamepad confirm presses it.
- **Tips & tricks:**
  - 16 tips in How to play (searchable).
  - A tip of the day in the main menu.
  - 3 rotating tip cards in the refresher.
- **Coach tips:** 9 situational toasts during non-tutorial games, e.g. hit chance < 30%, a path longer than your AP, reaction fire received or fired, a miss hitting cover, ending a turn with no snap reserve, a soldier below 40% HP. Each is shown **once per profile**. Coach mode is on by default and can be turned off from a toast or in the pause menu; Settings can reset tips.
- The unit panel coach hint explains the snap-cost reserve.
- Players returning after **14+ days** get a refresher: 5 rule cards plus 3 tips, with a shortcut to replay Boot Camp.

## 11. Scenarios

Scenarios are versioned JSON (`squad-protocol/scenario` v1, zod schema in `packages/engine/src/scenario.ts`) with map rows, sides, units, victory conditions and per-locale strings. Shipped:
- `bootcamp1`–`bootcamp4` (tutorial; mission 3 uses a scripted opponent turn);
- `kestrel` (4v4 compound assault).

## 12. Planned rules 📋

- Inventory and weight; pick up, drop, throw.
- Timed explosives and grenades.
- Pre-mission equipment purchase with a budget.
- Morale and stun.
- Extra victory types: rescue, destroy target, hold area.

## 13. Balance log

Measure with `just balance [seeds] [scenario]`. Record notable changes in ADRs.

| Date | Scenario | Result | Notes |
| --- | --- | --- | --- |
| 2026-10-11 | kestrel, 10 seeds | red 80% / blue 20%, avg 3.1 turns | Too lethal; tuning pending |
