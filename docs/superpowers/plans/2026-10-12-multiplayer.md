# Multiplayer Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship two-player Node-hosted games with a lobby, private views and reconnection.

**Architecture:** The pure engine remains authoritative through Match. A shared validated JSON protocol connects Node rooms to a browser client, with NetSession adapting it to the existing game screen.

**Tech Stack:** TypeScript, zod, ws, tsx, Svelte 5, Vitest, Playwright.

**Spec:** docs/superpowers/specs/2026-10-12-multiplayer-design.md

## Global Constraints

- Protocol starts at version 1; reject unsupported versions.
- Engine stays pure; only per-side filtered state/events leave the host.
- English and Czech text; DOM-only labels; touch/mouse/keyboard/gamepad controls.
- Frames 64 KiB, rooms 100, connections 256, abandoned-room lifetime 30 minutes.
- Existing worktree is isolated; preserve unrelated work. Execute inline as requested by “Approve, implement”.

## Review Focus

- Wrong-side or malformed messages must never mutate the game.
- Duplicate requests after an acknowledgement loss must not execute twice.
- Reload/disconnect must reclaim only the credential's seat and block input while offline.
- Initial/reconnect packets must not disclose scenario spawns or full engine results.
- Static paths and room churn must not expose files or grow memory without a bound.

### Task 1: Validated protocol and authoritative host

**Files:** packages/net/src/{protocol,index}.ts, packages/net/test/protocol.test.ts, apps/host/src/{rooms,server,main}.ts, apps/host/test/server.test.ts; workspace manifests and typecheck configuration.

**Interfaces:** parseClientMessage(unknown): ClientMessage; ServerMessage discriminated union; createHost({port?,hostname?,staticDir?}) returns server, listen() and close(). Rooms use Match filtered subscriptions. No successful raw CommandResult is serialized.

- [ ] Add failing protocol and real socket integration tests for lobby, authority/privacy, validation, revision/deduplication, resume, leave and static paths. Run focused Vitest and observe missing feature failures.
- [ ] Implement v1 schemas, seat binding and bounded rooms; add HTTP/WebSocket server, heartbeat, static serving and Node CLI. Install ws/tsx/Node types.
- [ ] Run focused tests then just typecheck and just test. Expected: all pass.

### Task 2: Browser client and asynchronous Session

**Files:** packages/net/src/{transport,client}.ts, packages/net/test/client.test.ts, apps/web/src/lib/{net-session,session,controller.svelte}.ts, apps/web/src/ui/Game.svelte.

**Interfaces:** MultiplayerClient wraps Transport, publishes connection/room/snapshot/update/error notifications, and returns asynchronous command results; NetSession implements Session using metadata and PlayerView. Session.submit accepts sync or async results. SessionUpdate events may carry the originating Command. Status updates lock disconnected games.

- [ ] Write failing client integration tests for command completion, disconnect/reconnect, failed credentials and deduplication. Observe RED using the host from Task 1.
- [ ] Implement native WebSocket transport, request correlation/timeouts, bounded reconnect and session adapter. Update controller pending-command locking and asynchronous error reporting without breaking local sessions.
- [ ] Run client tests and the full unit/typecheck gates. Expected: all pass.

### Task 3: Lobby, browser acceptance and documentation

**Files:** apps/web/src/ui/{Multiplayer,App,MainMenu,Game}.svelte, both i18n catalogs, e2e/multiplayer.spec.ts, playwright.config.ts, justfile, README.md, DESIGN.md, ARCHITECTURE.md, docs/adr.

**Interfaces:** Multiplayer emits an established NetSession on start; App routes invite URLs and disposes sessions. The production host starts via just host; optional tunnel uses cloudflared externally.

- [ ] Write failing two-browser create/join/play/reload/quit tests, desktop and touch; observe missing lobby failure.
- [ ] Build localized lobby and reconnect status with existing controls, wire menu/App/game lifecycle, and add host/e2e runner commands.
- [ ] Use update-design, update-architecture and adr skills to record shipped scope and protocol v1. Add running instructions and tunnel workflow.
- [ ] Run just typecheck, just test, just e2e. Expected: all pass. Review the whole change and fix material findings with regression tests.
