# 0011. Ship versioned WebSocket rooms with private seats

- **Status:** Accepted
- **Date:** 2026-10-12
- **Kind:** Architecture
- **Affects:** packages/net, apps/host, apps/web sessions, ARCHITECTURE.md §§2/4/5/9/10/12

## Context

Separate browser clients need an authoritative game without exposing fog-of-war state. ADR 0005 proposes several transports; the first playable slice is a Node WebSocket host serving the web build over LAN or a manually configured HTTP tunnel.

## Decision

Implement protocol v1 in packages/net, with strict bounded runtime schemas for client frames, Transport/WebSocketTransport, and MultiplayerClient. apps/host binds random private seat tokens to sockets and drives Match. Only per-side views and redacted events leave the authority; acknowledgements contain no raw engine events. Initial/reconnect metadata excludes scenario unit spawns, seed and replay. Revision checks reject stale commands; a per-seat cache keeps the latest 128 request results. Recovery uses snapshots rather than replaying uncertain commands.

The host serves assets and /ws on one origin, validates browser origins, limits frames to 64 KiB, connections to 256, rooms to 100, and clients to 120 frames/minute. Rooms with no connected seats expire after 30 minutes; a 15-second heartbeat terminates unresponsive peers. The initial wire format has no legacy migration; unsupported versions get an explicit error. Seat persistence uses a version-1 sp.multiplayer sessionStorage record; invalid records are ignored. Future incompatible changes require a version bump and migration decision.

## Consequences

Session.submit supports synchronous and asynchronous results; command acknowledgement and animation completion both lock input. NetSession carries filtered state and connection status. Refresh recovers a seat within the same tab. Host state is in memory and restarting it ends its rooms. Run just host; sharing across networks uses an externally started cloudflared tunnel. mDNS, automatic tunnels, WebRTC and native hosts remain planned under ADR 0005. Real socket and two-browser tests cover authority, privacy, validation, recovery and static-file boundaries.

## Alternatives considered

- **Full-state lockstep:** violates hidden information.
- **Browser WebRTC first:** adds signaling and NAT handling before a working lobby/protocol; deferred.
- **Hosted relay/accounts:** adds service infrastructure beyond the approved LAN/tunnel slice.
