# Multimodal AI for Urban Incident Response

An intelligent coordination layer that converts fragmented citizen reports —
photographs, written descriptions, voice notes and GPS — into **structured,
de-duplicated, prioritised incidents** routed to the department that owns them,
with a closed verification loop that reopens work that was closed without
evidence.

Built as a real-time, cloud-API-driven application rather than a dataset-trained
model. The only stored data is what users submit and what external APIs return.

---

## The closed loop

```
Detect → Understand → Combine → Prioritise → Identify Department
       → Notify → Respond → Verify Resolution → Escalate if required
```

Each stage is a separate exported function in `src/lib/pipeline.ts`, and every
intake emits a **trace** of what each stage did, how long it took, and which
engine produced it. The trace is shown to the user immediately after submission.

---

## What is real, and what is not

This is the part most worth reading. The project brief describes an ambitious
system; some of it is genuinely implementable with free APIs and some is not.
Rather than fake the difference, the unimplementable parts are isolated behind
interfaces and **labelled in the UI**.

| Capability | Status | How |
|---|---|---|
| Image understanding | **Real** | Gemini vision, JSON-schema constrained |
| Text + voice-transcript understanding | **Real** | Same multimodal call |
| Voice capture | **Real** | Browser on-device speech recognition → text |
| GPS + reverse geocoding | **Real** | `navigator.geolocation` + OpenStreetMap Nominatim |
| Weather context | **Real** | Open-Meteo, keyless |
| Duplicate detection | **Real** | Geo-temporal gate → model adjudication → merge |
| Priority scoring | **Real** | Deterministic formula, auditable breakdown |
| Department routing | **Real** | Standing allocation table |
| Dispatch packet generation | **Real** | Full structured payload |
| Resolution verification | **Real** | After-photo re-read against the original complaint |
| SLA + escalation | **Real** | Rule sweep, two levels |
| **Traffic conditions** | **Simulated** | No free real-time traffic API exists for this region. A simulated provider sits behind the same interface and reports `simulated: true`, which the UI renders as a warning. Swapping in a paid feed means replacing one function. |
| **Notifying authorities** | **Not transmitted** | No municipality exposes an ingestion API. The dispatch packet is generated in full and queued to an in-app outbox. Nothing leaves the machine. |
| **Video ingestion** | **Out of scope** | The architecture extends to it; it was descoped for time. |

---

## Two design decisions worth defending

**1. The model classifies; arithmetic decides.**
The model is never asked for a priority number. It returns a severity *band*
(`critical`/`high`/`medium`/`low`) and a set of hazard *booleans*. A fixed
formula in `computePriority()` turns those into a 0–100 score, and the incident
page renders every addend. Asked "why is this P1?", the answer is a table, not
"the model said so". LLMs are also measurably inconsistent at numeric ranking
across calls, which would make the queue order unstable.

**2. Nothing fails silently.**
If `GEMINI_API_KEY` is missing, or a call times out, 429s or returns
unparseable output, every stage falls back to a deterministic rule engine
(`src/lib/mock.ts`) and the result is tagged `engine: 'mock'`. The UI badges
those results **"Rule engine"** everywhere they appear. A demo that dies on an
expired key is worse than one that is honest about running on rules.

---

## Prompt engineering

Four prompts, all in `src/lib/prompts.ts` as data objects carrying their own
response schema and design rationale. The `/prompts` page renders *the same
objects the pipeline executes*, so documentation cannot drift from behaviour.

| Prompt | Stage | Does |
|---|---|---|
| `p1-extract` | Understand | One report (image + text + voice + location) → structured record |
| `p2-dedupe` | Combine | Are these two reports the same physical event? |
| `p3-fuse` | Combine | Several confirmed-same reports → one situation report + actions |
| `p4-verify` | Verify | Original complaint + after-photo → resolved / partial / unresolved |

Recurring techniques, each written up on the `/prompts` page:

- **Bands, not numbers.** Stable across calls; converted to points by code.
- **An explicit way to express doubt.** Every prompt defines what low confidence
  means and demands a `needsHumanReview` flag. Without it, every report returns
  0.9 confidence.
