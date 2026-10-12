# Node-hosted multiplayer

The user approved implementation of two-player LAN/shared-tunnel play on 2026-10-12. Success means two separate browser clients can create/join a room, play alternate turns with the existing rules and input methods, recover their seat after a disconnect, and never receive hidden state.

## Architecture and scope

`packages/net` owns protocol v1, runtime command validation, a browser-compatible Transport, and the client connection. `apps/host` owns rooms, seat credentials, authoritative Match instances, and an HTTP/WebSocket server serving the production web build. The game screen consumes Session rather than LocalSession. Rules and randomness inside the engine remain unchanged.

The initial scenario is Kestrel, with both sides human. A creator gets the first side and an invite code/link; a second player joins the other side. The creator starts once both seats are connected. A started room reserves both seats until explicitly left or expired. The game pauses commands while either player is disconnected. Leaving ends the room for both players; replaying requires a new room. Browser-only WebRTC, automatic mDNS discovery, QR codes, native wrappers and automatic cloudflared spawning remain planned; a manually started HTTP tunnel works with the same host URL.

## Protocol and privacy

Every client frame includes version 1; incompatible versions are rejected explicitly. There is no earlier shipped wire format to migrate. Use bounded, strict runtime schemas for all untrusted commands and lobby messages. Side identity comes from a cryptographically random seat token and its socket binding; a command cannot impersonate another side. Room codes are random, and only the invite is shared. Credentials stay in sessionStorage, never in URLs or the opponent's messages.

Only Match.view and its per-side subscription output cross the server boundary. Successful acknowledgements contain no engine events. Scenario metadata includes id/title/briefing/translations, never unit spawns, seed, replay, victory internals, or full state. Command ids deduplicate retries; revision checks reject stale commands and return a fresh filtered snapshot. Each client has at most one pending command. Disconnections reject pending requests without blindly replaying them; reconnect uses a filtered snapshot.

## Lifecycle and UX

Use a create/join screen with a host URL field (defaults to current origin), room code, selectable invite link, waiting status, start and back controls. Links use a room query parameter. Use existing DOM styles and input hub conventions, with primary buttons marked data-primary and English/Czech strings. During a match display reconnecting/opponent-disconnected status and disable commands until both seats are present. Network failures/timeouts surface localized errors. Refresh resumes the same seat using its tab's saved credential. Explicit quit clears credentials.

The host bounds frame size (64 KiB), rooms (100), connections (256), request rate, result caches and stale-room lifetime (30 minutes with no connected seats). Serve only files inside apps/web/dist; no directory listing or arbitrary filesystem access. Heartbeats detect dead peers. Host state is in memory; restarting it ends matches.

## Verification

Protocol tests exercise malformed/versioned frames. Real WebSocket integration tests exercise create/join/start, forged-side commands, out-of-turn/stale/duplicate commands, hidden units/AP/origins, absence of full scenario/seed/replay in packets, third-player rejection, disconnect/resume, room cleanup and safe static serving. Playwright uses two browser contexts to create/join/play and reload, on desktop and touch projects. Run just typecheck, just test and just e2e; real LAN/tunnel acceptance is separate from local verification.
