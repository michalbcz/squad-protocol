# 0012. Pause multiplayer commands during disconnection

- **Status:** Accepted
- **Date:** 2026-10-12
- **Kind:** Game design
- **Affects:** DESIGN.md §§9/10, apps/host rooms, NetSession, lobby and game HUD

## Context

Remote opponents need reserved seats and a recoverable turn when a tab reloads or loses its connection.

## Decision

The first multiplayer mode uses Kestrel with exactly two human sides. The creator has Blue; the invite recipient has Red. Only the creator starts, once both seats are connected. Commands pause while either side is disconnected; no AI substitution, automatic end turn, forfeit timer or change to AP/combat rules occurs. Client and authority enforce this. Automatic retries use delays of 0.5, 1, 2, 4 and 5 seconds; after five attempts the player can retry manually. An in-flight command times out after 8 seconds and recovery fetches a snapshot.

Seats remain reserved after disconnect. A private credential in sessionStorage recovers the same side on reload, including the current turn. Explicit leave closes the room for both players. An ended match offers return to menu; a rematch requires a new room. The HUD shows connection loss, opponent disconnect and room closure. Lobby controls support keyboard, gamepad, mouse and touch with English/Czech strings.

## Consequences

Remote games pause while the opponent is disconnected. Abandoned rooms expire after 30 minutes without connected seats, and host restarts lose in-memory games. Existing movement, combat, visibility and victory rules are unchanged. Integration and desktop/touch e2e tests cover turn handoff, reconnect and quit.

## Alternatives considered

- **Continue during disconnect:** risks returning to an unexpectedly advanced match.
- **Immediate forfeit/AI replacement:** lets transient network interruptions change the outcome.
