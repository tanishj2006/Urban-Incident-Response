'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import type { TraceStep } from '@/lib/pipeline';
import { CHANNEL_LABELS } from '@/lib/taxonomy';

/**
 * Demo anchors. Geolocation on a laptop is often wrong by kilometres or simply
 * denied, which would make the duplicate-collapse behaviour impossible to show.
 * "Sion Circle" deliberately sits inside the gate of seeded incident 0001, so
 * submitting a second accident report there demonstrates a live merge.
 */
const PRESETS: { label: string; note: string; lat: number; lng: number }[] = [
  { label: 'Sion Circle', note: 'merges with INC-2026-0001', lat: 19.04021, lng: 72.86271 },
  { label: 'Hindmata Jn.', note: 'merges with INC-2026-0003', lat: 19.0076, lng: 72.84101 },
  { label: 'Chembur Station', note: 'new location', lat: 19.0624, lng: 72.8988 },
  { label: 'Andheri East', note: 'new location', lat: 19.1136, lng: 72.8697 },
];

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

interface SubmitResult {
  incidentId: string;
  merged: boolean;
  priority: { score: number; band: string };
  department: string;
  trace: TraceStep[];
}

export default function ReportForm() {
  const [channel, setChannel] = useState('citizen_app');
  const [reporterName, setReporterName] = useState('');
  const [text, setText] = useState('');
  const [transcript, setTranscript] = useState('');
  const [lat, setLat] = useState<string>('19.04021');
  const [lng, setLng] = useState<string>('72.86271');
  const [preview, setPreview] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return setPreview(null);
    setPreview(URL.createObjectURL(f));
  }

  function useMyLocation() {
    if (!navigator.geolocation) return setError('This browser does not expose geolocation.');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(5));
        setLng(pos.coords.longitude.toFixed(5));
      },
      () => setError('Location permission was refused. Pick a preset or enter coordinates manually.'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  function toggleDictation() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const w = window as unknown as Record<string, unknown>;
    const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
      | (new () => SpeechRecognitionLike)
      | undefined;

    if (!Ctor) {
      setSpeechError('Speech recognition is unavailable in this browser. Type the transcript instead.');
      return;
    }

    const rec = new Ctor();
    rec.lang = 'en-IN';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let out = '';
      for (let i = 0; i < e.results.length; i++) out += e.results[i][0].transcript;
      setTranscript(out.trim());
    };
    rec.onerror = () => {
      setSpeechError('Dictation stopped unexpectedly. Type the transcript instead.');
      setListening(false);
    };
    rec.onend = () => setListening(false);

    recRef.current = rec;
    setSpeechError(null);
    setListening(true);
    rec.start();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);

    const fd = new FormData();
    fd.set('channel', channel);
    fd.set('reporterName', reporterName);
    fd.set('text', text);
    fd.set('voiceTranscript', transcript);
    fd.set('lat', lat);
    fd.set('lng', lng);
    const f = fileRef.current?.files?.[0];
    if (f) fd.set('image', f);

    try {
      const res = await fetch('/api/reports', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Intake failed.');
      setResult(json as SubmitResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Intake failed.');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setResult(null);
    setText('');
    setTranscript('');
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  if (result) return <TraceView result={result} onAgain={reset} />;

  return (
    <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
      <div className="space-y-5">
        <section className="panel p-4">
          <h2 className="label mb-3">Evidence</h2>

          <label className="mb-1.5 block text-[13px] font-medium text-ink-2">Written description</label>
          <textarea
            className="field min-h-[110px] resize-y"
            placeholder="Describe what you can see. For example: two-wheeler and auto collided at the circle, rider is on the road and not getting up, traffic fully stuck."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          <div className="mt-4 flex items-center justify-between gap-3">
            <label className="text-[13px] font-medium text-ink-2">Voice note</label>
            <button type="button" className="btn py-1.5 text-[12.5px]" onClick={toggleDictation}>
              {listening ? '■ Stop dictation' : '● Start dictation'}
            </button>
          </div>
          <textarea
            className="field mt-1.5 min-h-[70px] resize-y"
            placeholder="Transcript appears here as you speak, or type it directly."
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
          />
          <p className="mt-1.5 text-[11.5px] leading-snug text-faint">
            {speechError ??
              'Speech is transcribed on-device by the browser; the resulting text enters the multimodal extraction prompt alongside the photograph.'}
          </p>

          <div className="mt-4">
            <label className="mb-1.5 block text-[13px] font-medium text-ink-2">Photograph</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={pickFile}
              className="block w-full text-[13px] text-muted file:mr-3 file:rounded-sm file:border file:border-line-strong file:bg-panel file:px-3 file:py-1.5 file:text-[13px] file:text-ink-2 hover:file:bg-sunken"
            />
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="Selected evidence preview"
                className="mt-3 max-h-[220px] rounded-sm border border-line object-contain"
              />
            )}
          </div>
        </section>
      </div>

      <div className="space-y-5">
        <section className="panel p-4">
          <h2 className="label mb-3">Source</h2>
          <label className="mb-1.5 block text-[13px] font-medium text-ink-2">Channel</label>
          <select className="field" value={channel} onChange={(e) => setChannel(e.target.value)}>
            {Object.entries(CHANNEL_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>

          <label className="mt-3 mb-1.5 block text-[13px] font-medium text-ink-2">
            Reporter <span className="font-normal text-faint">(optional)</span>
          </label>
          <input
            className="field"
            value={reporterName}
            onChange={(e) => setReporterName(e.target.value)}
            placeholder="Name or handle"
          />
        </section>

        <section className="panel p-4">
          <h2 className="label mb-3">Location</h2>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setLat(String(p.lat));
                  setLng(String(p.lng));
                }}
                className={`rounded-sm border px-2.5 py-1.5 text-left text-[12px] transition-colors ${
                  Number(lat) === p.lat
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line-strong bg-panel text-ink-2 hover:bg-sunken'
                }`}
              >
                <span className="block font-medium">{p.label}</span>
                <span className="block text-[11px] opacity-70">{p.note}</span>
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="label mb-1 block">Latitude</label>
              <input className="field mono" value={lat} onChange={(e) => setLat(e.target.value)} />
            </div>
            <div>
              <label className="label mb-1 block">Longitude</label>
              <input className="field mono" value={lng} onChange={(e) => setLng(e.target.value)} />
            </div>
          </div>

          <button type="button" className="btn mt-2.5 w-full" onClick={useMyLocation}>
            Use my current location
          </button>
        </section>

        {error && (
          <div className="panel border-p1/30 bg-p1-soft px-4 py-3 text-[13.5px] text-p1">{error}</div>
        )}

        <button type="submit" className="btn btn-primary w-full py-2.5" disabled={busy}>
          {busy ? 'Running pipeline…' : 'Submit report'}
        </button>
        <p className="text-[11.5px] leading-snug text-faint">
          Submission runs the full chain: extraction, context enrichment, duplicate adjudication,
          scoring, routing and dispatch-packet generation. Each step is reported back.
        </p>
      </div>
    </form>
  );
}

