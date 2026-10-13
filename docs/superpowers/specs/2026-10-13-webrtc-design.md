# Browser WebRTC multiplayer

The user wants to play with a friend from the static Vercel branch preview. Current multiplayer only connects to a Node WebSocket host, so the preview cannot supply that authority. Extend the existing Session/Transport design with browser hosting. The user confirmed manual two-code exchange in chat, as proposed in ADR 0005.

## Player flow

Multiplayer offers Browser play (WebRTC) and Server/LAN. Do not connect to /ws until Server/LAN is selected (except existing server invite/resume flows). Browser host creates an offer code, sends it to the friend, receives their answer code and connects. The friend pastes the offer and returns the answer. Once connected both have the existing two-seat lobby; Blue starts Kestrel. Select/copy text and buttons support touch, mouse, keyboard and gamepad, with English/Czech text.

No signaling account or service is required. SDP plus gathered ICE candidates are exchanged as a bounded version-1 `squad-protocol/webrtc-signal` code. Use the public STUN endpoint in WebRTC's official example by default. Advanced relay settings accept user-supplied TURN URL, username and password in memory only; no built-in shared secret, persistence or deployment credentials. Invalid/expired/wrong-role codes, gathering/connection timeouts and unavailable WebRTC are explicit localized errors. Code generation is bounded; it never leaves a pending spinner indefinitely. No camera/microphone permissions.

## Architecture and trust

Move the transport-independent Rooms authority to packages/net; replace Node-only entropy with Web Crypto and keep the existing Node re-export. Reuse strict protocol validation, Match, per-side snapshots/events, command identity/revisions and bounded result caches unchanged. The hosting browser owns authority; its UI receives only Blue's filtered data through loopback. The friend connects through an ordered reliable RTCDataChannel and receives only Red's filtered data. The host can inspect authority as with any player-hosted game; there is no claim of an untrusted host.

WebSocket protocol/scenario/replay formats remain version 1. The newly introduced signaling format starts at 1, rejects unsupported versions, and has no prior data to migrate. The browser RTC connection stays in memory; both tabs must remain open. Refresh or terminal connection failure ends the browser-hosted room and requires fresh code exchange. Existing Node same-tab resume remains available only in Server/LAN mode. Short RTC disconnections pause commands; recovery on the same channel authenticates the existing seat and publishes a fresh filtered snapshot. No repeated factory attachment to a dead channel. Explicit leave closes peers, listeners and timers.

## Verification and delivery

Test malformed/versioned signals and the same portable authority privacy/limits via unit tests. Real Chromium contexts on the static web preview exchange codes, establish a real RTCDataChannel, play both turns, exercise forged commands/private views, and clean up on quit. Test browser mode without any /ws connection, invalid answer retry, touch layout and gamepad/keyboard controls. Run just typecheck, just test and just e2e, request independent review, fix reproduced material findings, then commit/push to update the existing PR. Verify the remote head/CI. Live Vercel acceptance is limited if deployment protection redirects unauthenticated automation to login; do not bypass it or claim cross-network friend acceptance from local browsers.
