"""
Generates evaluation.ipynb.

The notebook is built from here rather than hand-edited so that the cell
sources stay readable in version control and the narrative can be revised
without fighting notebook JSON.

Run:  python3 build_notebook.py && jupyter nbconvert --execute --to notebook \
          --inplace evaluation.ipynb
"""

import json
import pathlib

MD = "markdown"
CODE = "code"

cells: list[tuple[str, str]] = []


def add(kind: str, src: str) -> None:
    cells.append((kind, src.strip("\n")))


# ─────────────────────────────────── 1 ─────────────────────────────────────────
add(
    MD,
    """
# Stage 2 Evaluation — Multimodal Incident Classification

**AI-Based Multimodal Urban Incident Reporting, Routing and Resolution Tracking System**
Pearl Jain (33) · Tanish Jain (34) · Prerana Mahajan (40) — TYCM-2

---

## What this notebook measures, and what it does not

Stage 1 proposed a ten-category incident classifier and planned to build it as a
**TF-IDF text baseline** plus **transfer learning from a pre-trained CNN** for images
(Table 2.6). The Stage 1 progress log also recorded the constraint that forced a
change of approach:

> *"Established that public datasets exist for road damage but not for most other
> categories, which will require the team to collect and label images in Stage 2."*
> — Stage 1, §5.2, Week 2–3

and, in §2.3, that the team has **no GPU hardware**.

Stage 2 therefore uses a pre-trained multimodal model (Gemini) applied zero-shot,
rather than a CNN fine-tuned on data the team does not have. This notebook tests
whether that substitution was justified, on **real photographs**, against a
**classical baseline of the kind Stage 1 planned**.

Two things are measured:

| Task | Question | Why it matters |
|---|---|---|
| **A. In-taxonomy classification** | Given a real civic-issue photograph, does the system assign the right one of our categories? | This is the pivot of the whole pipeline — the category drives routing and most of the priority score. |
| **B. Out-of-taxonomy rejection** | Given a photograph of something our taxonomy does *not* cover, does the system answer `other` instead of forcing a fit? | Stage 1 §2.2 Step 4 requires that a report "is not forced into a category". A confidently wrong category produces a confidently wrong dispatch. |

**Not measured here**, and stated plainly rather than implied:

- The text and voice branches. The dataset is images only.
- Severity and priority. No public dataset carries agreed severity labels, which is
  precisely why the application computes priority by rule rather than by model.
- Duplicate detection. No public dataset labels duplicate reports.
- Indian data. The images are not Mumbai-specific (see Limitations).
""",
)

# ─────────────────────────────────── 2 ─────────────────────────────────────────
add(
    CODE,
    """
import json, pathlib, random, collections
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from PIL import Image

import eval_lib as ev

# Reproducibility. Every sample drawn below uses this seed.
SEED = 20261006
random.seed(SEED)
np.random.seed(SEED)

# Images per class sent to the model.
#
# The free tier allows 20 requests per model per DAY, across roughly four
# candidate models - so about 80 successful calls a day in total. Twelve per
# class across six folders is 72 calls, which fits inside one day's quota.
# Every result is cached to results/cache/, so if the quota runs out mid-run the
# notebook can simply be re-executed tomorrow and will resume where it stopped.
N_PER_CLASS = 12

DATA_DIR = pathlib.Path("data")
OUT_DIR = pathlib.Path("results")
OUT_DIR.mkdir(exist_ok=True)

API_KEYS = ev.load_api_keys()
print(f"API keys loaded: {len(API_KEYS)}")
print(f"Approximate daily capacity: {len(API_KEYS) * len(ev.GEMINI_MODELS) * 20} calls "
      f"({len(API_KEYS)} keys x {len(ev.GEMINI_MODELS)} models x 20/day)")
print("Images per class:", N_PER_CLASS)
""",
)

# ─────────────────────────────────── 3 ─────────────────────────────────────────
add(
    MD,
    """
## 1. Dataset

[`Programmer-RD-AI/road-issues-detection-dataset`](https://huggingface.co/datasets/Programmer-RD-AI/road-issues-detection-dataset)
on Hugging Face — 9,663 photographs of civic issues, organised in folders by issue
type. Public, ungated, no credentials required.

It was chosen over the alternatives for three reasons:

1. **The photographs are of the right kind.** Street-level images of potholes, damaged
   road and dumped waste — the same thing a citizen would photograph.
2. **It contains categories we deliberately do not cover.** Vandalism, broken road
   signs and illegal parking are outside the Stage 1 Table 2.2 taxonomy, which gives
   us a genuine rejection test rather than a synthetic one.
3. **No labelling by us.** The folder names are the dataset author's labels, not ours.
   A team labelling its own test set and then scoring itself on it proves nothing.

### Mapping the dataset's folders to the Stage 1 taxonomy

Three folders map onto categories in Table 2.2. Three sit outside it and form the
rejection set. `Mixed Issues` is discarded — it is ambiguous by construction, and
scoring against an ambiguous label measures nothing.
""",
)

