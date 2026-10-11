# 0002. Pure TypeScript rules engine driven by commands and events

- **Status:** Accepted
- **Date:** 2026-10-11
- **Kind:** Architecture
- **Affects:** packages/engine, ARCHITECTURE.md §Engine

## Context

The same rules have to power single player vs AI, hotseat, online and LAN play, replays, saves, the tutorial and tests, on web, desktop and mobile.

## Decision

- `packages/engine` is pure TypeScript with no DOM, Pixi or Node imports.
- All randomness comes from a seeded mulberry32 RNG whose state lives in `GameState`.
- Every player intent is a serializable `Command`. `applyCommand` returns a new state plus `GameEvent`s and never mutates its input; a rejected command leaves the state unchanged.
- `Match` is the single authority: it holds the state and the command log, and produces replays.

## Consequences

- Deterministic replays: the same scenario, seed and commands produce the same state hash, and this is tested.
- AI, network hosts and the tutorial all reuse the same code path.
- Anything the UI needs (path costs, hit chance) must be exposed as pure helpers, never computed in the UI.
- `structuredClone` per command is fine at current map sizes. Revisit it if maps grow a lot.

## Alternatives considered

- **Engine-native game framework (Godot/Phaser scenes owning rules)** – this couples rules to rendering and makes headless hosts and tests harder.
- **Mutable state + undo** – simpler to write, but loses cheap rejection safety and replay guarantees.
