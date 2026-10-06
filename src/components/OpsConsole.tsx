'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type { Incident, PriorityBand } from '@/lib/types';
import { effectivePriority } from '@/lib/types';
import { CATEGORY_LABELS } from '@/lib/taxonomy';
import { PriorityChip, StatusChip, timeAgo, untilText } from './ui';

const IncidentMap = dynamic(() => import('./IncidentMap'), {
  ssr: false,
  loading: () => <div className="h-[420px] w-full rounded-sm border border-line bg-sunken" />,
});

type View = 'table' | 'map';
type Scope = 'open' | 'all' | 'closed' | 'triage';

export default function OpsConsole({ incidents }: { incidents: Incident[] }) {
  const router = useRouter();
  const [view, setView] = useState<View>('table');
  const [scope, setScope] = useState<Scope>('open');
  const [band, setBand] = useState<PriorityBand | 'all'>('all');
  const [dept, setDept] = useState('all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const departments = useMemo(
    () => Array.from(new Set(incidents.map((i) => i.department.name))).sort(),
    [incidents],
  );
  const triageCount = useMemo(
    () => incidents.filter((i) => i.needsManualCategorisation).length,
    [incidents],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return incidents.filter((i) => {
      if (scope === 'open' && i.status === 'closed') return false;
      if (scope === 'closed' && i.status !== 'closed') return false;
      if (scope === 'triage' && !i.needsManualCategorisation) return false;
      if (band !== 'all' && effectivePriority(i).band !== band) return false;
      if (dept !== 'all' && i.department.name !== dept) return false;
      if (needle) {
        const hay = `${i.id} ${i.title} ${i.fusedSummary} ${i.location.address ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [incidents, scope, band, dept, q]);

  async function run(action: 'escalate' | 'seed') {
    setBusy(action);
    setNotice(null);
    try {
      const res = await fetch(action === 'escalate' ? '/api/escalate' : '/api/seed', { method: 'POST' });
      const json = await res.json();
      setNotice(json.message ?? 'Done.');
      router.refresh();
    } catch {
      setNotice('Request failed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] leading-tight font-bold tracking-tight">Incidents</h1>
          <p className="mt-1.5 max-w-[60ch] text-[15.5px] text-ink-2">
            Every reported problem, most urgent first. Select one to see the full case and take action.
            Showing {rows.length} of {incidents.length}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => run('escalate')} disabled={busy !== null}>
            {busy === 'escalate' ? 'Checking…' : 'Escalate late incidents'}
          </button>
          <button className="btn" onClick={() => run('seed')} disabled={busy !== null}>
            {busy === 'seed' ? 'Resetting…' : 'Reset demo data'}
          </button>
          <Link className="btn btn-primary" href="/report">
            Report an issue
          </Link>
        </div>
      </div>

      {notice && (
        <div className="panel bg-accent-soft px-4 py-3 text-[14.5px] font-medium text-accent-ink">{notice}</div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[13.5px] text-muted">
        <span className="font-semibold text-ink-2">How urgent:</span>
        <PriorityChip band="P1" withLabel={false} />
        <PriorityChip band="P2" withLabel={false} />
        <PriorityChip band="P3" withLabel={false} />
        <PriorityChip band="P4" withLabel={false} />
        <span>Urgent cases are shown first.</span>
      </div>

      <div className="panel flex flex-wrap items-center gap-2.5 px-3.5 py-3">
        <Seg
          value={scope}
          onChange={(v) => setScope(v as Scope)}
          options={[
            ['open', 'Open'],
            ['triage', `Needs a category${triageCount ? ` (${triageCount})` : ''}`],
            ['closed', 'Closed'],
            ['all', 'All'],
          ]}
        />
        <Seg
          value={band}
          onChange={(v) => setBand(v as PriorityBand | 'all')}
          options={[
            ['all', 'Any urgency'],
            ['P1', 'Urgent'],
            ['P2', 'High'],
            ['P3', 'Medium'],
            ['P4', 'Low'],
          ]}
        />
        <select className="field w-auto py-2 text-[14px]" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="all">Any department</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <input
          className="field w-auto min-w-[200px] flex-1 py-2 text-[14px]"
          placeholder="Search by title, place or ID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Seg
          value={view}
          onChange={(v) => setView(v as View)}
          options={[
            ['table', 'List'],
            ['map', 'Map'],
          ]}
        />
      </div>

      {view === 'map' ? (
        <IncidentMap
          points={rows.map((i) => ({
            id: i.id,
            lat: i.location.lat,
            lng: i.location.lng,
            title: i.title,
            band: effectivePriority(i).band,
            reports: i.reports.length,
          }))}
        />
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[14.5px]">
              <thead>
                <tr className="border-b border-line bg-accent-soft/60 text-left">
                  <Th>Incident</Th>
                  <Th>Urgency</Th>
                  <Th>Type</Th>
                  <Th>Department</Th>
                  <Th className="text-right">Reports</Th>
                  <Th>Stage</Th>
                  <Th>Time to respond</Th>
                  <Th className="text-right">Reported</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => {
                  const sla = untilText(i.slaDueAt);
                  const pr = effectivePriority(i);
                  // The response clock stops once the crew reports completion;
                  // from there the verification stage owns the incident.
                  const clockStopped = i.status === 'closed' || i.status === 'resolved';
                  return (
                    <tr key={i.id} className="border-b border-line last:border-0 transition-colors hover:bg-accent-soft/40">
                      <td className="px-3 py-3 align-top">
                        <Link href={`/incidents/${i.id}`} className="block max-w-[320px]">
                          <span className="mono block text-faint">{i.id}</span>
                          <span className="mt-0.5 block font-semibold text-ink hover:text-accent">{i.title}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <PriorityChip band={pr.band} withLabel={false} />
                        <span className="tnum mt-1 block text-[12.5px] text-faint">
                          {i.priorityOverride
                            ? `changed by official (AI said ${i.recommendedPriority.band})`
                            : `score ${i.recommendedPriority.score}/100`}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-top text-muted">
                        {CATEGORY_LABELS[i.category]}
                        {i.needsManualCategorisation && (
                          <span className="chip mt-1 block w-fit bg-p2-soft text-p2">Needs a category</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top text-muted">{i.department.name}</td>
                      <td className="tnum px-3 py-2.5 text-right align-top text-ink-2">
                        {i.reports.length}
                        {i.reports.length > 1 && <span className="ml-1 text-[12px] text-violet">linked</span>}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <StatusChip status={i.status} />
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        {clockStopped ? (
                          <span className="text-faint">Done</span>
                        ) : (
                          <span className={sla.overdue ? 'font-semibold text-p1' : 'text-ink-2'}>{sla.text}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right align-top whitespace-nowrap text-faint">
                        {timeAgo(i.createdAt)}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center text-faint">
                      Nothing matches these filters. Try "Any urgency" or "All".
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-3 text-[13px] font-semibold text-ink-2 ${className}`}>{children}</th>;
}

function Seg({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="flex overflow-hidden rounded-sm border border-line-strong bg-panel">
      {options.map(([v, label], idx) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-3 py-2 text-[13.5px] font-semibold transition-colors ${
            idx > 0 ? 'border-l border-line-strong' : ''
          } ${value === v ? 'bg-accent text-white' : 'bg-panel text-ink-2 hover:bg-accent-soft'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
