# 0008. Hit chance formula and simulated miss trajectories

- **Status:** Accepted
- **Date:** 2026-10-11
- **Kind:** Game design
- **Affects:** DESIGN.md §Combat; packages/engine/src/rules.ts, packages/content/src/weapons.ts

## Context

Shots should feel physical. Misses should be able to hit cover or other units, and range should matter.

## Decision

- `hit% = clamp(accuracy × modeMultiplier − max(0, distance − 3) × 3.5, 5, 95)`.
- **On a hit**, the ray goes to the target. **On a miss**, the aim point is offset by a random −2..+2 tiles on each axis, and the ray continues to the weapon's range.
- The first unit or blocking feature along the ray takes the hit (walls, crates, closed doors, windows). Damage is `roll(min..max) − armor`, at least 0.
- Features have structural HP (wall 40, door 20, crate 15, window 1) and become rubble at 0.
- Initial weapon tunables are listed in DESIGN.md.

## Consequences

Lethality is currently high: AI-vs-AI Kestrel games average about 3 turns (`just balance`). Tuning is expected and must be recorded in follow-up ADRs.

## Alternatives considered

- **Pure dice roll with no trajectory** – simpler, but loses emergent cover and friendly-fire stories.
