# 0005. Network topology: one Transport interface; desktop/Node hosts LAN and tunnels

- **Status:** Proposed
- **Date:** 2026-10-11
- **Kind:** Architecture
- **Affects:** packages/net (planned), apps/host, apps/desktop, ARCHITECTURE.md §Networking

## Context

We want browser play over WebRTC, classic LAN discovery, direct IP, and easy sharing through a Cloudflare tunnel. Browser tabs cannot listen on ports or do mDNS/UDP. HTTPS pages cannot open `ws://` to LAN IPs (mixed content). Cloudflare quick tunnels carry HTTP and WebSocket but not WebRTC/UDP.

## Decision

- **One `Transport` interface** (WebSocket, WebRTC DataChannel, in-process loopback) carries the same JSON command/view protocol. The UI only talks to `Session` (`LocalSession` exists today; `NetSession` is planned).
- **LAN and tunnel hosting run in the desktop app (Tauri sidecar) or in the headless `apps/host` (Node).** The host advertises `_squadproto._tcp` over mDNS and serves the web client over HTTP, so joiners open `http://host:port`.
- **Tunnel:** spawn `cloudflared tunnel --url http://localhost:PORT`, parse the trycloudflare URL, and show it as a link plus QR code. Uses the WS transport.
- **Browser-only P2P:** WebRTC with copy-paste or QR signaling and STUN only. Some NATs will fail; the UI then suggests a host or tunnel.
- **Mobile is join-only** until a native hosting plugin is scoped.

## Consequences

The host is always authoritative (see [0004](0004-host-authority-and-redaction.md)). Network sessions are asynchronous, so the UI must not rely on `LocalSession`'s synchronous event delivery (see `GameController.send`).

## Alternatives considered

- **Hosted relay server** – the easiest NAT traversal, but it adds infrastructure and cost. It may come later as an optional signaling relay.
- **Hosting in the browser via WebRTC only** – no LAN discovery or tunnels, and NAT failures with no fallback.