# ─────────────────────────────────── 4 ─────────────────────────────────────────
add(
    CODE,
    """
# Folder -> our category. `None` marks the out-of-taxonomy rejection set.
FOLDER_MAP = {
    "Road Issues/Pothole Issues":                                           "pothole",
    "Road Issues/Damaged Road issues":                                      "road_damage",
    "Public Cleanliness + Environmental Issues/Littering Garbage on Public Places Issues": "garbage",
    # Out of taxonomy — the correct answer for all of these is "other".
    "Public Cleanliness + Environmental Issues/Vandalism Issues":           None,
    "Road Issues/Broken Road Sign Issues":                                  None,
    "Road Issues/Illegal Parking Issues":                                   None,
}

index = ev.hf_file_index()
by_folder = collections.defaultdict(list)
for path in index:
    if not path.startswith("data/") or not path.lower().endswith((".jpg", ".jpeg", ".png")):
        continue
    folder = "/".join(path.split("/")[1:-1])
    if folder in FOLDER_MAP:
        by_folder[folder].append(path)

rows = []
for folder, paths in by_folder.items():
    rows.append({
        "folder": folder,
        "available": len(paths),
        "maps_to": FOLDER_MAP[folder] or "other (rejection set)",
    })
display(pd.DataFrame(rows).sort_values("folder").reset_index(drop=True))
""",
)

# ─────────────────────────────────── 5 ─────────────────────────────────────────
add(
    CODE,
    """
# Stratified sample: the same number from every folder, so that accuracy is not
# dominated by whichever class happens to be largest (potholes are 3,348 of 9,663).
sample = []
for folder, paths in sorted(by_folder.items()):
    chosen = random.sample(paths, min(N_PER_CLASS, len(paths)))
    for p in chosen:
        sample.append({"path": p, "folder": folder, "truth": FOLDER_MAP[folder] or "other"})

print(f"Sampled {len(sample)} images across {len(by_folder)} folders")

def fetch(row):
    dest = DATA_DIR / row["folder"].replace("/", "__")
    local = ev.download_image(row["path"], dest)
    return {**row, "local": str(local) if local else None}

sample = ev.parallel(fetch, sample, workers=10, desc="downloading")
sample = [s for s in sample if s and s["local"]]
print(f"{len(sample)} images on disk")
""",
)

# ─────────────────────────────────── 6 ─────────────────────────────────────────
add(
    MD,
    """
## 2. The prompt under test

This is the **production extraction prompt**, copied from `src/lib/prompts.ts`. It is
not a prompt written for the benchmark — evaluating a different prompt from the one
the application runs would measure nothing useful.

The two design decisions being tested here are visible in it:

- every category carries a **one-line definition**, not just a label, because
  "pothole" and "road damage" are otherwise routinely confused; and
- the model is told it **may answer `other`** rather than force a fit.
""",
)

