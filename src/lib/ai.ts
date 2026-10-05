import fs from 'node:fs/promises';
import path from 'node:path';
import type { PromptSpec } from './prompts';
import type { Engine } from './types';

/**
 * Inference layer.
 *
 * Two engines sit behind one interface:
 *   - gemini : real multimodal calls, used when GEMINI_API_KEY is set
 *   - mock   : a deterministic rule engine used when there is no key, or when a
 *              live call fails for any reason
 *
 * The mock is not decoration. A demo that dies because of an expired key or a
 * rate limit is worse than one that is honest about running on rules, so every
 * AI result carries the engine that produced it and the UI labels it.
 */

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export function hasLiveEngine(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** Gemini's REST schema dialect wants OpenAPI types in upper case. */
function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === 'type' && typeof v === 'string') out[k] = v.toUpperCase();
      else out[k] = toGeminiSchema(v);
    }
    return out;
  }
  return node;
}

async function imagePart(imagePath?: string) {
  if (!imagePath) return null;
  try {
    const abs = path.join(process.cwd(), 'public', imagePath.replace(/^\//, ''));
    const buf = await fs.readFile(abs);
    const ext = path.extname(abs).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return { inlineData: { mimeType, data: buf.toString('base64') } };
  } catch {
    return null;
  }
}

export interface AiCall<T> {
  data: T;
  engine: Engine;
  latencyMs: number;
  error?: string;
}

/**
 * Run a prompt. Falls back to `mockFallback()` on missing key, network error,
 * HTTP error, or unparseable output — never throws into the pipeline.
 */
export async function runPrompt<T>(
  spec: PromptSpec,
  vars: Record<string, string>,
  mockFallback: () => T,
  imagePath?: string,
): Promise<AiCall<T>> {
  const started = Date.now();
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return { data: mockFallback(), engine: 'mock', latencyMs: Date.now() - started };
  }

  try {
    const parts: Record<string, unknown>[] = [{ text: spec.buildUser(vars) }];
    const img = await imagePart(imagePath);
    if (img) parts.push(img);

    const res = await fetch(`${ENDPOINT}/${MODEL}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: spec.system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: toGeminiSchema(spec.responseSchema),
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const body = await res.text();
      return {
        data: mockFallback(),
        engine: 'mock',
        latencyMs: Date.now() - started,
        error: `Gemini HTTP ${res.status}: ${body.slice(0, 180)}`,
      };
    }

    const json = await res.json();
    const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return {
        data: mockFallback(),
        engine: 'mock',
        latencyMs: Date.now() - started,
        error: 'Gemini returned no text part',
      };
    }
    return { data: JSON.parse(text) as T, engine: 'gemini', latencyMs: Date.now() - started };
  } catch (err) {
    return {
      data: mockFallback(),
      engine: 'mock',
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
