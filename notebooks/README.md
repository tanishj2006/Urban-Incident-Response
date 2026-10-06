# Stage 2 Evaluation

`evaluation.ipynb` measures the classification stage on real civic photographs.

## Running it

```bash
cd notebooks
python3 -m pip install numpy pandas scikit-learn matplotlib pillow requests nbformat nbconvert

# execute in place, writing the outputs into the notebook
python3 -m jupyter nbconvert --execute --to notebook --inplace \
    --ExecutePreprocessor.timeout=2400 evaluation.ipynb
```

Or open it in VS Code / Jupyter and run the cells.

## API quota — read this before running

The Gemini free tier allows **20 requests per model per day**, not per minute. The
notebook reads every key from `../.env.local`:

```
GEMINI_API_KEY=...
GEMINI_API_KEY_2=...     # a second Google account
GEMINI_API_KEY_3=...
```

and walks every (model, key) pair, so capacity is roughly
`20 x models x keys` per day. With one key that is ~80 calls; the notebook needs 72.

**Successful calls are cached** to `results/cache/`, keyed by image and prompt. If the
quota runs out part-way, re-running on another day resumes rather than restarting. The
notebook also degrades gracefully: with no model predictions at all it still runs the
classical baseline and says clearly what is missing.

Editing the prompt changes the cache key, which correctly invalidates every stored
answer.

## What it produces

| File | Contents |
|---|---|
| `results/predictions.csv` | One row per image: true label, prediction, confidence, model used |
| `results/results.json` | Headline metrics, for quoting in the report |
| `results/confusion_matrix.png` | Task A confusion matrix |
| `data/` | Downloaded images, reused across runs |

## Files

- `evaluation.ipynb` — the notebook. **Generated**; do not hand-edit.
- `build_notebook.py` — the source the notebook is built from. Edit this, then re-run it.
- `eval_lib.py` — dataset access, rate limiting, key rotation, Gemini plumbing.

```bash
python3 build_notebook.py     # regenerates evaluation.ipynb
```
