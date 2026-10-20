# Synthetic project — "Westside Office Renovation"

**Entirely fictional.** A commercial-electrical project used for demos and
deterministic evaluation. Upload these through the app (project → Manage
documents) to see the full workflow without any confidential data.

## Contents

- `documents/` — 15 communications (emails/field reports) + 5 RFIs (PDF/EML/TXT
  supported; here as `.eml`/`.txt`).
- `change-order-register.csv` — the formal change-order register to reconcile against.
- `ground-truth-labels.json` — expected results for evaluation. **Never fed to
  the model** — used only by the scorer in `services/processor/app/eval/`.

## What it exercises

- **3 unrecorded potential changes** (in the docs, absent from the register):
  conduit reroute per RFI-042, panel LP-3 relocation, server-room dedicated circuits.
- **3 recorded changes** (CO-010 / CO-012 / CO-015) that should reconcile as *matched*.
- **False positives** that must NOT be flagged: in-scope conduit (E-101),
  clarification-only panel note, and a duplicate of CO-010.
- **1 ambiguous** case: verbal direction for "extra pulls" with no CO.

## Run the evaluation

```bash
pnpm eval        # scores the pipeline (mock adapter) against the labels
```

The generator for this data lives in `services/processor/app/eval/synthetic.py`.
