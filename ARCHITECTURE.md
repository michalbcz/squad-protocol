# Squad Protocol: Architecture

This file describes the **current** architecture. The reasons behind it live in [`docs/adr`](docs/adr/README.md). When the structure, a boundary, a persisted format or the trust model changes, update this file and add an ADR (use the `update-architecture` skill). Game rules live in [DESIGN.md](DESIGN.md).

Status tags: ✅ implemented · 🟡 partial · 📋 planned

## 1. Overview

```
            ┌───────────────── apps/web (Svelte 5 DOM UI + PixiJS 8 board) ─────────────────┐
 input ───▶ │ @sp/input ─▶ GameController ──Command──▶ Session ◀──views/events── Board (Pixi) │
 (touch,    │   actions     (selection,        │          ▲                                  │
  mouse,    │               previews)          │          │ PlayerView + redacted events     │
  keys,pad) └──────────────────────────────────┼──────────┼──────────────────────────────────┘
                                               ▼          │
                              LocalSession ✅ / NetSession 📋 (Transport: WS · WebRTC · loopback)
                                               │          │
                                               ▼          │
                                     Match (authority) ───┘  ◀── @sp/ai (plays from its view only)
                                     └─ applyCommand(state, cmd) → state', events   (@sp/engine, pure)
```

Key ideas:
- **The engine is pure and deterministic** ([ADR 0002](docs/adr/0002-pure-engine-commands-events.md)).
- **One authority holds the full state, and everyone else gets filtered views** ([ADR 0004](docs/adr/0004-host-authority-and-redaction.md)).
- **The UI only talks to a `Session`.**

## 2. Repository layout

| Path | Status | Responsibility | May depend on |
| --- | --- | --- | --- |
| `packages/engine` | ✅ | Rules, commands/events, RNG, grid/LOS, A*, scenario schema (zod), views, redaction, `Match`, replays | `zod` only |
| `packages/ai` | 🟡 | `nextCommand(view, memory)`: utility AI over a `PlayerView` | engine |
| `packages/content` | ✅ | Weapons, scenario JSON (validated at import) | engine |
| `packages/i18n` | ✅ | ICU MessageFormat runtime, `en`/`cs` catalogs, `en-XA` pseudo-locale, RTL detection, locale negotiation | `intl-messageformat` |
| `packages/input` | ✅ | Semantic `Action`s, key bindings (`KeyboardEvent.code`), gamepad polling, device tracking, focus handling | – (DOM types) |
| `packages/net` | 📋 | `Transport` interface, WS / WebRTC / loopback, protocol, lobby | engine |
| `apps/web` | ✅ | Svelte UI, Pixi renderer, sessions, tutorial, settings | all packages, `pixi.js`, `svelte` |
| `apps/host` | 📋 | Headless Node host: WS server, mDNS, serves the web build | engine, net |
| `apps/desktop` | 📋 | Tauri 2 (Win/macOS/Linux/Steam), host + cloudflared sidecars | web build |
| `apps/mobile` | 📋 | Capacitor (Android/iOS), join-only | web build |
| `e2e/` | ✅ | Playwright tests (desktop + mobile-touch projects) | – |
| `docs/adr/` | ✅ | Decision records | – |

**Dependency rule:** `engine` imports nothing from other workspace packages. Nothing below `apps/` imports Pixi or Svelte.

## 3. Engine (`packages/engine`) ✅

