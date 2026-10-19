# ScopeSignal — Evaluation

> The evaluation harness and synthetic dataset are built in **Phase 4**. This document records the
> plan so the design is fixed up front.

## Synthetic dataset (fixtures)

Lives in `supabase/fixtures/synthetic-project/`. A fictional commercial electrical project with:

- ≥ 15 realistic fictional project communications (emails / field reports)
- ≥ 5 fictional RFIs
- A change-order register CSV
- ≥ 3 intentionally **unrecorded** potential change events (true positives)
- ≥ 3 clearly **recorded** change events
- ≥ 2 false-positive scenarios (in-scope work, duplicate instructions, no-op clarifications)
- ≥ 1 ambiguous scenario (verbal direction referenced but unsubstantiated, missing authorization)

Ground-truth labels live in a **separate** fixture file and are **never** included in prompts sent
to the model during evaluation.

## Metrics

- Candidate event recall
- Candidate precision
- Register-matching accuracy
- Unsupported-claim rate (findings whose text is not backed by cited evidence)
- Missing-citation rate
- Duplicate-finding rate
- Processing time
- Estimated model cost

## Running it

A reproducible command (Phase 4) runs the pipeline against the synthetic project in `AI_MODE=mock`
by default (deterministic) and optionally in `AI_MODE=live`. Results are engineering signals only —
**not** claims of commercial accuracy.
