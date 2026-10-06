'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Incident, IncidentCategory, PriorityBand } from '@/lib/types';
import {
  ALL_CATEGORIES,
  CATEGORY_DESCRIPTIONS,
  CATEGORY_LABELS,
  PRIORITY_BANDS,
  PRIORITY_LABELS,
  STATUS_FLOW,
  STATUS_LABELS,
} from '@/lib/taxonomy';

/**
 * The official's console.
 *
 * Every control here exists because Stage 1 §4.1.13 requires it: "priority
 * recommendations can be overridden, duplicate groupings can be separated, and
 * closure requires explicit confirmation". The actions are deliberately
 * attributed — an unattributed override is not an audit trail.
 */

/** Who is acting. Kept in the browser so the audit trail names a person. */
function useOfficial(): [string, (v: string) => void] {
  const [name, setName] = useState('Duty Officer');
  useEffect(() => {
    try {
      const stored = localStorage.getItem('uir.official');
      if (stored) setName(stored);
    } catch {
      /* private mode — the default stands */
    }
  }, []);
  const set = (v: string) => {
    setName(v);
    try {
      localStorage.setItem('uir.official', v);
    } catch {
      /* ignore */
    }
  };
  return [name, set];
}

function usePatch(id: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>): Promise<boolean> {
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
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { patch, busy, error };
}

