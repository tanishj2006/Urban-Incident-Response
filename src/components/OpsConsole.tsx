'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type { Incident, PriorityBand } from '@/lib/types';
import { CATEGORY_LABELS } from '@/lib/taxonomy';
import { PriorityChip, StatusChip, timeAgo, untilText } from './ui';

const IncidentMap = dynamic(() => import('./IncidentMap'), {
  ssr: false,
  loading: () => <div className="h-[420px] w-full rounded-sm border border-line bg-sunken" />,
});

type View = 'table' | 'map';
type Scope = 'open' | 'all' | 'closed';

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

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return incidents.filter((i) => {
      if (scope === 'open' && i.status === 'verified_closed') return false;
      if (scope === 'closed' && i.status !== 'verified_closed') return false;
      if (band !== 'all' && i.priority.band !== band) return false;
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
          <h1 className="text-[22px] font-semibold tracking-tight">Operations console</h1>
          <p className="mt-1 text-[14px] text-muted">
            {rows.length} of {incidents.length} incidents shown.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => run('escalate')} disabled={busy !== null}>
            {busy === 'escalate' ? 'Sweeping…' : 'Run escalation sweep'}
          </button>
          <button className="btn" onClick={() => run('seed')} disabled={busy !== null}>
            {busy === 'seed' ? 'Restoring…' : 'Restore test scenarios'}
          </button>
          <Link className="btn btn-primary" href="/report">
            New report
          </Link>
        </div>
      </div>

      {notice && (
        <div className="panel bg-accent-soft px-4 py-2.5 text-[13.5px] text-accent-ink">{notice}</div>
      )}

      <div className="panel flex flex-wrap items-center gap-2 px-3 py-2.5">
        <Seg
          value={scope}
          onChange={(v) => setScope(v as Scope)}
          options={[
            ['open', 'Open'],
            ['closed', 'Closed'],
            ['all', 'All'],
          ]}
        />
        <Seg
          value={band}
          onChange={(v) => setBand(v as PriorityBand | 'all')}
          options={[
            ['all', 'All priorities'],
            ['P1', 'P1'],
            ['P2', 'P2'],
            ['P3', 'P3'],
            ['P4', 'P4'],
          ]}
        />
        <select className="field w-auto py-1.5 text-[13px]" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="all">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <input
          className="field w-auto min-w-[200px] flex-1 py-1.5 text-[13px]"
          placeholder="Search id, title or location…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Seg
          value={view}
          onChange={(v) => setView(v as View)}
          options={[
            ['table', 'Table'],
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
            band: i.priority.band,
            reports: i.reports.length,
          }))}
        />
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr className="border-b border-line bg-sunken text-left">
                  <Th>Incident</Th>
                  <Th>Priority</Th>
                  <Th>Category</Th>
                  <Th>Department</Th>
                  <Th className="text-right">Evidence</Th>
                  <Th>Status</Th>
                  <Th>Response target</Th>
                  <Th className="text-right">Age</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => {
                  const sla = untilText(i.slaDueAt);
                  // The response clock stops once the crew reports completion;
                  // from there the verification stage owns the incident.
                  const clockStopped =
                    i.status === 'verified_closed' || i.status === 'resolved_pending_verification';
                  return (
                    <tr key={i.id} className="border-b border-line last:border-0 hover:bg-sunken">
                      <td className="px-3 py-2.5 align-top">
                        <Link href={`/incidents/${i.id}`} className="block max-w-[320px]">
                          <span className="mono block text-faint">{i.id}</span>
                          <span className="mt-0.5 block font-medium text-ink hover:text-accent">{i.title}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <PriorityChip band={i.priority.band} withLabel={false} />
                        <span className="tnum mt-1 block text-[11.5px] text-faint">{i.priority.score}/100</span>
                      </td>
                      <td className="px-3 py-2.5 align-top text-muted">{CATEGORY_LABELS[i.category]}</td>
                      <td className="px-3 py-2.5 align-top text-muted">{i.department.name}</td>
                      <td className="tnum px-3 py-2.5 text-right align-top text-ink-2">
                        {i.reports.length}
                        {i.reports.length > 1 && <span className="ml-1 text-[11px] text-faint">merged</span>}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <StatusChip status={i.status} />
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        {clockStopped ? (
                          <span className="text-faint">—</span>
                        ) : (
                          <span className={sla.overdue ? 'font-medium text-p1' : 'text-muted'}>{sla.text}</span>
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
                      No incidents match these filters.
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
  return <th className={`label px-3 py-2 font-semibold ${className}`}>{children}</th>;
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
    <div className="flex overflow-hidden rounded-sm border border-line-strong">
      {options.map(([v, label], idx) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-2.5 py-1.5 text-[12.5px] font-medium transition-colors ${
            idx > 0 ? 'border-l border-line-strong' : ''
          } ${value === v ? 'bg-accent text-white' : 'bg-panel text-ink-2 hover:bg-sunken'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
