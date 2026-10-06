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
        <label className="mb-1.5 block text-[14px] font-semibold text-ink-2">You are acting as</label>
        <input
          className="field py-2 text-[14px]"
          value={official}
          onChange={(e) => setOfficial(e.target.value)}
          placeholder="Your name or role"
        />
        <p className="mt-1.5 text-[12.5px] text-muted">Your name is saved with every action you take here.</p>
      </div>

      <div>
        <div className="mb-1.5 text-[14px] font-semibold text-ink-2">Move to the next stage</div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FLOW.map((s) => (
            <button
              key={s}
              className={`btn py-1.5 text-[13.5px] ${
                incident.status === s ? 'border-accent bg-accent text-white disabled:opacity-100' : ''
              }`}
              disabled={busy || incident.status === s}
              onClick={() => patch({ status: s, actor: official })}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12.5px] leading-snug text-muted">
          There is no "Closed" button here on purpose. An incident is closed only from the "Close this
          incident" box below, after the fix has been checked.
        </p>
      </div>

      <div>
        <div className="mb-1.5 text-[14px] font-semibold text-ink-2">Who is responding?</div>
        <div className="flex gap-2">
          <input
            className="field py-2 text-[14px]"
            placeholder="Crew or unit name"
            value={crew}
            onChange={(e) => setCrew(e.target.value)}
          />
          <button
            className="btn btn-primary py-1.5 text-[13.5px]"
            disabled={busy}
            onClick={() => patch({ assignee: crew, actor: official })}
          >
            Assign
          </button>
        </div>
      </div>

      <PriorityOverride incident={incident} official={official} />
      <Recategorise incident={incident} official={official} />

      {error && <p className="text-[13px] font-medium text-p1">{error}</p>}
    </div>
  );
}

function PriorityOverride({ incident, official }: { incident: Incident; official: string }) {
  const { patch, busy, error } = usePatch(incident.id);
  const [reason, setReason] = useState('');
  const current = incident.priorityOverride?.band ?? incident.recommendedPriority.band;

  return (
    <div className="border-t border-line pt-3">
      <div className="mb-1.5 text-[14px] font-semibold text-ink-2">Change the urgency</div>
      <p className="mb-2 text-[12.5px] text-muted">
        The AI suggested {PRIORITY_LABELS[incident.recommendedPriority.band]} ({incident.recommendedPriority.band}).
        You can set a different level.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {PRIORITY_BANDS.map((b: PriorityBand) => (
          <button
            key={b}
            className={`btn py-1.5 text-[13.5px] ${current === b ? 'border-accent bg-accent text-white' : ''}`}
            disabled={busy}
            onClick={() => patch({ priorityOverride: { band: b, reason }, actor: official })}
            title={PRIORITY_LABELS[b]}
          >
            {PRIORITY_LABELS[b]}
          </button>
        ))}
        {incident.priorityOverride && (
          <button
            className="btn py-1.5 text-[13.5px]"
            disabled={busy}
            onClick={() => patch({ priorityOverride: { band: 'clear' }, actor: official })}
          >
            Use the AI's suggestion
          </button>
        )}
      </div>
      <input
        className="field mt-2 py-2 text-[14px]"
        placeholder="Why are you changing it? (saved)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {error && <p className="mt-1 text-[13px] font-medium text-p1">{error}</p>}
    </div>
  );
}

function Recategorise({ incident, official }: { incident: Incident; official: string }) {
  const { patch, busy, error } = usePatch(incident.id);
  const [to, setTo] = useState<IncidentCategory>(incident.category);

  return (
    <div className="border-t border-line pt-3">
      <div className="mb-1.5 text-[14px] font-semibold text-ink-2">Type of incident</div>
      {incident.needsManualCategorisation && (
        <p className="mb-2 rounded-sm bg-p2-soft px-3 py-2.5 text-[13px] leading-snug text-p2">
          The AI was not sure enough to choose a type, so it left this blank for you. Pick one below.
        </p>
      )}
      <div className="flex gap-2">
        <select
          className="field py-2 text-[14px]"
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
          className="btn btn-primary py-1.5 text-[13.5px]"
          disabled={busy || to === incident.category}
          onClick={() => patch({ recategorise: { to }, actor: official })}
        >
          Apply
        </button>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-snug text-muted">{CATEGORY_DESCRIPTIONS[to]}</p>
      {error && <p className="mt-1 text-[13px] font-medium text-p1">{error}</p>}
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
        className="btn px-2.5 py-1 text-[12.5px]"
        disabled={busy}
        onClick={() => patch({ separate: { reportId }, actor: official })}
        title="This report is about a different problem. Move it into its own incident."
      >
        {busy ? 'Separating…' : 'Not the same problem'}
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
        <div className="rounded-sm bg-ok-soft px-3.5 py-3 text-[14px] font-semibold text-ok">
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
        className="field min-h-[64px] resize-y text-[14px]"
        placeholder="What did you check before closing it? (saved)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button
        className="btn btn-primary w-full py-2.5 text-[14.5px]"
        disabled={busy || blocked}
        onClick={() => patch({ confirmClosure: { note }, actor: official })}
      >
        {busy ? 'Closing…' : 'Confirm and close'}
      </button>
      <p className="text-[12.5px] leading-snug text-muted">
        {blocked
          ? 'To close this, first send an after-photo using "Was it fixed?" below.'
          : 'Closing is your decision, not the AI’s. The AI check below is only advice.'}
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
        className="block w-full text-[13.5px] text-muted file:mr-3 file:rounded-sm file:border file:border-accent file:bg-accent-soft file:px-3 file:py-1.5 file:text-[13.5px] file:font-semibold file:text-accent-ink hover:file:bg-accent hover:file:text-white"
      />
      <textarea
        className="field min-h-[64px] resize-y text-[14px]"
        placeholder="Note from the crew (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button className="btn w-full py-2.5 text-[14.5px]" disabled={busy}>
        {busy ? 'Checking the photo…' : 'Send after-photo for checking'}
      </button>
      {error && <p className="text-[13px] font-medium text-p1">{error}</p>}
      <p className="text-[12.5px] leading-snug text-muted">
        The AI compares your after-photo with the original report. If it looks unfixed, the incident goes
        back to "In progress". It can never close an incident.
      </p>
    </form>
  );
}