- **State:** `GameState` (`types.ts`) is plain JSON. It holds the RNG state, turn, active side, map tiles, units, weapons, victory conditions, winner and the `over` flag.
- **Commands** (`commands.ts`): `move` (explicit path), `turn`, `fire`, `toggleDoor`, `endTurn`, each tagged with `side`.
- **`applyCommand(prev, cmd)`** (`rules.ts`) `structuredClone`s the state, validates and resolves the command, and returns `{ state, result }`. On error it returns `prev` unchanged.
- **Events** carry `seenBy`, and moves/shots also carry `originSeenBy`. Both are computed at emit time from live LOS, so no re-simulation is needed for filtering.
- **Pure helpers** shared by UI and AI: `findPath`, `pathCosts`, `stepCost`, `hitChance`, `fireCost`, `canSee`, `hasLineOfSight`, `stateFromView`.
- **`Match`** (`match.ts`) is the single authority. It holds the state and the command log, notifies subscribers with `(side, viewFor(side), eventsFor(events, side, state))`, and provides `toReplay()` / `Match.fromReplay()`.
- **Determinism:** the seeded mulberry32 RNG (`rng.ts`) is the only source of randomness. `hashState` (FNV-1a over JSON) supports replay checks and future desync detection.

## 4. Trust model & information flow ✅

- Only the authority (`Match`, inside `LocalSession` today and a host process later) sees `GameState`.
- `viewFor(state, side)` returns own units, visible enemies (AP zeroed), per-tile visibility and the public map.
- `eventsFor` drops unwitnessed events and redacts hidden origins, ids and destinations.
- Commands entering a session are deep-copied as JSON, exactly like a network wire, and UI code snapshots `$state` proxies before sending.
- The AI runs on the same `PlayerView` as a human.

## 5. Sessions (`apps/web/src/lib/session.ts`)

```ts
interface Session {
  viewer: SideId; view: PlayerView; scenario: Scenario;
  submit(cmd): CommandResult;
  subscribe(fn: (u: SessionUpdate) => void): () => void;  // events | handoff | viewer
  acceptHandoff(): void; dispose(): void;
}
```

- **`LocalSession`** ✅ handles hotseat and AI:
  - It chooses who controls each side (human or AI).
  - It runs AI turns on a timer.
  - It can take an optional **`script`** (side → turn → commands) that runs before the regular AI on that turn; illegal steps are skipped. Tutorials use it ([ADR 0009](docs/adr/0009-boot-camp-curriculum-and-coach-tips.md)).
  - It queues a per-side **backlog** of events witnessed during other sides' turns.
  - Between two humans it emits `handoff`, then `viewer` once the next player confirms.
- **`NetSession`** 📋 will implement the same interface over a `Transport`. It is asynchronous, so the UI must not assume `submit` delivers events synchronously.

## 6. Client (`apps/web`) ✅

- **`GameController`** (`lib/controller.svelte.ts`) is the reactive UI state: selection, mode, cursor, preview, log, and the handoff/busy flags.
  - It turns taps, hovers and `Action`s into `Command`s.
  - It plays session updates through a serialized animation queue, with a pending counter driving `busy`.
  - It emits `UiSignal`s (`selected`, `previewed`, `mode`, `command`, `rejected`, `events`, user-only `camera`, synthetic `check`). The tutorial and coach tips consume these.
- **`Board`** (`render/board.ts`) is PixiJS 8. Layers are tiles → overlay (path/target/cursor) → units → fog → FX.
  - Eight directional pixel silhouettes (`render/soldier-sprite.ts`) and patterned tiles use integer rectangles with antialiasing disabled; rendering remains based only on `PlayerView`.
  - It handles pointer gestures: tap, drag-pan, pinch, wheel zoom and long-press.
  - It plays events through `play(events)`.
  - It draws **no text**: DOM tooltips are positioned with `tileToScreen`.
- **Svelte screens** (`ui/`): `App` (router; `?seed=N` makes games reproducible), `MainMenu` (with tip of the day), `BootCamp` (mission list and progress), `Game` (HUD, dialogs, mission completion), `Tutorial`, `CoachTips`, `Codex` (rules and tips, searchable), `Refresher`, `Settings`.
  - Dialog and tutorial primary buttons carry `data-primary`, so keyboard/gamepad `confirm` reaches them.
