---
name: adr
description: Create, supersede or list Architecture/Design Decision Records in docs/adr. Use when a significant architecture or game-design decision is made or reversed, or when asked to "write an ADR" or "record this decision".
---

# Decision records (ADR)

ADRs live in `docs/adr/NNNN-slug.md`. The index is `docs/adr/README.md` and the template is `docs/adr/template.md`. The policy is in `docs/adr/0001-record-decisions-in-adrs.md`.

## When to write one

Write one for these:
- **Game design:** a rule, formula, AP cost, weapon/unit tunable, vision, reaction fire, victory, or turn-structure change that alters play. Also onboarding/UX rules (the preview/confirm model, refresher policy).
- **Architecture:** a new or removed package or app; changed dependency rules or boundaries; the authority/trust model; a session or transport; a persisted or wire format; a platform or wrapper; a major library choice.

These don't need one: bug fixes, refactors, tests, copy edits, or a new scenario that uses existing rules.

## Steps

1. Check the index, `docs/adr/README.md`, for an existing ADR on the topic. If the new decision reverses or replaces one, this is a **supersede** (step 5).
2. Create the file: `just adr "Short imperative title"`. It prints the path and appends an index row.
3. Fill in every section of the template:
   - **Status:** use `Accepted` if the decision is already implemented or the user approved it, otherwise `Proposed`.
   - **Date:** today, in ISO format.
   - **Kind:** Architecture, Game design or Both.
   - **Affects:** the doc sections and code paths involved.
   - **Context:** the forces at play. Cite evidence: a balance report (`just balance`), a playtest note, a platform limit.
   - **Decision:** be concrete. Game-design ADRs must state the exact numbers and formulas.
   - **Consequences:** include follow-ups, and the tests and docs that changed.
   - **Alternatives considered:** at least one, with the reason it was rejected.
4. In the index row, replace `TBD` with the Kind and set the Status.
5. **Supersede:** in the old ADR, change only the status line to `Superseded by [NNNN](NNNN-slug.md)`. Never edit its body. Update its index row too.
6. Link the ADR from the relevant DESIGN.md or ARCHITECTURE.md section, e.g. `([ADR 0009](docs/adr/0009-x.md))`.

## Rules

- Accepted ADRs are immutable apart from the status line.
- Keep each ADR to one decision. Split compound changes.
- Write plainly; one page at most.
