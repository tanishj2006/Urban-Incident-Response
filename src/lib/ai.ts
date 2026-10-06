import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { PromptSpec } from './prompts';
import type { Engine } from './types';

/**
 * Inference layer.
 *
 * Uses the Gemini **Interactions API** (POST /v1beta/interactions). The older
 * `:generateContent` endpoint is not usable here: keys issued now are refused
 * on the 2.5-series models with
 *   404 "no longer available to new users … use the Interactions API"
 * so this client targets the current endpoint and the 3.x models.
 *
 * Two engines sit behind one interface:
 *   - gemini : real multimodal calls
 *   - mock   : a deterministic rule engine, used when there is no key, when
 *              every candidate model is busy, or when a call fails
 *
 * The mock is not decoration. A demo that dies on an expired key, a 503 or a
 * rate limit is worse than one that is honest about running on rules, so every
 * AI result carries the engine that produced it and the UI labels it.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

/**
 * Candidate models, tried in order. The 3.x flash models are frequently
 * returning 503 "experiencing high demand", which is transient and model
 * specific — so a busy model is a reason to try the next one, not to give up.
 */
const DEFAULT_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-3.8-flash',
  'gemini-3.5-flash',
];

function modelCandidates(): string[] {
  const pinned = process.env.GEMINI_MODEL?.trim();
  const list = pinned ? [pinned, ...DEFAULT_MODELS.filter((m) => m !== pinned)] : DEFAULT_MODELS;
  return list.slice(0, MAX_ATTEMPTS);
}

/**
 * Failure budget.
 *
 * The 3.x flash models return 503 often, and each 503 takes several seconds to
 * come back. Walking the whole candidate list cost 52 s in testing before the
 * rule engine took over — far too slow to sit in front of a user. A fast,
 * labelled fallback is worth more than a slow model result, so the client stops
 * trying once the budget is spent.
 */
const MAX_ATTEMPTS = 3;
const PER_ATTEMPT_MS = 18_000;
const TOTAL_BUDGET_MS = 30_000;

/**
 * API keys, in rotation order.
 *
 * The free tier allows 20 requests per model per DAY. One key is not enough to
 * rehearse a demo, let alone run an evaluation, so the client accepts several —
 * `GEMINI_API_KEY`, then `GEMINI_API_KEY_2`, `_3`, … — and moves to the next
 * when one is exhausted. Capacity is roughly 20 × models × keys per day.
 */
