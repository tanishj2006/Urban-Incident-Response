"""
Mechanical helpers for the Stage 2 evaluation notebook.

Only plumbing lives here — fetching the dataset index, downloading images, and
calling the Gemini Interactions API. Everything that constitutes a *choice*
(the prompt, the sampling design, the metrics, the baseline) stays visible in
the notebook, because those are the parts being assessed.
"""

from __future__ import annotations

import base64
import concurrent.futures as cf
import json
import os
import pathlib
import threading
import time
import urllib.parse

import requests

# ──────────────────────────────── rate limiting ────────────────────────────────
#
# The free tier returns HTTP 429 aggressively. A first run at six concurrent
# workers lost 167 of 180 calls to 429 — so requests are spaced globally, and a
# 429 is retried with backoff rather than treated as a dead model.

MIN_REQUEST_INTERVAL = 2.0  # seconds between any two API requests

# The free tier's limit turned out to be 20 requests per model per DAY, not per
# minute. A 429 therefore will not clear by waiting, so the client moves to the
# next candidate model immediately and the day's capacity is roughly
# 20 x (number of models). Results are cached to disk so that a run interrupted
# by quota resumes where it stopped instead of starting over.
RETRIES_PER_MODEL = 1
BACKOFF = [5.0]

CACHE_DIR = pathlib.Path("results/cache")


def _cache_path(key: str) -> pathlib.Path:
    return CACHE_DIR / f"{key}.json"


def cache_get(key: str):
    try:
        return json.loads(_cache_path(key).read_text())
    except Exception:
        return None


def cache_put(key: str, value) -> None:
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        _cache_path(key).write_text(json.dumps(value))
    except Exception:
        pass

_rate_lock = threading.Lock()
_last_request = [0.0]


def _throttle() -> None:
    """Blocks until MIN_REQUEST_INTERVAL has passed since the last request."""
    with _rate_lock:
        wait = MIN_REQUEST_INTERVAL - (time.time() - _last_request[0])
        if wait > 0:
            time.sleep(wait)
        _last_request[0] = time.time()

# ──────────────────────────────── configuration ────────────────────────────────

HF_REPO = "Programmer-RD-AI/road-issues-detection-dataset"
HF_API = f"https://huggingface.co/api/datasets/{HF_REPO}"
HF_FILES = f"https://huggingface.co/datasets/{HF_REPO}/resolve/main/"

GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions"

# Same candidate list the application uses. The 3.x flash models return a
# transient 503 "high demand" often enough that depending on one is unwise.
GEMINI_MODELS = [
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
    "gemini-3.5-flash",
]


def load_api_keys(env_path: str = "../.env.local") -> list[str]:
    """
    Every Gemini key available, in rotation order.

    The free tier allows 20 requests per model per DAY, so one key cannot carry
    an evaluation. The app's .env.local may hold GEMINI_API_KEY plus
    GEMINI_API_KEY_2, _3, … (one per team member's Google account); each is a
    separate allowance.
    """
    keys: list[str] = []
    names = ["GEMINI_API_KEY"] + [f"GEMINI_API_KEY_{i}" for i in range(2, 7)]

    env: dict[str, str] = {}
    p = pathlib.Path(env_path)
    if p.exists():
        for line in p.read_text().splitlines():
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()

    for name in names:
        val = os.environ.get(name) or env.get(name)
        if val and val not in keys:
            keys.append(val)
    return keys


def load_api_key(env_path: str = "../.env.local") -> str | None:
    """Backwards-compatible single-key accessor."""
    keys = load_api_keys(env_path)
    return keys[0] if keys else None


# ──────────────────────────────── dataset access ───────────────────────────────


def hf_file_index(timeout: int = 60) -> list[str]:
    """Every file path in the dataset repository. One request, no auth."""
    r = requests.get(HF_API, timeout=timeout)
    r.raise_for_status()
    return [s["rfilename"] for s in r.json().get("siblings", [])]


