# Intent IR v1 benchmark

This benchmark is provider-neutral and deterministic.

- `schema/case.schema.json` versions dataset records.
- `dataset/seed-v1.jsonl` contains development fixtures.
- `dataset/held-out-v1.jsonl` is a separate evaluation split and must never be copied into prompts or seed data.
- `requests-v1.jsonl` records provider-neutral chat requests. It contains no oracle fields.
- Model runners must append every observation, including timeout/error rows, and identify an immutable provider/model version.
- `evaluateIntentObservation` in the web source is the reference evaluator. It uses the production validator and compiler, not an LLM judge.

Run the deterministic evaluator tests with:

```sh
pnpm benchmark:intent
```

Contract versions: Intent IR `1`, benchmark case schema `1`, Scene DSL `4`.
