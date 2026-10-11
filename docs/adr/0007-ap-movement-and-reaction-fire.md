# 0007. AP economy, facing-aware movement and probabilistic reaction fire

- **Status:** Accepted
- **Date:** 2026-10-11
- **Kind:** Game design
- **Affects:** DESIGN.md §Action points, §Movement, §Reaction fire; packages/engine/src/path.ts, rules.ts

## Context

The genre's core tension is spending AP now versus keeping it for opportunity fire. Facing must matter, because it drives both sight and turning costs.

## Decision

- **Movement costs:** a straight step is 2 AP, a diagonal step 3, rubble +2, a closed door on the path +2 (it opens automatically), and turning costs 1 AP per 45°. No corner-cutting past blockers.
- **AP refresh:** the incoming side refills to max. The outgoing side **keeps** leftover AP as a reaction reserve.
- **Reaction fire:** after every step of an enemy move, each watcher that can see the mover, has it in range and holds at least the snap cost in AP, fires a snap shot with probability `ap / maxAp`.
- **Interruption:** movement stops when a new enemy comes into view, or when a hidden enemy blocks the path.

## Consequences

The AI keeps a snap-cost reserve. The UI coach hint explains the reserve. The tutorial teaches it in step 9.

## Alternatives considered

- **Deterministic reaction (always fire if AP allows)** – too punishing and too easy to read.
- **Separate "overwatch" action** – more explicit, but it drops the original's "saved AP is reaction" elegance.
