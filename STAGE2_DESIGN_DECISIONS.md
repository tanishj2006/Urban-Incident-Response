# Stage 2 — Design Decisions and Divergences from Stage 1

**AI-Based Multimodal Urban Incident Reporting, Routing and Resolution Tracking System**
Pearl Jain (33) · Tanish Jain (34) · Prerana Mahajan (40) — TYCM-2

This document exists so that the differences between the Stage 1 design and the Stage 2
implementation are declared by us rather than discovered by a reader. Stage 1 Table 2.6
was explicit that nothing in it had been implemented and that the technology choice would
be revisited: *"the choice will be revisited in Stage 2 in the light of what data can
actually be assembled."* This is that revisit, with reasons.

---

## 1. What was kept exactly as designed

These are not approximations of the Stage 1 design. They are the Stage 1 design.

| Stage 1 | Where it is implemented |
|---|---|
| Ten incident categories (Table 2.2) | `src/lib/taxonomy.ts` → `CATEGORY_LABELS` |
| Category → department mapping held in an editable configuration table, not in code (Table 2.4, §2.2 Step 7) | `src/lib/taxonomy.ts` → `DEPARTMENTS` |
| Status lifecycle: Reported → Verified → Assigned → In Progress → Resolved → Closed, with an Escalated branch (Table 2.5, Figure 2.2) | `src/lib/types.ts` → `IncidentStatus` |
| Four priority levels, produced as a **recommendation** (§2.2 Step 6) | `src/lib/pipeline.ts` → `computePriority` |
| Both the recommended and the final priority recorded so disagreements can be reviewed (§2.2 Step 6) | `recommendedPriority` + `priorityOverride` on every incident |
| Duplicate detection combining location, time and category proximity (Table 2.3) | `DEDUPE_GATES` + `adjudicateDuplicate` |
| **Linking does not mean merging** — an official can separate reports (§2.2 Step 5) | `separateReport`, and the "Not the same event" control on every linked report |
| Low-confidence reports flagged for manual categorisation rather than forced into a category (§2.2 Step 4) | `needsManualCategorisation`, and the triage filter on the console |
| Escalation raises a flag; what happens next is a human decision (§2.2 Step 9) | `escalationSweep` |
| **Closure requires explicit confirmation** (§1.3.2, §4.1.13) | `confirmClosure` — the only path to `closed`, and it refuses without post-action evidence |
| Resolution verification compares post-action evidence with the original report and presents it as supporting information (§2.2 Step 10) | `verifyResolution` — advisory, cannot close |

The human-in-the-loop principle of §4.1.13 is enforced in code, not just described. The
API refuses `status: "closed"` outright, and `confirmClosure` refuses when no evidence is
on file. Both refusals are demonstrable.

---

## 2. Divergence: implementation stack

**Stage 1 planned** (Tables 2.8, 2.9): Python, Streamlit, FastAPI, SQLite/PostgreSQL,
PyTorch or TensorFlow, Hugging Face Transformers, Sentence-Transformers, Whisper, OpenCV.

**Stage 2 built**: TypeScript on Next.js, with a JSON document store, calling a hosted
multimodal model over HTTP. A Python notebook carries the evaluation.

**Why.** The Stage 1 stack was chosen on the assumption that the team would train models.
Section 3 below explains why that assumption did not survive the dataset survey. Once the
models are not being trained, the Python ML stack is carrying no weight: what remains is a
web interface, a store, and HTTP calls to a model, and a single-language implementation of
those is simpler to build and to demonstrate than a Streamlit front end over a FastAPI
back end.

**Trade-offs, honestly.**

- *Lost*: direct access to the scikit-learn / PyTorch ecosystem inside the application.
  Any future in-house model would need a separate Python service, which is a real cost.
- *Lost*: Streamlit's speed for throwaway interfaces. The dashboard took longer to build
  than a Streamlit equivalent would have.
- *Gained*: one language across the application; a dashboard dense enough to show evidence,
  score breakdowns, link decisions and audit trails on one screen, which is awkward in
  Streamlit's linear layout.
- *Gained*: the human-in-the-loop controls above, which are interaction-heavy.

**The evaluation remains in Python**, in `notebooks/evaluation.ipynb`, using NumPy,
pandas, scikit-learn, Pillow and Matplotlib — so the data-science work is done with the
tools Stage 1 named, and the baseline comparison Stage 1 asked for is actually run.

---

## 3. Divergence: pre-trained multimodal model instead of trained classifiers

**Stage 1 planned**: a TF-IDF baseline then a compact transformer for text; transfer
learning from a pre-trained CNN for images; Whisper for speech.

**Stage 2 built**: one pre-trained multimodal model, prompted with a schema-constrained
JSON contract, handling image and text in a single call. Speech is transcribed on-device
by the browser rather than by a hosted Whisper deployment.