export function CaseActions({ incident }: { incident: Incident }) {
  const [official, setOfficial] = useOfficial();
  const { patch, busy, error } = usePatch(incident.id);
  const [crew, setCrew] = useState(incident.assignee ?? '');

  return (
    <div className="space-y-4">
      <div>
        <label className="label mb-1 block">Acting as</label>
        <input
          className="field py-1.5 text-[13px]"
          value={official}
          onChange={(e) => setOfficial(e.target.value)}
          placeholder="Your name or role"
        />
        <p className="mt-1 text-[11px] text-faint">Recorded against every action you take below.</p>
      </div>

      <div>
        <div className="label mb-1.5">Lifecycle</div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FLOW.map((s) => (
            <button
              key={s}
              className={`btn py-1.5 text-[12.5px] ${
                incident.status === s ? 'border-accent bg-accent-soft text-accent' : ''
              }`}
              disabled={busy || incident.status === s}
              onClick={() => patch({ status: s, actor: official })}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-faint">
          Closed is not in this row on purpose — it is reached only by confirming closure against
          post-action evidence.
        </p>
      </div>

      <div>
        <div className="label mb-1.5">Assignment</div>
        <div className="flex gap-2">
          <input
            className="field py-1.5 text-[13px]"
            placeholder="Crew or unit"
            value={crew}
            onChange={(e) => setCrew(e.target.value)}
          />
          <button
            className="btn py-1.5 text-[12.5px]"
            disabled={busy}
            onClick={() => patch({ assignee: crew, actor: official })}
          >
            Assign
          </button>
        </div>
      </div>

      <PriorityOverride incident={incident} official={official} />
      <Recategorise incident={incident} official={official} />

      {error && <p className="text-[12.5px] text-p1">{error}</p>}
    </div>
  );
}

function PriorityOverride({ incident, official }: { incident: Incident; official: string }) {
  const { patch, busy, error } = usePatch(incident.id);
  const [reason, setReason] = useState('');
  const current = incident.priorityOverride?.band ?? incident.recommendedPriority.band;

  return (
    <div className="border-t border-line pt-3">
      <div className="label mb-1.5">Priority — recommended {incident.recommendedPriority.band}</div>
      <div className="flex flex-wrap gap-1.5">
        {PRIORITY_BANDS.map((b: PriorityBand) => (
          <button
            key={b}
            className={`btn py-1.5 text-[12.5px] ${current === b ? 'border-accent bg-accent-soft text-accent' : ''}`}
            disabled={busy}
            onClick={() => patch({ priorityOverride: { band: b, reason }, actor: official })}
            title={PRIORITY_LABELS[b]}
          >
            {b}
          </button>
        ))}
        {incident.priorityOverride && (
          <button
            className="btn py-1.5 text-[12.5px]"
            disabled={busy}
            onClick={() => patch({ priorityOverride: { band: 'clear' }, actor: official })}
          >
            Clear override
          </button>
        )}
      </div>
      <input
        className="field mt-2 py-1.5 text-[13px]"
        placeholder="Reason for overriding (recorded)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {error && <p className="mt-1 text-[12.5px] text-p1">{error}</p>}
    </div>
  );
}

function Recategorise({ incident, official }: { incident: Incident; official: string }) {
  const { patch, busy, error } = usePatch(incident.id);
  const [to, setTo] = useState<IncidentCategory>(incident.category);

  return (
    <div className="border-t border-line pt-3">
      <div className="label mb-1.5">Category</div>
      {incident.needsManualCategorisation && (
        <p className="mb-2 rounded-sm bg-p2-soft px-2.5 py-2 text-[12px] leading-snug text-p2">
          The classifier did not reach the confidence threshold, so no category was committed. Assign one
          here.
        </p>
      )}
      <div className="flex gap-2">
        <select
          className="field py-1.5 text-[13px]"
          value={to}
          onChange={(e) => setTo(e.target.value as IncidentCategory)}
        >
          {ALL_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <button
          className="btn py-1.5 text-[12.5px]"
          disabled={busy || to === incident.category}
          onClick={() => patch({ recategorise: { to }, actor: official })}
        >
          Apply
        </button>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-faint">{CATEGORY_DESCRIPTIONS[to]}</p>
      {error && <p className="mt-1 text-[12.5px] text-p1">{error}</p>}
    </div>
  );
}

/** Separates one linked report into an incident of its own. */
export function SeparateButton({ incidentId, reportId }: { incidentId: string; reportId: string }) {
  const [official] = useOfficial();
  const { patch, busy, error } = usePatch(incidentId);
  return (
    <>
      <button
        className="btn px-2 py-1 text-[11.5px]"
        disabled={busy}
        onClick={() => patch({ separate: { reportId }, actor: official })}
        title="This report describes a different event"
      >
        {busy ? 'Separating…' : 'Not the same event'}
      </button>
      {error && <span className="ml-2 text-[11.5px] text-p1">{error}</span>}
    </>
  );
}

/** The only route to Closed. Refuses without post-action evidence on file. */
export function ClosureConfirm({ incident }: { incident: Incident }) {
  const [official] = useOfficial();
  const { patch, busy, error } = usePatch(incident.id);
  const [note, setNote] = useState('');

  if (incident.status === 'closed') {
    return (
      <div className="space-y-2">
        <div className="rounded-sm bg-ok-soft px-3 py-2.5 text-[13px] text-ok">
          Closed by {incident.closure?.by ?? 'an official'}.
        </div>
        {incident.closure?.note && (
          <p className="text-[12.5px] leading-snug text-muted">“{incident.closure.note}”</p>
        )}
        <button
          className="btn w-full py-2 text-[13px]"
          disabled={busy}
          onClick={() =>
            patch({ reopen: { reason: 'Reopened by an official after closure.' }, actor: official })
          }
        >
          Reopen this incident
        </button>
        {error && <p className="text-[12.5px] text-p1">{error}</p>}
      </div>
    );
  }

  const blocked = !incident.verification;

  return (
    <div className="space-y-2.5">
      <textarea
        className="field min-h-[56px] resize-y text-[13px]"
        placeholder="What you inspected before confirming (recorded)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button
        className="btn btn-primary w-full py-2 text-[13px]"
        disabled={busy || blocked}
        onClick={() => patch({ confirmClosure: { note }, actor: official })}
      >
        {busy ? 'Closing…' : 'Confirm closure'}
      </button>
      <p className="text-[11.5px] leading-snug text-faint">
        {blocked
          ? 'Post-action evidence must be submitted for verification before an incident can be closed.'
          : 'Closure is your decision, not the model’s. The verification verdict below is advisory.'}
      </p>
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
        className="field min-h-[56px] resize-y text-[13px]"
        placeholder="Crew closure note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button className="btn w-full py-2 text-[13px]" disabled={busy}>
        {busy ? 'Checking after-evidence…' : 'Submit post-action evidence'}
      </button>
      {error && <p className="text-[12.5px] text-p1">{error}</p>}
      <p className="text-[11.5px] leading-snug text-faint">
        The after-photograph is checked against the original complaint. The verdict is advisory: it can
        send the incident back to in-progress, but it cannot close it.
      </p>
    </form>
  );
}
