# Squad Protocol

A spiritual remake of classic 8-bit turn-based squad tactics (in the tradition of *Laser Squad*). It is web-first, fully localizable, and plays with touch, mouse, keyboard and gamepad. All names, maps and art are original.

## Quick start

```sh
just doctor   # check toolchain
just install
just dev      # http://localhost:5173
just check    # typecheck + unit + e2e
just          # list all recipes
```

## Multiplayer

```sh
just host          # build and host on port 8080
# or: just host 9000
```

Open a printed **LAN URL** on both devices (use the LAN URL on the host device too, so the invite is reachable). Choose **Multiplayer → Create room**, share the invite link, and select **Start match** once both players connect. Keep the host running. Use the same tab to refresh/reconnect; quitting closes the room for both sides. Games use Kestrel with two human squads. Host state is in memory; restarting the host ends its rooms.

To share across networks, keep the host running and start a tunnel in another terminal:

```sh
cloudflared tunnel --url http://localhost:8080
```

Open the printed HTTPS tunnel URL on the creator's device, create a room there, then share its invite link. Assets and WebSocket traffic use the tunnel origin. `cloudflared` is optional and installed separately. Automatic tunnels, LAN discovery and browser-only WebRTC remain planned. Desktop and mobile browsers can play now.

## Docs

- [DESIGN.md](DESIGN.md): game rules (current)
- [ARCHITECTURE.md](ARCHITECTURE.md): system structure (current)
- [docs/adr](docs/adr/README.md): architecture and game-design decision records
- [AGENTS.md](AGENTS.md): rules for contributors and coding agents

## Layout

| Path | What |
| --- | --- |
| `packages/engine` | Pure TS rules: commands → events, seeded RNG, LOS/fog, A* with facing-aware AP, reaction fire, destructible cover, per-side view filtering, replays (`Match`). No DOM/Pixi. |
| `packages/ai` | AI that plays only from its own `PlayerView` (no cheating). |
| `packages/content` | Weapons and scenario JSON (zod-validated, with per-scenario string tables). |
| `packages/i18n` | ICU MessageFormat runtime, `en` + `cs` catalogs, `en-XA` pseudo-locale, RTL detection. |
| `packages/input` | Semantic actions, remappable keyboard (physical `code`s), gamepad polling, last-used-device tracking. |
| `packages/net` | Versioned JSON protocol, runtime client validation, browser Transport and multiplayer client. |
| `apps/host` | Node HTTP/WS authority, private seats, room lifecycle and web serving. |
| `apps/web` | Svelte 5 DOM UI + PixiJS 8 board. Menu, HUD, hotseat handoff, Boot Camp tutorial, refresher, codex, settings. |

The UI only talks to a `Session` (`apps/web/src/lib/session.ts`). `LocalSession` drives hotseat and AI games; `NetSession` implements the same interface over the versioned WebSocket protocol.

## Status (vs. the plan in milestones)

| Milestone | State |
| --- | --- |
| 1. Scaffold, CI, i18n/input skeletons, Pixi map | ✅ |
| 2. Engine core (AP, LOS/fog, shooting, reaction fire, doors, destructible cover), hotseat, determinism tests | ✅ |
| 3. Inventory, explosives, buy phase, saves/replays | ⏳ replays exist in the engine (`Match.toReplay`); the rest is not started |
| 4. AI | 🟡 basic utility AI (fair: view-only); no cover scoring or Web Worker yet |
| 5. Tutorial, refresher, codex | ✅ 4-mission Boot Camp, coach tips, tips & tricks, refresher, searchable codex (📋 explosives mission once those rules exist) |
| 6. Networking (WS host, LAN mDNS, cloudflared, WebRTC) | 🟡 Two-player WS rooms, LAN/direct URL, manual HTTP tunnels and reconnect; mDNS, automatic tunnels and WebRTC remain planned |
| 7. Scenario editor | ❌ |
| 8. Tauri/Steam, Capacitor wrappers, art/audio | ❌ (the web build already uses a relative `base` for wrapping) |

Plan deviation: `packages/client` was folded into `apps/web`. The Tauri and Capacitor wrappers will wrap the `apps/web` build.

Balance note: AI-vs-AI games on Kestrel currently end in 2–4 turns, which is too lethal. Tuning is still to do.