**Why — and this follows from Stage 1's own findings, not from preference.**

Stage 1 §5.2 Week 2–3 recorded:

> *"Established that public datasets exist for road damage but not for most other
> categories, which will require the team to collect and label images in Stage 2."*

and Stage 1 §2.3 recorded that the team has three laptops and **no GPU**.

Training a ten-category image classifier therefore required the team to collect and label
images for eight categories, by hand, without GPU hardware, inside Stage 2. A model that
needs no training data for those eight categories removes the binding constraint. That is
the whole argument, and it is Stage 1's argument.

**What this costs, stated plainly.**

- **A per-call dependency on an external service.** Mitigated, not solved: every AI stage
  falls back to a deterministic rule engine, and results are badged in the UI with the
  engine that produced them, so a rule-engine result can never be mistaken for a model
  result. During testing the 3.x models returned transient `503 high demand` often enough
  that the client walks a list of candidate models and gives up inside a 30-second budget.
- **No training-set control.** We cannot inspect or correct what the model learned.
- **Running cost per report**, where a local CNN would be free after training.
- **Latency** of 5–15 seconds per report against tens of milliseconds for a local CNN.

**What it buys**: ten categories on day one instead of two, zero-shot rejection of
out-of-taxonomy inputs, and a free-text rationale per decision that the dashboard shows to
the official — a CNN emits a class index and nothing else.

---

## 4. Smaller divergences

| Stage 1 | Stage 2 | Reason |
|---|---|---|
| SQLite / PostgreSQL | JSON document store behind `src/lib/store.ts` | The assessment is of the coordination layer. A database adds setup that can fail on a demo machine without adding anything assessable. All access goes through one module, so substituting Postgres touches one file. |
| Video: frame extraction and frame-level classification | Not implemented | Descoped for time. The architecture extends to it — frames would enter the same image path — but claiming it without building it would be dishonest. |
| Folium for maps | Leaflet | Equivalent library for the chosen stack; both render OpenStreetMap. |
| Traffic as a contextual input | **Simulated provider, flagged in the UI** | No free real-time traffic API covers this region. The provider is isolated behind the same interface and reports `simulated: true`, which the interface renders as a warning on every incident. Substituting a paid feed means replacing one function. |
| Notification delivered to officials | Dispatch packet generated in full, queued to an in-app outbox, **not transmitted** | Stage 1 §1.3.2 already excluded direct integration with live government systems, "treated as a configurable interface, not an assumed capability". This implements that exclusion. |
| Whisper for speech-to-text | Browser speech recognition | Removes a hosted dependency for a branch whose output is plain text either way. Whisper remains the better choice for noisy field audio and for Indian-language input, and is the obvious upgrade. |

---

## 5. Evaluation

`notebooks/evaluation.ipynb` tests the classification stage on **real civic photographs**
from a public, ungated dataset the team did not label
([`Programmer-RD-AI/road-issues-detection-dataset`](https://huggingface.co/datasets/Programmer-RD-AI/road-issues-detection-dataset),
9,663 images).

It measures two things:

- **Task A** — accuracy within the taxonomy on pothole, road damage and garbage. Pothole
  versus road damage is the genuinely hard pair: both route to the same department but
  carry different repair work.
- **Task B** — whether out-of-taxonomy images (vandalism, broken road signs, illegal
  parking) are correctly answered `other` instead of being forced into a category. This is
  what Stage 1 §2.2 Step 4 demands, and it is the failure that costs an operations centre
  most.

Against a classical baseline of the kind Stage 1 planned (colour-histogram features with
logistic regression), **trained on this dataset** while the multimodal model has never
seen it — a comparison deliberately tilted in the baseline's favour.

Results, limitations and the confidence interval are in the notebook. The headline
limitation is worth repeating here: only **three of ten categories** could be evaluated,
because no public dataset covers the other seven at usable quality. That is the same gap
Stage 1 identified, and it has not closed.

---

## 6. What Stage 3 should do

1. **Collect and label Indian images** for the seven unevaluated categories. This is the
   single highest-value piece of work remaining, and Stage 1 identified it first.
2. **Fine-tune a local CNN** on that data and measure it against the multimodal model, to
   test whether the external dependency is still worth its cost.
3. **Evaluate the fusion stage**, which this evaluation does not touch — image plus text
   plus voice on the same incident.
4. **Measure duplicate detection** against human-judged pairs, and tune the gate radii in
   `DEDUPE_GATES`, which are currently reasoned estimates rather than fitted values.
5. **Add authentication and departmental scoping.** Every visitor is currently an
   operator, which Stage 1 §2.2 Step 8 did not intend.