- **"Same physical event", not "similar text".** Two different potholes on one
  road produce near-identical descriptions; a similarity framing merges them
  wrongly.
- **Contradictions surfaced, not averaged.** When witnesses disagree, the fusion
  prompt must say so rather than silently picking one.
- **Verification is told what to look for.** Asked only "is this fixed?", the
  model rubber-stamps any tidy-looking photo. It is given the original complaint
  and warned that the after-photo may show a different angle or location.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

Works with no configuration — it will run on the rule engine and say so.
For live multimodal inference:

```bash
cp .env.example .env.local
# paste a key from https://aistudio.google.com/apikey
npm run dev
```

The store seeds itself with nine controlled scenarios on first request.
**Restore test scenarios** on the operations console resets it at any time.

---

## A five-minute demo path

1. **Overview** — the loop, the queue, and the scope table that states plainly
   what is simulated.
2. **Report intake** → pick the **Sion Circle** preset, paste:
   *"Bike and auto crashed at the circle, man injured on the road, traffic blocked"*
   → Submit. It **merges into INC-2026-0001** instead of creating a tenth
   incident. The trace shows the gate, the adjudication and the rescore.
3. **Open the incident** — four reports from four channels on one event, the
   merge log with its reasons, and the priority table recomputed with a
   corroboration bonus.
4. **Report intake** again → **Andheri East** preset, a pothole description →
   new incident, different department, P3 not P1. Same pipeline, different route.
5. **Operations console** → **Run escalation sweep** → overdue incidents escalate
   with a stated reason and a named recipient.
6. **INC-2026-0009** — a closure that was *rejected* at verification because the
   after-photo did not show the reported manhole. This is the loop closing.
7. **Prompt library** — the four prompts and why each is worded as it is.

---

## Where things live

```
src/lib/
  types.ts       Domain model. AI-derived fields kept separate from computed ones.
  taxonomy.ts    Policy tables: categories, departments, SLA targets, dedupe gates.
  prompts.ts     All four prompts + schemas + design rationale (rendered at /prompts).
  ai.ts          Gemini REST client. Falls back to mock.ts on any failure.
  mock.ts        Deterministic rule engine. Keyword classifier, honest about it.
  context.ts     Weather (live), reverse geocoding (live), traffic (simulated).
  pipeline.ts    The nine stages + the scoring formula + the escalation sweep.
  store.ts       JSON file store, serialised writes.
  seed.ts        Nine controlled test scenarios.

src/app/
  page.tsx                    Overview + scope statement
  report/                     Multimodal intake + live pipeline trace
  dashboard/                  Operations console: filters, table, map
  incidents/[id]/             Full case file
  prompts/                    Prompt library
  api/reports/                POST — runs the intake pipeline
  api/incidents/[id]/         PATCH — status and assignment
  api/incidents/[id]/verify/  POST — after-evidence verification
  api/escalate/               POST — SLA sweep
  api/seed/                   POST — restore test scenarios
```

### Notes on two things that look odd

**The trace shows `Combine` after `Identify Dept`.** The trace is execution
order, not the conceptual loop. Fusion belongs to Combine but has to run after
routing, because the fusion prompt is told which department owns the incident so
its recommended actions stay inside that department's remit.

**A JSON file instead of a database.** The project is assessed on the AI
coordination layer. A database adds setup that can fail on a demo machine
without adding anything to what is being assessed. All access goes through
`src/lib/store.ts`, so swapping in Postgres touches one file.

---

## Honest limitations

- **Duplicate detection is untested at scale.** It is correct on the nine
  scenarios and on live submissions, but the gate radii in `DEDUPE_GATES` are
  reasoned estimates, not values derived from real complaint data.
- **The rule engine is a keyword classifier.** It keeps the system demonstrable
  without a key; it is not a substitute for the model and does not claim to be.
- **Severity depends on reporter wording.** A calm description of a serious
  event will under-score. Corroboration partly compensates; a real deployment
  would need operator override, which the status controls only partly provide.
- **No authentication.** Every visitor is implicitly a control-room operator.
- **Single-node file store.** Writes are serialised in-process, so two server
  instances would race.
