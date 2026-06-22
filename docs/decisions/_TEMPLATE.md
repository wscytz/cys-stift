---
date: YYYY-MM-DD
status: accepted        # proposed | accepted | superseded | deprecated
supersedes:             # slug / ADR-NNNN, or empty
superseded-by:          # slug, or empty
version: vX.Y.Z         # matching git tag, or "untagged"
commit:                 # 7-char SHA, or "n/a"
audience: [claude, human]
---

# <slug> — <one-line outcome>

## Context
Why this came up. 2-4 sentences tying it to the phase / review / bug that prompted it.

## Decision
What was chosen — bullets. The "what", not the "why".

## Alternatives
What was rejected + a one-line reason each. (Records the path not taken.)

## Consequences
What changed: files / LOC / new deps / tests, and any follow-up it enables or blocks.

## Verification
- `pnpm --filter domain test` — N/N
- `pnpm --filter db test` — N/N
- `pnpm --filter web exec vitest run` — N/N
- `pnpm --filter web build` — exit 0
- (e2e / manual checks if relevant)

## Links
- Plan: `docs/plans/...`
- Spec section: `docs/specs/2026-06-19-cys-stift-design.md#…`
- Related decisions: `…`
- Changelog entry: `docs/changelog.md`
