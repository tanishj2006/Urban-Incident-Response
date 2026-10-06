# Multimodal AI for Urban Incident Response

**Stage 2 implementation** of *AI-Based Multimodal Urban Incident Reporting, Routing and
Resolution Tracking System*
Pearl Jain (33) · Tanish Jain (34) · Prerana Mahajan (40) — TYCM-2, SAKEC

An intelligent coordination layer that converts fragmented citizen reports —
photographs, written descriptions, voice notes and GPS — into **structured,
de-duplicated, prioritised incidents** routed to the department that owns them, with a
closed verification loop and an authorised official in control of every consequential
decision.

> Divergences from the Stage 1 design are declared, with reasons, in
> [`STAGE2_DESIGN_DECISIONS.md`](./STAGE2_DESIGN_DECISIONS.md).
> The evaluation is in [`notebooks/evaluation.ipynb`](./notebooks/evaluation.ipynb).

---

## The closed loop

```
Detect → Understand → Combine → Prioritise → Identify Department
       → Notify → Respond → Verify Resolution → Escalate if required
```

Each stage is a separate exported function in `src/lib/pipeline.ts`, and every intake
emits a **trace** of what each stage did, how long it took, and which engine produced it.
The trace is shown to the user immediately after submission.

---

## Human-in-the-loop, enforced rather than described

Stage 1 §4.1.13 makes this the governing principle: *"The system classifies, links,
recommends and flags; an authorised official verifies, assigns, acts and closes."* Four
mechanisms implement it, and each one refuses in code:

| Requirement | Mechanism | Try it |
|---|---|---|
| "Closure requires explicit confirmation" (§1.3.2, §4.1.13) | `confirmClosure` is the only path to `closed`, and it refuses without post-action evidence | `PATCH {"status":"closed"}` → **400** |
| "Linking does not mean merging … an official can separate reports" (§2.2 Step 5) | Every linked report carries a **Not the same event** control that splits it into its own incident and rescores both | INC-2026-0001 has three linked reports |
| "Priority recommendations can be overridden … the system records both" (§2.2 Step 6) | `recommendedPriority` is never mutated; `priorityOverride` sits beside it | INC-2026-0004 is overridden P2 → P1 |
| "Not forced into a category … flagged for manual categorisation" (§2.2 Step 4) | Below the confidence threshold the category is withheld and the incident enters a triage queue | INC-2026-0010 |

Verification is **advisory**. A `resolved` verdict moves an incident to `Resolved` and
stops there; an `unresolved` verdict sends it back to `In progress` and escalates. Neither
closes anything.

---

## What is real, and what is not

| Capability | Status | How |
|---|---|---|
| Image understanding | **Real** | Gemini Interactions API, JSON-schema constrained |
| Text + voice-transcript understanding | **Real** | Same multimodal call |
| Voice capture | **Real** | Browser on-device speech recognition → text |
| GPS + reverse geocoding | **Real** | `navigator.geolocation` + OpenStreetMap Nominatim |
| Weather context | **Real** | Open-Meteo, keyless |
| Duplicate detection | **Real** | Geo-temporal gate → model adjudication → link (reversible) |
| Priority scoring | **Real** | Deterministic formula, auditable breakdown |
| Department routing | **Real** | Stage 1 Table 2.4 allocation table |
| Dispatch packet generation | **Real** | Full structured payload |
| Resolution verification | **Real** | After-photo re-read against the original complaint |
| SLA + escalation | **Real** | Rule sweep, two levels |
| **Traffic conditions** | **Simulated** | No free real-time traffic feed covers this region. A simulated provider sits behind the same interface and reports `simulated: true`, which the UI renders as a warning. Replacing it means replacing one function. |
| **Notifying authorities** | **Not transmitted** | Stage 1 §1.3.2 already excluded live government integration. The packet is generated in full and queued to an in-app outbox. Nothing leaves the machine. |
| **Video ingestion** | **Out of scope** | The architecture extends to it; it was descoped for time. |

---

## Two design decisions worth defending

**1. The model classifies; arithmetic decides.**
The model is never asked for a priority number. It returns a severity *band* and hazard
*booleans*. A fixed formula in `computePriority()` turns those into a 0–100 score, and the
incident page renders every addend. Asked "why is this P1?", the answer is a table. LLMs
are also measurably inconsistent at numeric ranking across calls, which would make the
queue order unstable.

**2. Nothing fails silently.**
If `GEMINI_API_KEY` is missing, or every candidate model is busy, or a call returns
unparseable output, each stage falls back to a deterministic rule engine
(`src/lib/mock.ts`) and the result is tagged `engine: 'mock'`. The UI badges those
**"Rule engine"** everywhere they appear. A demo that dies on a 503 is worse than one that
is honest about running on rules.

---

## Prompt engineering

Four prompts, in `src/lib/prompts.ts` as data objects carrying their own response schema
and design rationale. The `/prompts` page renders *the same objects the pipeline
executes*, so documentation cannot drift from behaviour.

| Prompt | Stage | Does |
|---|---|---|
| `p1-extract` | Understand | One report (image + text + voice + location) → structured record |
| `p2-dedupe` | Combine | Are these two reports the same physical event? |
| `p3-fuse` | Combine | Several confirmed-same reports → situation report + actions |
| `p4-verify` | Verify | Original complaint + after-photo → resolved / partial / unresolved |