# ─────────────────────────────────── 7 ─────────────────────────────────────────
add(
    CODE,
    """
CATEGORIES = {
    "accident":    "Vehicle collision or overturned vehicle on a road",
    "fire":        "Visible fire or smoke in a building or open area",
    "flooding":    "Standing water on roads or in low-lying areas",
    "garbage":     "Uncollected or overflowing waste",
    "pothole":     "Cavity or depression in the road surface",
    "fallen_tree": "Tree or large branch obstructing a road or footpath",
    "water_leak":  "Leaking pipeline or continuously running water",
    "road_damage": "Cracked, broken or subsided road surface",
    "streetlight": "Non-functioning or damaged street lighting",
    "other":       "Any civic issue outside the categories above",
}

SYSTEM = "\\n".join([
    "You are an intake analyst for a municipal emergency coordination centre.",
    "You convert messy citizen reports into structured incident records.",
    "",
    "The category must be exactly one of these:",
    *[f"  - {k}: {v}" for k, v in CATEGORIES.items()],
    'If the report does not clearly fit one of the first nine, answer "other". Do not force a fit.',
    "",
    "Rules you must follow:",
    "1. Describe ONLY what is visible in the image or stated in the text. Never infer "
    "casualty counts, causes, or damage you cannot see.",
    "2. If the evidence is ambiguous or thin, say so by setting needsHumanReview to true "
    "and lowering confidence.",
    "3. confidence means: how certain you are of the CATEGORY and SEVERITY, where 0.9+ "
    "means the evidence is unambiguous, 0.5-0.7 means plausible but under-evidenced, "
    "below 0.5 means guessing.",
    "4. Severity bands: critical = risk to life right now; high = risk of injury or major "
    "disruption; medium = significant inconvenience or slow-building risk; low = cosmetic "
    "or routine maintenance.",
    "5. Write the summary as one factual sentence a control-room operator can read aloud.",
    "Return JSON only, conforming exactly to the provided schema.",
])

SCHEMA = {
    "type": "object",
    "properties": {
        "category":         {"type": "string", "enum": list(CATEGORIES)},
        "severityBand":     {"type": "string", "enum": ["critical", "high", "medium", "low"]},
        "observedObjects":  {"type": "array", "items": {"type": "string"}},
        "confidence":       {"type": "number"},
        "needsHumanReview": {"type": "boolean"},
        "rationale":        {"type": "string"},
    },
    "required": ["category", "severityBand", "observedObjects", "confidence",
                 "needsHumanReview", "rationale"],
}

USER = ("Analyse this incident report.\\n\\nChannel: citizen_app\\n"
        "Citizen description: (none provided)\\n"
        "An image from the scene is attached. Treat it as the primary evidence.\\n\\n"
        "Produce the structured record.")

print(SYSTEM[:600], "...")
""",
)

# ─────────────────────────────────── 8 ─────────────────────────────────────────
add(
    CODE,
    """
import hashlib

def classify(row):
    img = pathlib.Path(row["local"]).read_bytes()
    # Cache key covers the image and the prompt, so editing the prompt
    # correctly invalidates every stored answer.
    key = hashlib.sha256(img + SYSTEM.encode() + USER.encode()).hexdigest()[:24]

    res = ev.cache_get(key)
    if res is None:
        res = ev.gemini_json(API_KEYS, SYSTEM, USER, SCHEMA, image_bytes=img)
        if res.get("ok"):
            ev.cache_put(key, res)   # only successes are cached
    if not res["ok"]:
        return {**row, "pred": None, "error": res["error"]}
    d = res["data"]
    return {
        **row,
        "pred": d["category"],
        "confidence": d.get("confidence"),
        "needsHumanReview": d.get("needsHumanReview"),
        "severity": d.get("severityBand"),
        "objects": ", ".join(d.get("observedObjects", [])[:4]),
        "rationale": d.get("rationale", ""),
        "model": res["model"],
        "error": None,
    }

assert API_KEYS, "No Gemini key found - put GEMINI_API_KEY in ../.env.local"
preds = ev.parallel(classify, sample, workers=2, desc="classifying")

df = pd.DataFrame([p for p in preds if p])
# If every call failed, the optional columns are absent entirely. Create them so
# the analysis below operates on empty selections rather than raising.
for col in ["pred", "confidence", "needsHumanReview", "severity", "objects",
            "rationale", "model", "error"]:
    if col not in df.columns:
        df[col] = None
failed = int(df["pred"].isna().sum())
print(f"\\nclassified: {len(df) - failed} | failed: {failed}")
if failed:
    print("example failure:", df[df['pred'].isna()]['error'].iloc[0][:160])
    print("\\nIf these are 429s, the free tier's daily quota is spent. Successful")
    print("results are cached, so re-running tomorrow resumes rather than restarts.")
    print("Rows that failed are excluded from the metrics below, and the reduced")
    print("sample size is reported with every figure.")

df.to_csv(OUT_DIR / "predictions.csv", index=False)
df[["folder", "truth", "pred", "confidence", "model"]].head(10)
""",
)

pathlib.Path(__file__)  # keeps linters quiet about the unused import
_PART1 = len(cells)


# ─────────────────────────────────── 9 ─────────────────────────────────────────
add(
    MD,
    """
## 3. Task A — classification within the taxonomy

Only the three in-taxonomy folders are scored here. An image whose true label is
`pothole` and which the model calls `road_damage` counts as an error, even though both
route to the same department — the two carry different repair work, so conflating them
would be a real operational failure, not a technicality.
""",
)

