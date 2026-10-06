import Link from 'next/link';
import { listIncidents } from '@/lib/store';
import { effectivePriority } from '@/lib/types';
import { CATEGORY_LABELS, SLA_MINUTES } from '@/lib/taxonomy';
import PipelineDiagram from '@/components/PipelineDiagram';
import { Metric, Panel, PriorityChip, StatusChip, timeAgo } from '@/components/ui';

export const dynamic = 'force-dynamic';

const BAND_BAR = { P1: 'bg-p1', P2: 'bg-p2', P3: 'bg-[#e8a90c]', P4: 'bg-p4' } as const;

function within(mins: number): string {
  if (mins < 60) return `${mins} minutes`;
  if (mins < 1440) return `${mins / 60} hours`;
  return `${mins / 1440} day${mins / 1440 > 1 ? 's' : ''}`;
}

export default async function OverviewPage() {
  const incidents = await listIncidents();

  const open = incidents.filter((i) => i.status !== 'closed');
  const p1 = open.filter((i) => effectivePriority(i).band === 'P1');
  const breached = open.filter((i) => i.slaBreached);
  const closed = incidents.filter((i) => i.status === 'closed');
  const totalReports = incidents.reduce((n, i) => n + i.reports.length, 0);
  const collapsed = totalReports - incidents.length;
  const rejected = incidents.filter((i) => i.verification && i.verification.verdict !== 'resolved');
  const awaitingConfirmation = incidents.filter((i) => i.status === 'resolved');
  const triage = incidents.filter((i) => i.needsManualCategorisation);

  const byBand = (['P1', 'P2', 'P3', 'P4'] as const).map((b) => ({
    band: b,
    count: open.filter((i) => effectivePriority(i).band === b).length,
  }));
  const maxBand = Math.max(1, ...byBand.map((b) => b.count));

  return (
    <div className="space-y-8">
      <header className="panel overflow-hidden">
        <div className="bg-gradient-to-r from-accent-soft via-violet-soft/60 to-panel px-6 py-7 lg:px-8">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight text-ink">
            Every report, handled and checked.
          </h1>
          <p className="mt-2 max-w-[62ch] text-[16px] leading-relaxed text-ink-2">
            People report problems in the city with a photo, a few words, a voice note or a location. This
            system reads each report, works out how urgent it is, sends it to the right department, and makes
            sure a person confirms the fix.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Link href="/report" className="btn btn-primary">
              Report an issue
            </Link>
            <Link href="/dashboard" className="btn">
              See all incidents
            </Link>
          </div>
        </div>
      </header>

      <section>
        <h2 className="mb-3 text-[17px] font-semibold tracking-tight">How a report is handled</h2>
        <PipelineDiagram />
      </section>

      <section>
        <h2 className="mb-3 text-[17px] font-semibold tracking-tight">Right now</h2>
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
          <Metric value={open.length} label="Open incidents" note="Still being handled" icon="inbox" tone="blue" alert={false} />
          <Metric
            value={p1.length}
            label="Urgent"
            note={`Need a response within ${within(SLA_MINUTES.P1)}`}
            icon="alert"
            tone="red"
            alert={p1.length > 0}
          />
          <Metric
            value={breached.length}
            label="Running late"
            note="Past their response time"
            icon="clock"
            tone="orange"
            alert={breached.length > 0}
          />
          <Metric
            value={collapsed}
            label="Repeat reports"
            note="Linked to an existing case"
            icon="link"
            tone="violet"
            alert={false}
          />
          <Metric
            value={closed.length}
            label="Closed"
            note="Confirmed by a named official"
            icon="check"
            tone="green"
            alert={closed.length > 0}
          />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        <Panel
          title="Incidents to look at"
          hint="Most urgent first. Select one to see the full case."
          dense
        >
          <ul>
            {open.slice(0, 7).map((inc) => (
              <li key={inc.id} className="border-b border-line last:border-0">
                <Link href={`/incidents/${inc.id}`} className="block px-5 py-3.5 transition-colors hover:bg-accent-soft/50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <PriorityChip band={effectivePriority(inc).band} withLabel={false} />
                        <span className="mono text-faint">{inc.id}</span>
                        {inc.reports.length > 1 && (
                          <span className="chip bg-violet-soft text-violet">{inc.reports.length} reports</span>
                        )}
                        {inc.needsManualCategorisation && (
                          <span className="chip bg-p2-soft text-p2">Needs a category</span>
                        )}
                      </div>
                      <div className="mt-1.5 truncate text-[15.5px] font-semibold text-ink">{inc.title}</div>
                      <div className="mt-0.5 truncate text-[13.5px] text-muted">
                        {CATEGORY_LABELS[inc.category]} · {inc.department.name}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <StatusChip status={inc.status} />
                      <div className="mt-1.5 text-[12.5px] text-faint">{timeAgo(inc.createdAt)}</div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
            {open.length === 0 && (
              <li className="px-5 py-8 text-center text-[14px] text-faint">
                Nothing open. New reports will appear here.
              </li>
            )}
          </ul>
          <div className="border-t border-line px-5 py-3">
            <Link href="/dashboard" className="text-[14px] font-semibold text-accent hover:underline">
              See all incidents →
            </Link>
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel title="How urgent are they?" hint="Open incidents grouped by urgency, with the target response time.">
            <div className="space-y-3.5">
              {byBand.map((b) => (
                <div key={b.band}>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <PriorityChip band={b.band} withLabel={false} />
                    <span className="text-[12.5px] text-muted">respond within {within(SLA_MINUTES[b.band])}</span>
                    <span className="tnum w-5 text-right text-[14.5px] font-bold text-ink">{b.count}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-sunken">
                    <div
                      className={`h-2.5 rounded-full ${BAND_BAR[b.band]}`}
                      style={{ width: `${(b.count / maxBand) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Where a person decides" hint="The system suggests. People confirm.">
            <dl className="space-y-2.5 text-[14.5px]">
              <Row label="Waiting for someone to pick a category" n={triage.length} tone="text-p2" />
              <Row label="Fixed, waiting for closure sign-off" n={awaitingConfirmation.length} tone="text-teal" />
              <Row label="Fix not accepted, sent back" n={rejected.length} tone="text-p1" />
              <Row
                label="Urgency changed by an official"
                n={incidents.filter((i) => i.priorityOverride).length}
                tone="text-violet"
              />
            </dl>
            <p className="mt-4 rounded-sm bg-ok-soft px-3.5 py-3 text-[13.5px] leading-snug text-ink-2">
              An incident only becomes <strong className="font-semibold text-ok">Closed</strong> when a named
              official confirms it. The AI can recommend, never close.
            </p>
          </Panel>
        </div>
      </div>

      <Panel title="What is real, and what is simulated" hint="So nothing in this demo is mistaken for something it is not.">
        <div className="grid gap-x-8 gap-y-4 text-[14.5px] sm:grid-cols-2">
          <div className="rounded-sm bg-ok-soft/60 p-4">
            <div className="mb-2 font-semibold text-ok">Working end to end</div>
            <ul className="space-y-1.5 text-ink-2">
              <li>Reads photos, text, voice transcripts and GPS location together</li>
              <li>Finds the street address (OpenStreetMap) and live weather (Open-Meteo)</li>
              <li>Spots repeat reports of the same problem and links them</li>
              <li>Scores urgency with a visible, fixed formula</li>
              <li>Picks the department and writes the dispatch details</li>
              <li>Checks the fix from an after-photo, and reopens if it fails</li>
            </ul>
          </div>
          <div className="rounded-sm bg-p2-soft/70 p-4">
            <div className="mb-2 font-semibold text-p2">Simulated or not included</div>
            <ul className="space-y-1.5 text-ink-2">
              <li>
                <strong className="font-semibold">Traffic data</strong>: no free live feed exists for this
                region, so a clearly labelled simulated source is used
              </li>
              <li>
                <strong className="font-semibold">Alerting authorities</strong>: no municipality offers an
                intake API, so dispatch messages are prepared and queued in the app, not sent
              </li>
              <li>
                <strong className="font-semibold">Video</strong>: planned for later, not built
              </li>
            </ul>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function Row({ label, n, tone }: { label: string; n: number; tone: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-2">{label}</dt>
      <dd className={`tnum min-w-7 rounded-full bg-sunken px-2.5 py-0.5 text-center font-bold ${n ? tone : 'text-faint'}`}>
        {n}
      </dd>
    </div>
  );
}
