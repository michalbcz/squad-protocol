# 0014. Use browser-hosted WebRTC with manual signaling

- **Status:** Accepted
- **Date:** 2026-10-13
- **Kind:** Both
- **Affects:** packages/net authority/loopback/WebRTC/signaling, browser peer/lobby, DESIGN.md §Modes, ARCHITECTURE.md §Networking

## Context

The user wants to play with a friend from the static Vercel branch preview. The WebSocket implementation needs a Node authority at /ws, which the static deployment does not provide. ADR 0005 already proposes browser-only WebRTC and manual signaling.

## Decision

Multiplayer explicitly offers Browser play (WebRTC) and Server/LAN. Opening the screen on a static website creates no WebSocket request. Existing server room invites and credentials open Server/LAN directly.

The hosting browser runs the same portable Rooms authority as Node, using Web Crypto for identifiers and seeds. Its UI receives Blue's filtered view through loopback; Red uses an ordered, reliable RTCDataChannel. Both use protocol v1, strict client validation, per-side events/views, revision checks and bounded caches. A browser host is trusted with the authority, as with the Node host; the guest never receives full state.

Setup exchanges bounded offer/answer codes in chat. New format squad-protocol/webrtc-signal starts at version 1 (SPRTC1 prefix), includes room/type/SDP and ICE candidates, rejects unsupported versions and wrong-role/room answers, and has no prior data to migrate. No changes to scenario/replay/protocol shapes. Full candidate gathering has a 12-second bound; waiting for the friend to apply the answer has a 120-second bound. Failed setup offers retry and relay/server guidance.

Use the STUN endpoint from WebRTC's official peer-connection example. Players may enter their TURN provider details in memory; no shared secret is bundled or persisted. No camera/microphone access. Temporary disconnections pause both sides and resume the same seat/snapshot; a terminal failure or tab refresh requires a new browser-hosted game. Node same-tab resume is unchanged.

## Consequences

Friends can play from a static website without a separate game/signaling server. They exchange two codes rather than one automatic invite. Both tabs must stay open. Some NAT/firewall combinations need a TURN relay; direct-network success cannot be claimed from local two-browser tests. Relay credentials and signaling data remain local to the tabs and private code exchange. Vercel deployment protection must allow both friends to open the page.

## Alternatives considered

- **Add only a WebSocket endpoint on Vercel:** does not implement the requested browser-to-browser mode and still needs an authority deployment.
- **Automatic signaling/managed TURN:** easier invitations and broader connectivity, but requires an external service/account; deferred until chosen.
- **Full state on both peers:** reveals hidden units and enemy AP; rejected.

References: https://webrtc.org/getting-started/peer-connections and https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createDataChannel
