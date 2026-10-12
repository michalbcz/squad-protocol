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
| `apps/web` | Svelte 5 DOM UI + PixiJS 8 board. Menu, HUD, hotseat handoff, Boot Camp tutorial, refresher, codex, settings. |

The UI only talks to a `Session` (`apps/web/src/lib/session.ts`). `LocalSession` drives hotseat and AI games, and network sessions will implement the same interface.

## Status (vs. the plan in milestones)

| Milestone | State |
| --- | --- |
| 1. Scaffold, CI, i18n/input skeletons, Pixi map | ✅ |
| 2. Engine core (AP, LOS/fog, shooting, reaction fire, doors, destructible cover), hotseat, determinism tests | ✅ |
| 3. Inventory, explosives, buy phase, saves/replays | ⏳ replays exist in the engine (`Match.toReplay`); the rest is not started |
| 4. AI | 🟡 basic utility AI (fair: view-only); no cover scoring or Web Worker yet |
| 5. Tutorial, refresher, codex | ✅ 4-mission Boot Camp, coach tips, tips & tricks, refresher, searchable codex (📋 explosives mission once those rules exist) |
| 6. Networking (WS host, LAN mDNS, cloudflared, WebRTC) | ❌ the `Session` interface and event redaction are ready for it |
| 7. Scenario editor | ❌ |
| 8. Tauri/Steam, Capacitor wrappers, art/audio | ❌ (the web build already uses a relative `base` for wrapping) |

Plan deviation: `packages/client` was folded into `apps/web`. The Tauri and Capacitor wrappers will wrap the `apps/web` build.

Balance note: AI-vs-AI games on Kestrel currently end in 2–4 turns, which is too lethal. Tuning is still to do.
