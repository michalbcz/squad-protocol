# 0004. Host-authoritative fog of war with per-side views and event redaction

- **Status:** Accepted
- **Date:** 2026-10-11
- **Kind:** Both
- **Affects:** packages/engine/src/view.ts, DESIGN.md §Information, ARCHITECTURE.md §Trust model

## Context

Hidden information is core to the game. In network play a client that receives the full state can cheat. In hotseat, the second player must not see the first player's view.

## Decision

- Only the host's `Match` holds the full `GameState`. Every consumer gets a `PlayerView` from `viewFor(state, side)`: own units plus enemies currently in line of sight, per-tile visibility, and **enemy AP zeroed**, so held reaction fire stays secret.
- Events carry `seenBy` and `originSeenBy`. `eventsFor` drops unwitnessed events and redacts details:
  - a hidden shooter's id and origin;
  - a move's hidden start (the unit appears instead);
  - moves whose destination wasn't seen, which are dropped.
- The AI uses the same views (no cheating AI).
- Hotseat uses a fully opaque hand-off screen and clears the combat log between viewers.

## Consequences

- Network transports can forward views and events verbatim.
- The client must never assume it knows enemy AP or positions outside its view.
- The map layout itself is public (like the original). Fog hides units, not terrain.

## Alternatives considered

- **Lockstep with full state on every client** – cheaper bandwidth, but trivially cheatable with hidden information.
- **Explored-tiles memory (classic fog)** – deferred; it can be added to the view later without changing authority.