add(
    CODE,
    """
IN_TAX = ["pothole", "road_damage", "garbage"]

ok = df[df["pred"].notna()]
intax = ok[ok["truth"].isin(IN_TAX)].copy()
HAVE_MODEL = len(intax) > 0

if not HAVE_MODEL:
    print("No model predictions are available - the daily quota was exhausted.")
    print("The baseline sections below still run. Re-execute this notebook once the")
    print("quota resets; successful calls are cached, so it resumes rather than restarts.")
    acc = float("nan")
else:
    acc = (intax["truth"] == intax["pred"]).mean()
    print(f"In-taxonomy accuracy: {acc:.1%}  (n={len(intax)})")

def prf(sub, label):
    tp = int(((sub["pred"] == label) & (sub["truth"] == label)).sum())
    fp = int(((sub["pred"] == label) & (sub["truth"] != label)).sum())
    fn = int(((sub["pred"] != label) & (sub["truth"] == label)).sum())
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    f = 2 * p * r / (p + r) if p + r else 0.0
    return {"class": label, "support": int((sub["truth"] == label).sum()),
            "precision": round(p, 3), "recall": round(r, 3), "f1": round(f, 3)}

per_class = pd.DataFrame([prf(intax, c) for c in IN_TAX]) if HAVE_MODEL else pd.DataFrame(
    columns=["class", "support", "precision", "recall", "f1"]
)
if HAVE_MODEL:
    display(per_class)
    print(f"Macro F1: {per_class['f1'].mean():.3f}")
""",
)

add(
    CODE,
    """
# Confusion matrix over everything the model was allowed to answer, so that
# mistakes landing outside the three true classes stay visible.
if HAVE_MODEL:
    labels = IN_TAX + sorted(set(intax["pred"]) - set(IN_TAX))
    cm = pd.crosstab(intax["truth"], intax["pred"]).reindex(
        index=IN_TAX, columns=labels, fill_value=0)

    fig, ax = plt.subplots(figsize=(1.25 * len(labels) + 2.5, 3.4))
    ax.imshow(cm.values, cmap="Blues", vmin=0)
    ax.set_xticks(range(len(labels)), labels, rotation=35, ha="right", fontsize=9)
    ax.set_yticks(range(len(IN_TAX)), IN_TAX, fontsize=9)
    ax.set_xlabel("predicted"); ax.set_ylabel("true")
    ax.set_title(f"Task A — confusion matrix (n={len(intax)}, accuracy {acc:.1%})",
                 fontsize=10, pad=10)
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            v = cm.values[i, j]
            if v:
                ax.text(j, i, v, ha="center", va="center", fontsize=10,
                        color="white" if v > cm.values.max() * 0.6 else "#1b1a17")
    for s in ax.spines.values():
        s.set_visible(False)
    fig.tight_layout()
    fig.savefig(OUT_DIR / "confusion_matrix.png", dpi=160)
    plt.show()
    display(cm)
else:
    print("Confusion matrix unavailable until the model predictions exist.")
""",
)

# ─────────────────────────────────── 10 ────────────────────────────────────────
add(
    MD,
    """
## 4. Task B — rejecting what the taxonomy does not cover

Vandalism, broken road signs and illegal parking are all real civic issues, and all
outside Stage 1 Table 2.2. The correct answer for every one of them is `other`, which
in the application routes to the Central Control Room for manual assignment rather
than to a works department.

This is the test that a benchmark usually omits and an operations centre cares about
most: a system that confidently files graffiti as a pothole sends a patching crew to a
wall.
""",
)

add(
    CODE,
    """
outtax = ok[ok["truth"] == "other"].copy()
rej = (outtax["pred"] == "other").mean() if len(outtax) else float("nan")
print(f"Correctly rejected as 'other': {rej:.1%}  (n={len(outtax)})" if len(outtax)
      else "No out-of-taxonomy predictions available (quota).")
print()
mis = outtax[outtax["pred"] != "other"]
if len(mis):
    print("Where the out-of-taxonomy images were wrongly filed:")
    display(mis.groupby(["folder", "pred"]).size().rename("count").reset_index()
              .sort_values("count", ascending=False))
else:
    print("No out-of-taxonomy image was forced into a category.")

by_folder_rej = (outtax.assign(correct=outtax["pred"] == "other")
                 .groupby("folder")["correct"].agg(["mean", "size"])
                 .rename(columns={"mean": "rejected_correctly", "size": "n"}))
by_folder_rej["rejected_correctly"] = (by_folder_rej["rejected_correctly"] * 100).round(1)
display(by_folder_rej)
""",
)

