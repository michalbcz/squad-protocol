# 0001. Record architecture and game-design decisions in ADRs

- **Status:** Accepted
- **Date:** 2026-10-11
- **Kind:** Both
- **Affects:** docs/adr, AGENTS.md, DESIGN.md, ARCHITECTURE.md

## Context

The project is a long-running remake built by humans and coding agents together. Rules and architecture will keep changing through playtesting and new platforms. Without a written trail, nobody can tell later why reaction fire works the way it does, or why mobile is join-only.

## Decision

- Significant decisions get a numbered, immutable record in `docs/adr/NNNN-slug.md`, created from `template.md` with `just adr "Title"`. That covers architecture, and game rules or balance.
- `DESIGN.md` (game rules) and `ARCHITECTURE.md` (system structure) describe the **current** state. ADRs describe **why** it changed.
- An ADR is never rewritten after it is accepted. To reverse one, add a new ADR that supersedes it, and update the old one's status line only.
- What counts as significant: changing a rule, formula or tunable in a way that changes play; adding or removing a package, transport, platform or persisted format; changing the authority or trust model. Pure refactors and bug fixes don't need an ADR.

## Consequences

Agents use the `update-design` and `update-architecture` skills to keep the docs and ADRs in sync with code changes. Some overhead per change, but a durable history.

## Alternatives considered

- **Changelog only** – it records what changed but not why, and it mixes design with code.
- **Docs only, no ADRs** – the current state stays clear, but the reasoning is lost on every edit.
