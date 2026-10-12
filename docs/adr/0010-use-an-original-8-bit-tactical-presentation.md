# 0010. Use an original 8-bit tactical presentation

- **Status:** Accepted
- **Date:** 2026-10-11
- **Kind:** Game design
- **Affects:** DESIGN.md §10; ARCHITECTURE.md §6; apps/web/src/render/board.ts; apps/web/src/ui

## Context

The requested visual reference uses black backgrounds, saturated colors, pixel soldiers, patterned terrain and a yellow-framed status panel. The initial renderer used smooth discs and muted solid tiles. Names, maps and artwork must remain original under ADR 0006.

## Decision

Draw original 16 × 16 soldier silhouettes in 3-pixel blocks on the existing 48-pixel tile grid, with antialiasing disabled. Use green grass stipple, blue floor seams, gray brick walls, cyan crates/windows and yellow doors. Blue Squad is cyan, Red Cell is red, and the selected soldier is yellow. Corner brackets, a white eight-direction facing pip, HP strips and friendly AP pips provide additional cues.

Use black DOM panels, square controls, yellow borders and a locally bundled OFL-licensed VT323 font. At desktop sizes (at least 1000 × 521 CSS pixels), place unit details and the combat log on the right; compact screens retain the overlay HUD, with a full-width statistics strip on portrait phones. At desktop heights of at least 700 pixels, tutorial prompts replace the sidebar combat log. Keep 44-pixel minimum control targets and the existing preview/confirm flows. Automatic camera framing keeps the map within the viewport where it fits, with room for the turn strip; resizing refits and reframes the selected soldier, and manual panning remains free.

## Consequences

The game has a coherent retro presentation without copied sprites or new rules. Text remains selectable/localizable DOM content. The font is served locally and its license is included. Existing desktop/touch interaction tests and the opaque hotseat handoff check remain required; opening-view and resize regressions check that the map and selected soldier clear the HUD.

## Alternatives considered

- **Palette-only restyle:** leaves abstract discs and soft controls inconsistent with the reference.
- **Copied reference sprites or map:** conflicts with the original-content requirement.