- **Presentation:** shared black/saturated-color tokens in `ui/global.css`; the locally hosted VT323 font and its OFL license live in `public/fonts/`. The responsive HUD remains DOM-based ([ADR 0010](docs/adr/0010-use-an-original-8-bit-tactical-presentation.md)).
- **Tutorial** (`tutorial/steps.ts`): `BOOT_CAMP` is a list of `TutorialMission`s (scenario id, steps, optional opponent script).
  - Steps are data-driven (`textKey`, optional `highlight`/`tile`, `until(signal, ctrl)`) and run on the real engine.
  - Text keys resolve to `${key}.${device}` when such a variant exists.
- **Tips** (`tutorial/tips.ts`): `TIPS` (general tips for the codex, menu and refresher) and `COACH_TIPS` (contextual rules `when(signal, ctrl)`, each shown once per profile by `CoachTips` outside tutorials).
- **Settings** (`lib/settings.svelte.ts`): localStorage for locale, coach mode, last-played time (drives the refresher), completed Boot Camp missions (`bootCamp`) and coach tips already shown (`seenTips`). The old `tutorialDone` flag is migrated on load. 📋 Swap in a per-platform storage backend.

## 7. Input (`packages/input`) ✅

- Physical key codes map to semantic actions, which can be remapped and are persisted under `sp.bindings`.
- The gamepad uses the standard mapping, with edge detection and the left stick acting as a d-pad.
- The last-used device drives prompt glyphs.
- Keys pass through to a DOM control only if it was focused by keyboard. Controls focused by pointer are blurred, so they can't swallow board input.

## 8. Internationalization (`packages/i18n`) ✅

- ICU MessageFormat, with English as the fallback. A key missing everywhere renders `⟦key⟧`, and tests fail on that.
- Unit, side, weapon and scenario names are themselves keys, resolved recursively in `t()`.
- Scenario strings ship inside the scenario JSON and are merged at runtime.
- Layout uses CSS logical properties, and `dir` is set from the locale.
- A test asserts every English key exists in Czech and that every message formats.

## 9. Persisted & wire formats

| Format | Version | Where |
| --- | --- | --- |
| Scenario `squad-protocol/scenario` | 1 | `packages/engine/src/scenario.ts` (zod) |
| Replay `squad-protocol/replay` | 1 | `packages/engine/src/match.ts` (scenario + weapons + seed + commands) |
| Settings / bindings | unversioned | localStorage `sp.settings`, `sp.bindings` |
| Net protocol | 📋 | `packages/net` |

Changing any versioned format requires a version bump, a migration path and an ADR.

## 10. Networking 📋 ([ADR 0005](docs/adr/0005-network-topology.md))

- There is one `Transport` interface (WebSocket, WebRTC DataChannel, loopback).
- LAN hosting (mDNS `_squadproto._tcp`) and Cloudflare quick tunnels run in `apps/host` or the Tauri sidecar.
- Browser-only P2P uses WebRTC with manual or QR signaling.
- Mobile is join-only.

## 11. Platforms 📋

- The web build uses a relative `base` and works as-is inside Tauri 2 (desktop and Steam, via a Steamworks plugin) and Capacitor (mobile, with safe-area insets already in CSS).
- A PWA manifest exists. 📋 Service worker.

## 12. Quality gates

| Gate | Command |
| --- | --- |
| Type-check (tsc + svelte-check) | `just typecheck` |
| Unit tests: rules, LOS, redaction, determinism, AI-vs-AI legality, i18n coverage, bindings, tutorial data and scripts (`packages/*/test`, `apps/*/test`) | `just test` |
| E2E: Boot Camp (mouse + keyboard, mission list, scripted ambush), coach tips, codex tips, hotseat opacity, touch tap-confirm, pseudo-locale, focus trap | `just e2e` |
| All of the above (also in CI, `.github/workflows/ci.yml`) | `just check` |
| Balance report | `just balance` |
