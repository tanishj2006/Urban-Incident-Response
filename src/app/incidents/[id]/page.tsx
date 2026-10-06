/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getIncident } from '@/lib/store';
import { CATEGORY_LABELS, CHANNEL_LABELS, SLA_MINUTES, STATUS_MEANINGS } from '@/lib/taxonomy';
import { effectivePriority } from '@/lib/types';
import PipelineDiagram from '@/components/PipelineDiagram';
import {
  CaseActions,
  ClosureConfirm,
  SeparateButton,
  VerificationForm,
} from '@/components/IncidentActions';
import {
  EngineChip,
  Empty,
  KeyValue,
  Panel,
  PriorityChip,
  StatusChip,
  timeAgo,
  untilText,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inc = await getIncident(id);
  if (!inc) notFound();

  const sla = untilText(inc.slaDueAt);
  const pr = effectivePriority(inc);
  const closed = inc.status === 'closed';
  // The response clock stops once the crew reports completion; from there the
  // verification stage owns the incident, with its own escalation path.
  const clockStopped = closed || inc.status === 'resolved';
  const activeStage = closed
    ? 'Verify'
    : inc.escalations.length > 0
      ? 'Escalate'
      : inc.status === 'resolved'
        ? 'Verify'
        : inc.status === 'in_progress'
          ? 'Respond'
          : 'Notify';

  return (
    <div className="space-y-5">
      <Link href="/dashboard" className="inline-flex text-[14px] font-semibold text-accent hover:underline">
        ← All incidents
      </Link>

      <header className="panel p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mono text-faint">{inc.id}</span>
          <PriorityChip band={pr.band} />
          {inc.priorityOverride && (
            <span className="chip bg-accent-soft text-accent">
              Urgency changed by {inc.priorityOverride.by} (AI suggested {inc.recommendedPriority.band})
            </span>
          )}
          <StatusChip status={inc.status} />
          {inc.needsManualCategorisation && (
            <span className="chip bg-p2-soft text-p2">Needs a category</span>
          )}
          {inc.reports.length > 1 && (
            <span className="chip bg-violet-soft text-violet">{inc.reports.length} reports linked</span>
          )}
          {inc.slaBreached && !clockStopped && (
            <span className="chip bg-p1-soft text-p1">Running late</span>
          )}
        </div>

        <h1 className="mt-3 text-[26px] leading-tight font-bold tracking-tight">{inc.title}</h1>
        <p className="mt-2 max-w-[78ch] text-[15.5px] leading-relaxed text-ink-2">{inc.fusedSummary}</p>

        <div className="mt-5 grid gap-x-8 gap-y-0 rounded-sm bg-sunken px-4 py-3 text-[14.5px] sm:grid-cols-2">
          <dl>
            <KeyValue
              k="Type"
              v={
                <>
                  {CATEGORY_LABELS[inc.category]}
                  {inc.categoryOverride && (
                    <span className="mt-0.5 block text-[11.5px] text-faint">
                      Type changed by {inc.categoryOverride.by} from{' '}
                      {CATEGORY_LABELS[inc.categoryOverride.from]}
                    </span>
                  )}
                </>
              }
            />
            <KeyValue k="Detail" v={inc.subtype} />
            <KeyValue k="Location" v={inc.location.address ?? 'Address not found'} />
            <KeyValue
              k="Map position"
              v={<span className="mono">{inc.location.lat.toFixed(5)}, {inc.location.lng.toFixed(5)}</span>}
            />
          </dl>
          <dl>
            <KeyValue k="Department" v={inc.department.name} />
            <KeyValue k="Assigned to" v={inc.assignee ?? <span className="text-faint">Unassigned</span>} />
            <KeyValue k="Opened" v={`${timeAgo(inc.createdAt)} · ${new Date(inc.createdAt).toLocaleString('en-IN')}`} />
            <KeyValue k="This stage means" v={<span className="text-[12.5px]">{STATUS_MEANINGS[inc.status]}</span>} />
            <KeyValue
              k="Time to respond"
              v={
                closed ? (
                  <span className="text-ok">Closed by {inc.closure?.by ?? 'an official'}</span>
                ) : clockStopped ? (
                  <span className="text-muted">Fix reported. Waiting for an official to confirm.</span>
                ) : (
                  <span className={sla.overdue ? 'font-medium text-p1' : ''}>
                    {sla.text} (target {SLA_MINUTES[pr.band]} min)
                  </span>
                )
              }
            />
          </dl>
        </div>
      </header>

      <PipelineDiagram active={activeStage} />

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* ─────────────────────────── Left column ─────────────────────────── */}
        <div className="space-y-5">
          <Panel title="What to do now" hint="Suggested steps for the crew, based on the type of incident.">
            {inc.recommendedActions.length === 0 ? (
              <Empty>No suggested steps for this incident.</Empty>
            ) : (
              <ol className="space-y-2">
                {inc.recommendedActions.map((a, i) => (
                  <li key={i} className="flex gap-2.5 text-[13.5px]">
                    <span className="mono mt-0.5 shrink-0 text-faint">{i + 1}</span>
                    <span className="text-ink-2">{a}</span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel
            title={`What was reported (${inc.reports.length} report${inc.reports.length > 1 ? 's' : ''})`}
            hint="The original photos and words from citizens, with what the AI understood from each."
            dense
          >
            <ul>
              {inc.reports.map((r, i) => {
                const ex = inc.extractions.find((e) => e.reportId === r.id);
                return (
                  <li key={r.id} className="border-b border-line p-4 last:border-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="mono text-faint">{r.id}</span>
                      <span className="chip bg-sunken text-muted">{CHANNEL_LABELS[r.channel] ?? r.channel}</span>
                      {r.modalities.map((m) => (
                        <span key={m} className="chip bg-accent-soft text-accent">
                          {m}
                        </span>
                      ))}
                      <span className="ml-auto text-[11.5px] text-faint">{timeAgo(r.receivedAt)}</span>
                      {inc.reports.length > 1 && (
                        <SeparateButton incidentId={inc.id} reportId={r.id} />
                      )}
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-[150px_1fr]">
                      {r.imagePath ? (
                        <img
                          src={r.imagePath}
                          alt={`Evidence from report ${r.id}`}
                          className="h-[104px] w-full rounded-sm border border-line object-cover"
                        />
                      ) : (
                        <div className="flex h-[104px] items-center justify-center rounded-sm border border-dashed border-line text-[11.5px] text-faint">
                          No photo
                        </div>
                      )}

                      <div className="min-w-0 space-y-2">
                        {r.text && <p className="text-[13.5px] text-ink-2">“{r.text}”</p>}
                        {r.voiceTranscript && (
                          <p className="text-[13px] text-muted">
                            <span className="mr-1.5 font-semibold text-ink-2">Voice:</span>“{r.voiceTranscript}”
                          </p>
                        )}
                        {r.reporterName && (
                          <p className="text-[12px] text-faint">
                            Reported by {r.reporterName} · {r.reporterPhoneMasked}
                          </p>
                        )}
                      </div>
                    </div>

                    {ex && (
                      <div className="mt-3 rounded-sm bg-sunken p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-semibold text-ink-2">What the AI understood</span>
                          <EngineChip engine={ex.engine} />
                          <span className="chip bg-panel text-muted">
                            AI confidence {Math.round(ex.confidence * 100)}%
                          </span>
                          <span className="chip bg-panel text-muted">severity: {ex.severityBand}</span>
                          {ex.needsHumanReview && (
                            <span className="chip bg-p2-soft text-p2">Please check this one</span>
                          )}
                          <span className="tnum ml-auto text-[11px] text-faint">{ex.modelLatencyMs} ms</span>
                        </div>
                        <p className="mt-2 text-[13px] text-ink-2">{ex.summary}</p>
                        <p className="mt-1.5 text-[12.5px] leading-snug text-muted">{ex.rationale}</p>
                        {ex.observedObjects.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {ex.observedObjects.map((o, k) => (
                              <span key={k} className="chip bg-panel text-muted">
                                {o}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {i === 0 && inc.reports.length > 1 && (
                      <p className="mt-2 text-[12px] text-faint">This was the first report.</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>

          {inc.linkLog.length > 0 && (
            <Panel title="Repeat reports" hint="Reports judged to be about the same problem, and why." dense>
              <ul>
                {inc.linkLog.map((m, i) => (
                  <li key={i} className="border-b border-line px-4 py-3 last:border-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="mono text-faint">{m.reportId}</span>
                      {m.action === 'linked' ? (
                        <span className="chip bg-violet-soft text-violet">
                          Linked{m.confidence !== undefined ? ` (${Math.round(m.confidence * 100)}% sure)` : ''}
                        </span>
                      ) : (
                        <span className="chip bg-p2-soft text-p2">Separated</span>
                      )}
                      {m.engine && <EngineChip engine={m.engine} />}
                      {m.by && <span className="chip bg-sunken text-muted">by {m.by}</span>}
                      <span className="ml-auto text-[11.5px] text-faint">{timeAgo(m.at)}</span>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-snug text-muted">{m.reason}</p>
                  </li>
                ))}
              </ul>
              <p className="border-t border-line px-4 py-2.5 text-[11.5px] leading-snug text-faint">
                Matching reports is a judgement call and can be wrong either way. Every report stays visible
                above, and you can separate one back out.
              </p>
            </Panel>
          )}

          <Panel title="What has happened so far" dense>
            <ol>
              {[...inc.timeline].reverse().map((t, i) => (
                <li key={i} className="flex gap-3 border-b border-line px-4 py-2.5 last:border-0">
                  <span className="w-[76px] shrink-0 pt-0.5 text-[11.5px] text-faint">{timeAgo(t.at)}</span>
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium text-ink">{t.event}</div>
                    {t.detail && <div className="text-[12.5px] text-muted">{t.detail}</div>}
                    <div className="mt-0.5 text-[11.5px] text-faint">{t.actor}</div>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        {/* ────────────────────────── Right column ─────────────────────────── */}
        <div className="space-y-5">
          <Panel title="Take action" hint="Only an official can move an incident forward.">
            <CaseActions incident={inc} />
          </Panel>

          <Panel title="Close this incident">
            <ClosureConfirm incident={inc} />
          </Panel>

          <Panel title="Why this urgency?" hint={`The system scored this ${inc.recommendedPriority.score} out of 100.`}>
            {inc.priorityOverride && (
              <p className="mb-3 rounded-sm bg-accent-soft px-2.5 py-2 text-[12.5px] leading-snug text-accent-ink">
                {inc.priorityOverride.by} changed this to <strong>{inc.priorityOverride.band}</strong>. The AI
                suggested {inc.recommendedPriority.band}.
                {inc.priorityOverride.reason && ` Reason: ${inc.priorityOverride.reason}`}
              </p>
            )}
            <table className="w-full text-[13px]">
              <tbody>
                {inc.recommendedPriority.factors.map((f, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="py-1.5 pr-2 align-top text-ink-2">
                      {f.label}
                      {f.detail && <div className="text-[11.5px] leading-snug text-faint">{f.detail}</div>}
                    </td>
                    <td className="tnum w-12 py-1.5 text-right align-top font-medium text-ink">+{f.points}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line-strong">
                  <td className="pt-2 text-[13.5px] font-semibold text-ink">
                    Total: suggested {inc.recommendedPriority.band}
                  </td>
                  <td className="tnum pt-2 text-right text-[13.5px] font-semibold text-ink">
                    {inc.recommendedPriority.score}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="mt-3 border-t border-line pt-2.5 text-[11.5px] leading-snug text-muted">
              The score comes from a fixed formula, not from the AI. The AI only reports how severe it looks and
              which hazards are present; the points above are simple arithmetic. P1 starts at 75, P2 at 60,
              P3 at 40. An official can change it, and both values stay on record.
            </p>
          </Panel>

          <Panel title="Who handles it">
            <dl>
              <KeyValue k="Department" v={inc.department.name} />
              <KeyValue k="Dept. code" v={<span className="mono">{inc.department.code}</span>} />
              <KeyValue k="Control line" v={<span className="mono">{inc.department.contactPhone}</span>} />
              <KeyValue k="Email" v={<span className="mono">{inc.department.contactEmail}</span>} />
              {inc.department.secondary.length > 0 && (
                <KeyValue k="Also notified" v={inc.department.secondary.join(', ')} />
              )}
            </dl>
            <p className="mt-2 border-t border-line pt-2.5 text-[12px] leading-snug text-muted">
              {inc.department.reason}
            </p>
          </Panel>

          <Panel title="Conditions at the scene">
            <dl>
              {inc.context.weather ? (
                <>
                  <KeyValue
                    k="Weather"
                    v={`${inc.context.weather.description}, ${inc.context.weather.tempC}°C`}
                  />
                  <KeyValue k="Precipitation" v={`${inc.context.weather.precipitationMm} mm`} />
                  <KeyValue k="Wind" v={`${inc.context.weather.windKph} km/h`} />
                </>
              ) : (
                <KeyValue k="Weather" v={<span className="text-faint">Unavailable</span>} />
              )}
              <KeyValue k="Time of day" v={inc.context.timeOfDay.replace('_', ' ')} />
              {inc.context.traffic && (
                <KeyValue
                  k="Traffic"
                  v={
                    <span>
                      {inc.context.traffic.congestionLevel} — {inc.context.traffic.note}
                      <span className="mt-1 block text-[11.5px] text-p2">
                        Simulated. No live traffic feed is connected.
                      </span>
                    </span>
                  }
                />
              )}
            </dl>
            <p className="mt-2 border-t border-line pt-2 text-[11.5px] text-faint">
              Weather via {inc.context.weather?.source ?? 'n/a'}.
            </p>
          </Panel>

          {inc.dispatch && (
            <Panel title="Message to the department" hint="Prepared for the team that will respond.">
              <div className="mono mb-2 text-faint">{inc.dispatch.payloadId}</div>
              <div className="rounded-sm bg-sunken p-3 text-[12.5px] leading-relaxed">
                <div className="font-medium text-ink">{inc.dispatch.subject}</div>
                <div className="mt-1.5 text-muted">To: {inc.dispatch.department}</div>
                <div className="text-muted">Location: {inc.dispatch.locationLine}</div>
                <div className="text-muted">Evidence: {inc.dispatch.evidenceCount} report(s)</div>
                <p className="mt-2 text-ink-2">{inc.dispatch.body}</p>
              </div>
              <p className="mt-2.5 text-[11.5px] leading-snug text-p2">{inc.dispatch.deliveryNote}</p>
            </Panel>
          )}

          <Panel title="Was it fixed?" hint="The AI compares an after-photo with the original. It advises; a person decides.">
            {inc.verification ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`chip ${
                      inc.verification.verdict === 'resolved'
                        ? 'bg-ok-soft text-ok'
                        : inc.verification.verdict === 'partial'
                          ? 'bg-p2-soft text-p2'
                          : 'bg-p1-soft text-p1'
                    }`}
                  >
                    {inc.verification.verdict}
                  </span>
                  <span className="chip bg-sunken text-muted">
                    AI confidence {Math.round(inc.verification.confidence * 100)}%
                  </span>
                  <EngineChip engine={inc.verification.engine} />
                </div>
                {inc.verification.afterImagePath && (
                  <img
                    src={inc.verification.afterImagePath}
                    alt="After-evidence"
                    className="max-h-[160px] w-full rounded-sm border border-line object-cover"
                  />
                )}
                <p className="text-[13px] leading-snug text-ink-2">{inc.verification.rationale}</p>
                <p className="border-t border-line pt-2.5 text-[11.5px] leading-snug text-muted">
                  This is advice for the reviewing official. It cannot close the incident by itself.
                </p>
                {!closed && (
                  <div className="border-t border-line pt-3">
                    <div className="mb-2 text-[14px] font-semibold text-ink-2">Send a new after-photo</div>
                    <VerificationForm id={inc.id} />
                  </div>
                )}
              </div>
            ) : (
              <VerificationForm id={inc.id} />
            )}
          </Panel>

          {inc.escalations.length > 0 && (
            <Panel title="Escalated to" hint="Raised to senior staff because the incident ran late." dense>
              <ul>
                {inc.escalations.map((e, i) => (
                  <li key={i} className="border-b border-line px-4 py-3 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="chip bg-p1-soft text-p1">Level {e.level}</span>
                      <span className="ml-auto text-[11.5px] text-faint">{timeAgo(e.at)}</span>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-snug text-ink-2">{e.reason}</p>
                    <p className="mt-1 text-[12px] text-muted">Notified: {e.notified}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
