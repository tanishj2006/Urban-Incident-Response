'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { IncidentStatus } from '@/lib/types';
import { STATUS_LABELS } from '@/lib/taxonomy';

const FLOW: IncidentStatus[] = [
  'acknowledged',
  'assigned',
  'in_progress',
  'resolved_pending_verification',
];

export function StatusActions({
  id,
  status,
  assignee,
}: {
  id: string;
  status: IncidentStatus;
  assignee?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [crew, setCrew] = useState(assignee ?? '');
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/incidents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Update failed.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {FLOW.map((s) => (
          <button
            key={s}
            className={`btn py-1.5 text-[12.5px] ${status === s ? 'border-accent bg-accent-soft text-accent' : ''}`}
            disabled={busy || status === s}
            onClick={() => patch({ status: s })}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          className="field py-1.5 text-[13px]"
          placeholder="Assign a crew or unit"
          value={crew}
          onChange={(e) => setCrew(e.target.value)}
        />
        <button className="btn py-1.5 text-[12.5px]" disabled={busy} onClick={() => patch({ assignee: crew })}>
          Assign
        </button>
      </div>

      {error && <p className="text-[12.5px] text-p1">{error}</p>}
    </div>
  );
}

export function VerificationForm({ id }: { id: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set('closureNote', note);
    const f = fileRef.current?.files?.[0];
    if (f) fd.set('afterImage', f);

    try {
      const res = await fetch(`/api/incidents/${id}/verify`, { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Verification failed.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="block w-full text-[12.5px] text-muted file:mr-3 file:rounded-sm file:border file:border-line-strong file:bg-panel file:px-2.5 file:py-1 file:text-[12.5px] file:text-ink-2 hover:file:bg-sunken"
      />
      <textarea
        className="field min-h-[60px] resize-y text-[13px]"
        placeholder="Crew closure note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button className="btn btn-primary w-full py-2 text-[13px]" disabled={busy}>
        {busy ? 'Checking after-evidence…' : 'Submit for verification'}
      </button>
      {error && <p className="text-[12.5px] text-p1">{error}</p>}
      <p className="text-[11.5px] leading-snug text-faint">
        The after-photograph is checked against the original complaint. An unresolved verdict reopens the
        incident rather than closing it.
      </p>
    </form>
  );
}
