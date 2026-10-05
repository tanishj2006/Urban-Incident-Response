import Link from 'next/link';
import { listIncidents } from '@/lib/store';
import { CATEGORY_LABELS } from '@/lib/taxonomy';
import PipelineDiagram from '@/components/PipelineDiagram';
import { Metric, Panel, PriorityChip, StatusChip, timeAgo } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const incidents = await listIncidents();

  const open = incidents.filter((i) => i.status !== 'verified_closed');
  const p1 = open.filter((i) => i.priority.band === 'P1');
  const breached = open.filter((i) => i.slaBreached);
  const closed = incidents.filter((i) => i.status === 'verified_closed');
  const totalReports = incidents.reduce((n, i) => n + i.reports.length, 0);
  const collapsed = totalReports - incidents.length;
  const rejected = incidents.filter((i) => i.verification && i.verification.verdict !== 'resolved');

  const byBand = (['P1', 'P2', 'P3', 'P4'] as const).map((b) => ({
    band: b,
    count: open.filter((i) => i.priority.band === b).length,
  }));
  const maxBand = Math.max(1, ...byBand.map((b) => b.count));

  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">Urban Incident Response</h1>
        <p className="mt-1.5 max-w-[68ch] text-[14.5px] text-muted">
          An intelligent coordination layer that turns fragmented citizen reports — photographs, written
          descriptions, voice notes and location — into structured, prioritised incidents routed to the
          department that owns them.
        </p>
      </header>

      <section>
        <div className="label mb-2.5">Closed-loop pipeline</div>
        <PipelineDiagram />
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric value={open.length} label="Open incidents" />
        <Metric value={p1.length} label="P1 critical" tone={p1.length ? 'text-p1' : undefined} />
        <Metric
          value={breached.length}
          label="Past response target"
          tone={breached.length ? 'text-p2' : undefined}
        />
        <Metric value={collapsed} label="Duplicate reports collapsed" />
        <Metric value={closed.length} label="Verified & closed" tone="text-ok" />
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        <Panel title="Active queue" dense>
          <ul>
            {open.slice(0, 7).map((inc) => (
              <li key={inc.id} className="border-b border-line last:border-0">
                <Link href={`/incidents/${inc.id}`} className="block px-4 py-3 hover:bg-sunken">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="mono text-faint">{inc.id}</span>
                        <PriorityChip band={inc.priority.band} withLabel={false} />
                        {inc.reports.length > 1 && (
                          <span className="chip bg-sunken text-muted">{inc.reports.length} reports</span>
                        )}
                      </div>
                      <div className="mt-1 truncate text-[14px] font-medium text-ink">{inc.title}</div>
                      <div className="mt-0.5 truncate text-[12.5px] text-muted">
                        {CATEGORY_LABELS[inc.category]} · {inc.department.name}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <StatusChip status={inc.status} />
                      <div className="mt-1.5 text-[11.5px] text-faint">{timeAgo(inc.createdAt)}</div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="border-t border-line px-4 py-2.5">
            <Link href="/dashboard" className="text-[13px] font-medium text-accent hover:underline">
              Open the operations console →
            </Link>
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel title="Open by priority">
            <div className="space-y-2.5">
              {byBand.map((b) => (
                <div key={b.band} className="flex items-center gap-3">
                  <span className="w-7 shrink-0">
                    <PriorityChip band={b.band} withLabel={false} />
                  </span>
                  <div className="h-2 flex-1 rounded-xs bg-sunken">
                    <div
                      className={`h-2 rounded-xs ${
                        b.band === 'P1'
                          ? 'bg-p1'
                          : b.band === 'P2'
                            ? 'bg-p2'
                            : b.band === 'P3'
                              ? 'bg-p3'
                              : 'bg-p4'
                      }`}
                      style={{ width: `${(b.count / maxBand) * 100}%` }}
                    />
                  </div>
                  <span className="tnum w-5 text-right text-[13px] text-ink-2">{b.count}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Verification loop">
            <dl className="space-y-2 text-[13.5px]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Closures submitted</dt>
                <dd className="tnum text-ink-2">{incidents.filter((i) => i.verification).length}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Rejected or partial</dt>
                <dd className="tnum text-p1">{rejected.length}</dd>
              </div>
            </dl>
            <p className="mt-3 border-t border-line pt-3 text-[12.5px] leading-snug text-muted">
              A crew marking work done is a claim. The verification stage re-reads the after-photograph
              against the original complaint, and an unresolved verdict reopens the incident instead of
              closing it.
            </p>
          </Panel>
        </div>
      </div>

      <Panel title="Scope — what is real and what is not">
        <div className="grid gap-x-8 gap-y-2.5 text-[13.5px] sm:grid-cols-2">
          <div>
            <div className="mb-1.5 font-medium text-ok">Implemented end to end</div>
            <ul className="space-y-1 text-muted">
              <li>Multimodal extraction from image, text, voice transcript and GPS</li>
              <li>Reverse geocoding (OpenStreetMap) and live weather (Open-Meteo)</li>
              <li>Duplicate collapse: geo-temporal gate, then model adjudication</li>
              <li>Transparent priority scoring with a visible breakdown</li>
              <li>Department routing, dispatch packet, SLA and escalation rules</li>
              <li>Resolution verification from after-evidence, with reopening</li>
            </ul>
          </div>
          <div>
            <div className="mb-1.5 font-medium text-p2">Simulated or out of scope</div>
            <ul className="space-y-1 text-muted">
              <li>
                <strong className="font-medium text-ink-2">Traffic data</strong> — no free real-time feed
                exists for this region; a clearly-flagged simulated provider sits behind the same interface
              </li>
              <li>
                <strong className="font-medium text-ink-2">Authority notification</strong> — no municipality
                exposes an ingestion API, so dispatch packets are generated in full and queued to an in-app
                outbox rather than transmitted
              </li>
              <li>
                <strong className="font-medium text-ink-2">Video ingestion</strong> — not implemented; the
                design extends to it but it was descoped
              </li>
            </ul>
          </div>
        </div>
      </Panel>
    </div>
  );
}