function apiKeys(): string[] {
  const keys: string[] = [];
  const first = process.env.GEMINI_API_KEY?.trim();
  if (first) keys.push(first);
  for (let i = 2; i <= 6; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`]?.trim();
    if (k) keys.push(k);
  }
  return keys;
}

export function hasLiveEngine(): boolean {
  return apiKeys().length > 0;
}

export function keyCount(): number {
  return apiKeys().length;
}

async function imagePart(imagePath?: string) {
  if (!imagePath) return null;
  try {
    const abs = path.join(process.cwd(), 'public', imagePath.replace(/^\//, ''));
    const buf = await fs.readFile(abs);
    const ext = path.extname(abs).toLowerCase();
    // SVG is not an accepted vision input; the seeded placeholders are SVG.
    if (ext === '.svg') return null;
    const mime_type =
      ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return { type: 'image', data: buf.toString('base64'), mime_type };
  } catch {
    return null;
  }
}

/** Pulls the model's text out of the Interactions response envelope. */
function extractText(json: unknown): string | undefined {
  const steps = (json as { steps?: unknown[] })?.steps;
  if (!Array.isArray(steps)) return undefined;
  for (const step of steps) {
    const s = step as { type?: string; content?: { type?: string; text?: string }[] };
    if (s?.type !== 'model_output' || !Array.isArray(s.content)) continue;
    const text = s.content.find((c) => c?.type === 'text')?.text;
    if (text) return text;
  }
  return undefined;
}

export interface AiCall<T> {
  data: T;
  engine: Engine;
  latencyMs: number;
  /** Which model actually served the call. Surfaced in the pipeline trace. */
  model?: string;
  /** True when the result was replayed from the on-disk cache, not re-inferred. */
  cached?: boolean;
  error?: string;
}

/**
 * On-disk response cache.
 *
 * The free tier allows 20 requests per model per day. Rehearsing a demo would
 * otherwise exhaust the day's quota before anyone watched it. Identical input
 * — same prompt, same image, same schema — yields the same stored response, so
 * repeating a submission costs nothing and returns instantly.
 *
 * Cached results are flagged `cached: true` and labelled in the pipeline trace;
 * a replayed answer must never be passed off as a fresh inference.
 */
const CACHE_DIR = path.join(process.cwd(), 'data', 'ai-cache');
const CACHE_ENABLED = process.env.AI_CACHE !== 'off';

function cacheKey(spec: PromptSpec, userText: string, imageB64: string | null): string {
  return crypto
    .createHash('sha256')
    .update(spec.id)
    .update('\u0000')
    .update(spec.system)
    .update('\u0000')
    .update(userText)
    .update('\u0000')
    .update(imageB64 ? crypto.createHash('sha256').update(imageB64).digest('hex') : 'no-image')
    .digest('hex')
    .slice(0, 32);
}

async function cacheRead<T>(key: string): Promise<{ data: T; model?: string } | null> {
  if (!CACHE_ENABLED) return null;
  try {
    const raw = await fs.readFile(path.join(CACHE_DIR, `${key}.json`), 'utf8');
    return JSON.parse(raw) as { data: T; model?: string };
  } catch {
    return null;
  }
}

async function cacheWrite(key: string, data: unknown, model: string): Promise<void> {
  if (!CACHE_ENABLED) return;
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(
      path.join(CACHE_DIR, `${key}.json`),
      JSON.stringify({ data, model, storedAt: new Date().toISOString() }, null, 2),
      'utf8',
    );
  } catch {
    /* a cache failure must never fail the pipeline */
  }
}

/**
 * Run a prompt. Falls back to `mockFallback()` on missing key, every model
 * busy, network error, HTTP error or unparseable output — never throws into
 * the pipeline.
 */
export async function runPrompt<T>(
  spec: PromptSpec,
  vars: Record<string, string>,
  mockFallback: () => T,
  imagePath?: string,
): Promise<AiCall<T>> {
  const started = Date.now();
  const keys = apiKeys();
  const userText = spec.buildUser(vars);
  const img = await imagePart(imagePath);

  // A cached answer is served even without a key: it was produced by the model
  // earlier, so replaying it is honest as long as it is labelled.
  const ck = cacheKey(spec, userText, (img?.data as string) ?? null);
  const hit = await cacheRead<T>(ck);
  if (hit) {
    return {
      data: hit.data,
      engine: 'gemini',
      latencyMs: Date.now() - started,
      model: hit.model,
      cached: true,
    };
  }

  if (keys.length === 0) {
    return { data: mockFallback(), engine: 'mock', latencyMs: Date.now() - started };
  }

  const input: Record<string, unknown>[] = [{ type: 'text', text: userText }];
  if (img) input.push(img);

  const body = {
    system_instruction: spec.system,
    input,
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: spec.responseSchema,
    },
  };

  let lastError = 'no model attempted';

  // Every (model, key) pair is a separate daily allowance, so both are walked.
  // Written with flags rather than labelled loops: a labelled `continue` is
  // mangled by the production bundler and breaks the build.
  let budgetSpent = false;

  for (const model of modelCandidates()) {
    if (budgetSpent) break;
    let modelUnusable = false;

    for (let k = 0; k < keys.length && !modelUnusable; k++) {
      if (Date.now() - started > TOTAL_BUDGET_MS) {
        lastError = `${lastError}; budget of ${TOTAL_BUDGET_MS / 1000}s spent, stopped trying`;
        budgetSpent = true;
        break;
      }
      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': keys[k] },
          body: JSON.stringify({ model, ...body }),
          signal: AbortSignal.timeout(PER_ATTEMPT_MS),
        });

        // 429 is this key's daily quota for this model — try the next key.
        if (res.status === 429) {
          lastError = `${model}/key${k + 1}: HTTP 429 (daily quota)`;
          continue;
        }
        // 503 is model congestion and affects every key — move to the next model.
        if (res.status === 503) {
          lastError = `${model}: HTTP 503 (busy)`;
          modelUnusable = true;
          continue;
        }
        if (!res.ok) {
          lastError = `${model}: HTTP ${res.status} ${(await res.text()).slice(0, 140)}`;
          modelUnusable = true;
          continue;
        }

        const json = await res.json();
        const text = extractText(json);
        if (!text) {
          lastError = `${model}: response contained no model_output text`;
          modelUnusable = true;
          continue;
        }

        const parsed = JSON.parse(text) as T;
        await cacheWrite(ck, parsed, model);
        return {
          data: parsed,
          engine: 'gemini',
          latencyMs: Date.now() - started,
          model,
        };
      } catch (err) {
        lastError = `${model}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }

  return {
    data: mockFallback(),
    engine: 'mock',
    latencyMs: Date.now() - started,
    error: lastError,
  };
}