def download_image(rel_path: str, dest_dir: pathlib.Path, timeout: int = 60) -> pathlib.Path | None:
    """Downloads one image, skipping the request if it is already on disk."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    out = dest_dir / rel_path.split("/")[-1]
    if out.exists() and out.stat().st_size > 0:
        return out
    url = HF_FILES + urllib.parse.quote(rel_path)
    try:
        r = requests.get(url, timeout=timeout)
        if r.status_code != 200 or not r.content:
            return None
        out.write_bytes(r.content)
        return out
    except Exception:
        return None


def parallel(fn, items, workers: int = 8, desc: str = ""):
    """Runs fn over items with a thread pool, printing progress on one line."""
    results = [None] * len(items)
    done = 0
    started = time.time()
    with cf.ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(fn, it): idx for idx, it in enumerate(items)}
        for fut in cf.as_completed(futures):
            idx = futures[fut]
            try:
                results[idx] = fut.result()
            except Exception as exc:  # noqa: BLE001 - surfaced in the result row
                results[idx] = {"error": str(exc)}
            done += 1
            if done % 5 == 0 or done == len(items):
                el = time.time() - started
                print(f"\r{desc} {done}/{len(items)}  ({el:5.1f}s)", end="", flush=True)
    print()
    return results


# ──────────────────────────────── model access ─────────────────────────────────


def gemini_json(
    api_key: str | list[str],
    system_instruction: str,
    user_text: str,
    schema: dict,
    image_bytes: bytes | None = None,
    mime_type: str = "image/jpeg",
    models: list[str] | None = None,
    per_attempt_timeout: int = 60,
) -> dict:
    """
    One schema-constrained call to the Gemini Interactions API.

    Returns {"ok": True, "data": {...}, "model": "..."} or
            {"ok": False, "error": "..."}.
    Walks the candidate models on 503/429, which are transient and per-model.
    """
    payload_input: list[dict] = [{"type": "text", "text": user_text}]
    if image_bytes is not None:
        payload_input.append(
            {
                "type": "image",
                "data": base64.b64encode(image_bytes).decode("ascii"),
                "mime_type": mime_type,
            }
        )

    body = {
        "system_instruction": system_instruction,
        "input": payload_input,
        "response_format": {
            "type": "text",
            "mime_type": "application/json",
            "schema": schema,
        },
    }

    keys = [api_key] if isinstance(api_key, str) else list(api_key)
    last = "no attempt made"

    # Each (model, key) pair carries its own daily allowance, so both are walked.
    for model in models or GEMINI_MODELS:
        model_congested = False
        for ki, key in enumerate(keys):
            _throttle()
            try:
                r = requests.post(
                    GEMINI_ENDPOINT,
                    headers={"Content-Type": "application/json", "x-goog-api-key": key},
                    json={"model": model, **body},
                    timeout=per_attempt_timeout,
                )
            except Exception as exc:  # noqa: BLE001
                last = f"{model}: {exc}"
                continue

            # 429 is this key's daily quota for this model: try the next key.
            if r.status_code == 429:
                last = f"{model}/key{ki + 1}: HTTP 429 (daily quota)"
                continue
            # 503 is model congestion and affects every key: next model.
            if r.status_code == 503:
                last = f"{model}: HTTP 503 (busy)"
                model_congested = True
                break
            if r.status_code != 200:
                last = f"{model}: HTTP {r.status_code} {r.text[:120]}"
                break

            text = _extract_text(r.json())
            if not text:
                last = f"{model}: no model_output text"
                break
            try:
                return {"ok": True, "data": json.loads(text), "model": model, "key_index": ki + 1}
            except json.JSONDecodeError as exc:
                last = f"{model}: unparseable JSON ({exc})"
                break
        if model_congested:
            continue

    return {"ok": False, "error": last}


def _extract_text(envelope: dict) -> str | None:
    for step in envelope.get("steps", []):
        if step.get("type") != "model_output":
            continue
        for part in step.get("content", []):
            if part.get("type") == "text" and part.get("text"):
                return part["text"]
    return None
