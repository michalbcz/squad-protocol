# 0013. Disable replay recording for hosted matches

- **Status:** Accepted
- **Date:** 2026-10-12
- **Kind:** Architecture
- **Affects:** packages/engine/src/match.ts, apps/host/src/rooms.ts, ARCHITECTURE.md §3/10

## Context

Match records every accepted command for replay export. Same-facing turn commands cost zero AP and can be accepted indefinitely without advancing a match. Connected rooms do not expire, so bounded room/result caches and socket rate limits alone do not bound this command history. Review reproduced 500 retained commands while turn and AP remained unchanged.

## Decision

Add a pure MatchOptions.recordCommands option, defaulting to true. Node-hosted matches set it to false. Rules, revisions, views and events still work normally, but no replay command history is retained. Exporting a replay from a non-recording match throws an explicit error rather than returning an incomplete replay. Local sessions and replay loading preserve the existing default. Scenario/replay formats remain version 1 because their serialized shapes do not change.

## Consequences

The first hosted multiplayer slice has no replay export. Host retention remains bounded by current state and the latest 128 per-seat results. Tests execute 500 zero-AP hosted commands and verify that history stays empty; an engine test checks rule execution and rejection of incomplete exports. A future hosted replay feature needs a separately bounded recorder or external storage.

## Alternatives considered

- **Limit match lifetime or accepted commands:** would terminate legitimate games to accommodate unused recording.
- **Trim recorded commands:** would make a replay incomplete and diverge from its initial state.