Recurring techniques, each written up on the `/prompts` page:

- **Bands, not numbers.** Stable across calls; converted to points by code.
- **An explicit way to express doubt.** Every prompt defines what low confidence means and
  demands a `needsHumanReview` flag. Without it, every report returns 0.9.
- **Category definitions, not just labels.** "Pothole" and "Road damage" are otherwise
  routinely confused — and the evaluation measures exactly that pair.
- **Permission to answer "other".** A confidently wrong category produces a confidently
  wrong dispatch.
- **"Same physical event", not "similar text".** Two different potholes on one road produce
  near-identical descriptions.
- **Contradictions surfaced, not averaged.** When witnesses disagree, the fusion prompt
  must say so rather than silently picking one.
- **Verification is told what to look for,** and warned that the after-photo may show a
  different angle or location.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

Works with no configuration — it runs on the rule engine and says so. For live
multimodal inference:

```bash
cp .env.example .env.local
# paste a key from https://aistudio.google.com/apikey
npm run dev
```

**A note on models.** The client calls the Gemini **Interactions API**
(`/v1beta/interactions`). Keys issued now are refused on the 2.5-series models with
`404 "no longer available to new users … use the Interactions API"`, so the candidates are
3.x. Those models return a transient `503 high demand` frequently, so the client walks a
list (`gemini-3.6-flash` first) and falls back to rules inside a 30-second budget rather
than hanging.

The store seeds itself with ten controlled scenarios on first request. **Restore test
scenarios** on the operations console resets it at any time.

---

## A six-minute demo path

1. **Overview** — the loop, the queue, the "where humans decide" panel, and the scope
   table that states plainly what is simulated.
2. **Report intake** → pick the **Sion Circle** preset, paste
   *"Bike and auto crashed at the circle, man injured on the road, traffic blocked"*
   → Submit. It **links into INC-2026-0001** instead of creating an eleventh incident.
   The trace shows the gate, the adjudication and the rescore.
3. **Open INC-2026-0001** — four reports from four channels on one event, the link log with
   its reasons, the priority table recomputed with a corroboration bonus. Click
   **Not the same event** on one report: it splits into its own incident and both rescore.
4. **INC-2026-0010** — a report too vague to classify. The system refused to guess and put
   it in the triage queue. Assign a category and watch routing and priority recompute.
5. **INC-2026-0006** — verification says *resolved*, and the incident is still open. Closure
   waits for a named official. Confirm it, and the name is recorded.
6. **INC-2026-0009** — a closure that was **rejected** at verification because the
   after-photo did not show the reported location. Sent back and escalated. This is the
   loop closing.
7. **Operations console** → **Run escalation sweep** → overdue incidents escalate with a
   stated reason and a named recipient.
8. **Prompt library** (optional, hidden from the sidebar — open `/prompts` directly) — the four prompts and why each is worded as it is.

---

## Where things live

```
src/lib/
  types.ts       Domain model. AI-derived fields kept separate from computed ones.
  taxonomy.ts    Stage 1 policy tables: categories, departments, SLA, dedupe gates.
  prompts.ts     All four prompts + schemas + rationale (rendered at /prompts).
  ai.ts          Gemini Interactions client, model fallback, time budget.
  mock.ts        Deterministic rule engine. Keyword classifier, honest about it.
  context.ts     Weather (live), reverse geocoding (live), traffic (simulated).
  pipeline.ts    The nine stages, the scoring formula, escalation, and the
                 human-in-the-loop corrections (separate / recategorise / override).
  store.ts       JSON document store, serialised writes.
  seed.ts        Ten controlled test scenarios.

src/app/
  page.tsx                    Overview + scope statement
  report/                     Multimodal intake + live pipeline trace
  dashboard/                  Operations console: filters, triage queue, table, map
  incidents/[id]/             Full case file + official actions
  prompts/                    Prompt library
  api/...                     Intake, official actions, verification, escalation, seed

notebooks/
  evaluation.ipynb   Stage 2 evaluation on real civic photographs
  eval_lib.py        Dataset access and model plumbing
  build_notebook.py  Regenerates the notebook from source
```

### Notes on two things that look odd

**The trace shows `Combine` after `Identify Dept`.** The trace is execution order, not the
conceptual loop. Fusion belongs to Combine but must run after routing, because the fusion
prompt is told which department owns the incident so its recommended actions stay inside
that department's remit.

**A JSON file instead of a database.** The project is assessed on the coordination layer.
All access goes through `src/lib/store.ts`, so substituting Postgres touches one file.

---

## Honest limitations

- **Only three of ten categories are evaluated.** No public dataset covers the other seven
  at usable quality — the same gap Stage 1 recorded in Week 2–3, still open.
- **The evaluation is image-only.** Fusion of image with text and voice is untested.
- **Duplicate gate radii are reasoned estimates**, not values fitted to real complaint data.
- **The rule engine is a keyword classifier.** It keeps the system demonstrable without a
  key; it is not a substitute for the model and does not claim to be.
- **Severity depends on reporter wording.** A calm description of a serious event will
  under-score. Corroboration partly compensates; the priority override exists for the rest.
- **No authentication.** Every visitor is implicitly an operator, which Stage 1 §2.2 Step 8
  did not intend.
- **Single-node file store.** Writes are serialised in-process, so two server instances
  would race.