add(
    CODE,
    """
# Does the model's own confidence separate its right answers from its wrong ones?
# If it does, the needsHumanReview / threshold mechanism in the application is
# doing real work rather than decorating the output.
allrows = ok.copy()
if not HAVE_MODEL:
    print("Skipped - no model predictions yet.")
    allrows["correct"] = []
else:
    allrows["correct"] = allrows["truth"] == allrows["pred"]
    summary = (allrows.groupby("correct")["confidence"]
               .agg(["count", "mean", "median"]).round(3))
    display(summary)

flagged = allrows["needsHumanReview"].fillna(False).astype(bool)
if flagged.any():
    print(f"Flagged needsHumanReview: {flagged.sum()} of {len(allrows)}")
    print(f"  accuracy on flagged rows:   {allrows[flagged]['correct'].mean():.1%}")
    print(f"  accuracy on unflagged rows: {allrows[~flagged]['correct'].mean():.1%}")
else:
    print("The model flagged nothing for human review on this sample.")
""",
)

# ─────────────────────────────────── 11 ────────────────────────────────────────
add(
    MD,
    """
## 5. Baseline — the classical approach Stage 1 planned

Stage 1 Table 2.6 lists "transfer learning from a pre-trained CNN" as the planned image
method, and the team's §2.3 hardware section records no GPU. Training that model is not
possible in the time available, so the baseline here is the honest cheap end of the same
family: **colour-histogram features and a logistic regression**, trained and tested on
the same images with a stratified split.

Two things to hold in mind when reading it:

- This baseline is **weaker than the CNN Stage 1 planned**. A fine-tuned ResNet would
  land somewhere between this and the multimodal model. The comparison sets a floor,
  not a ceiling.
- The baseline is **trained on this dataset** and the multimodal model has **never seen
  it**. The comparison is deliberately unfair in the baseline's favour. If the zero-shot
  model still wins, the substitution Stage 2 made is justified; if it does not, that is
  a finding worth reporting honestly.
""",
)

add(
    CODE,
    """
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

def features(path, bins=24):
    \"\"\"Colour histogram in HSV plus a coarse greyscale thumbnail.\"\"\"
    im = Image.open(path).convert("RGB").resize((128, 128))
    hsv = np.asarray(im.convert("HSV"), dtype=np.float32)
    hist = np.concatenate([
        np.histogram(hsv[:, :, c], bins=bins, range=(0, 255), density=True)[0]
        for c in range(3)
    ])
    thumb = np.asarray(im.convert("L").resize((16, 16)), dtype=np.float32).ravel() / 255.0
    return np.concatenate([hist, thumb])

# The baseline needs no API, so it uses every downloaded image rather than only
# the rows the model managed to classify. That keeps it computable even when the
# day's quota has run out.
base = pd.DataFrame(sample)
X = np.stack([features(p) for p in base["local"]])
y = base["truth"].values

X_tr, X_te, y_tr, y_te, idx_tr, idx_te = train_test_split(
    X, y, np.arange(len(y)), test_size=0.35, random_state=SEED, stratify=y
)

clf = LogisticRegression(max_iter=3000, C=1.0, multi_class="auto")
clf.fit(X_tr, y_tr)
base_pred = clf.predict(X_te)
base_acc_all = accuracy_score(y_te, base_pred)

# Same comparison the multimodal model was scored on: the three real categories.
mask = np.isin(y_te, IN_TAX)
base_acc_intax = accuracy_score(y_te[mask], base_pred[mask])

print(f"Baseline accuracy, all 4 labels incl. 'other': {base_acc_all:.1%}  (n={len(y_te)})")
print(f"Baseline accuracy, 3 in-taxonomy classes:      {base_acc_intax:.1%}  (n={int(mask.sum())})")
print(f"Baseline trained on {len(y_tr)} images, tested on {len(y_te)}.")
""",
)