function TraceView({ result, onAgain }: { result: SubmitResult; onAgain: () => void }) {
  const tone = {
    ok: 'text-ok',
    fallback: 'text-p2',
    skipped: 'text-faint',
  } as const;

  return (
    <div className="space-y-5">
      <div className="panel p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`chip ${result.merged ? 'bg-p2-soft text-p2' : 'bg-ok-soft text-ok'}`}>
            {result.merged ? 'Merged into an existing incident' : 'New incident created'}
          </span>
          <span className="mono text-faint">{result.incidentId}</span>
        </div>
        <h2 className="mt-2.5 text-[19px] font-semibold tracking-tight">
          Priority {result.priority.band} · {result.priority.score}/100
        </h2>
        <p className="mt-1 text-[14px] text-muted">Routed to {result.department}.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/incidents/${result.incidentId}`} className="btn btn-primary">
            Open the incident
          </Link>
          <button className="btn" onClick={onAgain}>
            Submit another report
          </button>
        </div>
      </div>

      <section className="panel overflow-hidden">
        <header className="border-b border-line px-4 py-2.5">
          <h2 className="label">Pipeline trace</h2>
        </header>
        <ol>
          {result.trace.map((s, i) => (
            <li key={i} className="flex gap-3 border-b border-line px-4 py-3 last:border-0">
              <span className="mono w-5 shrink-0 pt-0.5 text-faint">{String(i + 1).padStart(2, '0')}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="label">{s.stage}</span>
                  <span className="text-[13.5px] font-medium text-ink">{s.label}</span>
                  <span className={`text-[11.5px] font-medium ${tone[s.status]}`}>
                    {s.status === 'fallback' ? 'fell back to rules' : s.status}
                  </span>
                  {s.engine && (
                    <span className="chip bg-sunken text-muted">
                      {s.engine === 'gemini' ? 'Gemini' : 'Rule engine'}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[13px] leading-snug text-muted">{s.detail}</p>
              </div>
              <span className="tnum shrink-0 pt-0.5 text-[11.5px] text-faint">{s.ms} ms</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
