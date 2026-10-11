# 0003. Web-first stack: TypeScript, PixiJS 8, Svelte 5, pnpm monorepo

- **Status:** Accepted
- **Date:** 2026-10-11
- **Kind:** Architecture
- **Affects:** apps/web, ARCHITECTURE.md §Client

## Context

The game must run on the web and be easy to wrap for Windows, macOS, Steam, Android and iOS. It must also be fully localizable and accessible, and support touch, mouse, keyboard and gamepad.

## Decision

- **PixiJS 8** draws the board.
- **Svelte 5** renders all text and UI as DOM over the canvas, so we get real text layout for i18n/RTL, screen readers and native focus.
- **Vite** builds with a relative `base: './'`, so the same bundle works on the web, in Tauri and in Capacitor.
- **pnpm workspaces** hold the packages.
- The planned `packages/client` was folded into `apps/web` because there is only one client today. Extract it again if a second client (for example the editor as a separate app) appears.

## Consequences

- No text is drawn in the canvas: any label goes to the DOM via `Board.tileToScreen`.
- UI state lives in Svelte runes classes (`*.svelte.ts`). Values passed to the engine must be plain data (`$state.snapshot`); proxies once corrupted the engine state.

## Alternatives considered

- **Phaser** – more batteries included, but its UI and text story is weaker for i18n and accessibility.
- **Godot 4** – excellent native exports, but a heavier web export, and i18n/UI live outside the web platform.