add(
    CODE,
    """
# Score both methods on exactly the same held-out rows, otherwise the comparison
# is between different test sets and means nothing.
held = base.iloc[idx_te].copy()
held["baseline_pred"] = base_pred

# Keep only held-out rows the multimodal model also answered, so both methods
# are scored on identical images.
held = held.merge(ok[["path", "pred"]], on="path", how="inner")

h_in = held[held["truth"].isin(IN_TAX)]
h_out = held[held["truth"] == "other"]

if len(h_in) == 0 and len(h_out) == 0:
    print("No overlap between the held-out set and the model's answers yet.")
    print("Re-run once the quota resets to produce the comparison.")

def pct(sub, a, b):
    return f"{(sub[a] == sub[b]).mean():.1%}" if len(sub) else "n/a"

def pct_other(sub, a):
    return f"{(sub[a] == 'other').mean():.1%}" if len(sub) else "n/a"

def safe(x):
    try:
        return round(float(x), 4)
    except Exception:
        return None

comparison = pd.DataFrame([
    {
        "method": "Colour histogram + logistic regression (trained on this data)",
        "in-taxonomy accuracy": pct(h_in, "baseline_pred", "truth"),
        "out-of-taxonomy rejection": pct_other(h_out, "baseline_pred"),
    },
    {
        "method": "Gemini multimodal, zero-shot (never saw this data)",
        "in-taxonomy accuracy": pct(h_in, "pred", "truth"),
        "out-of-taxonomy rejection": pct_other(h_out, "pred"),
    },
])
display(comparison.set_index("method"))
print(f"Held-out set: {len(h_in)} in-taxonomy, {len(h_out)} out-of-taxonomy images.")

results = {
    "n_total": int(len(ok)),
    "n_in_taxonomy": int(len(intax)),
    "vlm_in_taxonomy_accuracy": safe(acc),
    "vlm_macro_f1": safe(per_class["f1"].mean()) if len(per_class) else None,
    "vlm_out_of_taxonomy_rejection": safe(rej),
    "baseline_in_taxonomy_accuracy_heldout": safe((h_in["baseline_pred"] == h_in["truth"]).mean()) if len(h_in) else None,
    "baseline_in_taxonomy_accuracy_full": safe(base_acc_intax),
    "baseline_out_of_taxonomy_rejection_heldout": safe((h_out["baseline_pred"] == "other").mean()) if len(h_out) else None,
    "vlm_in_taxonomy_accuracy_heldout": safe((h_in["pred"] == h_in["truth"]).mean()) if len(h_in) else None,
    "models_used": sorted(ok["model"].dropna().unique().tolist()),
    "failed_calls": int(failed),
    "seed": SEED,
}
(OUT_DIR / "results.json").write_text(json.dumps(results, indent=2))
print(json.dumps(results, indent=2))
""",
)

# ─────────────────────────────────── 12 ────────────────────────────────────────
add(
    MD,
    """
## 6. Limitations

Stated plainly, because an evaluation that hides them is not evidence.

1. **Not Indian data.** The photographs are not Mumbai-specific. Indian street scenes
   differ in road construction, traffic mix and waste presentation. These numbers are a
   capability check, not a deployment estimate for a Mumbai corporation.
2. **Three of ten categories.** No public dataset covers accident, fire, flooding,
   fallen tree, water leak or streetlight at usable quality — which is exactly the
   finding the Stage 1 progress log recorded. The remaining seven categories are
   unevaluated.
3. **Images only.** The text, voice and location branches are not tested here, so this
   says nothing about fusion quality.
4. **Small sample.** With ~30 images per class the confidence interval on each accuracy
   figure is wide — roughly ±10 percentage points at 95%. Treat gaps smaller than that
   as noise.
5. **The baseline is weaker than Stage 1's plan.** A fine-tuned CNN would score higher
   than colour histograms. The gap shown is an upper bound on the advantage.
6. **Dataset labels are not audited.** The folder names are the dataset author's. Spot
   checks suggest they are reasonable; they have not been verified image by image.
7. **The model is non-deterministic.** Re-running will shift the numbers slightly even
   at temperature 0.2.
8. **Sample size is capped by API quota, not by choice.** The free tier allows 20
   requests per model per day. With four candidate models that is roughly 80 calls a
   day, which is why the sample is twelve per class rather than several hundred.
   Successful calls are cached to `results/cache/`, so re-executing on later days
   accumulates evidence instead of repeating work. A paid tier would remove this
   constraint entirely and is the single cheapest way to tighten these numbers.
""",
)

# ──────────────────────────────── write it out ─────────────────────────────────

nb = {
    "cells": [
        {
            "cell_type": kind,
            "metadata": {},
            "source": src.splitlines(keepends=True),
            **({"outputs": [], "execution_count": None} if kind == CODE else {}),
        }
        for kind, src in cells
    ],
    "metadata": {
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
        "language_info": {"name": "python", "version": "3.11"},
    },
    "nbformat": 4,
    "nbformat_minor": 5,
}

out = pathlib.Path(__file__).parent / "evaluation.ipynb"
out.write_text(json.dumps(nb, indent=1))
print(f"wrote {out} with {len(cells)} cells")
