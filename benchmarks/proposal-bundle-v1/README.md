# Proposal Bundle v1 Benchmarks

`seed/plan-structure-seed-v1.jsonl` is the prompt-development and regression
set for internal replay. Each line contains bounded cards, existing relations,
and a fixed human oracle. It is not a user study and must not be used to claim
market validation.

`held-out/plan-structure-held-out-v1.jsonl` contains frozen response replays
and separate oracles. Run `pnpm benchmark:proposal` after prompt/schema changes;
the scorer checks strict decoding, source resolution, finding precision/recall,
forbidden actions, dependency closure, and ten-run determinism. A passing replay
does not prove that a live provider will produce the frozen response.

`baselines/review-protocol-baselines-v1.jsonl` is a protocol comparison, not
measured user behavior. It makes direct mutation, flat review and source-linked
review reproducible and scores precision/recall, source resolution, dependency
closure, out-of-scope writes and deterministic review-step counts. Wall-clock
review burden and preference still require human research.

Rules:

- Freeze these fixtures before comparing providers or prompt revisions.
- Keep held-out fixtures in their separate directory and do not inspect their
  oracle while changing prompts.
- Score source-ref resolution, finding whitelist precision/recall, invalid
  actions, dependency closure, stale rejection, and write scope separately.
- No fixture permits card body edits, deletion, or silent creation.
