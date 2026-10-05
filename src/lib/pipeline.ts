import { runPrompt } from './ai';
import { mockDedupe, mockExtract, mockFuse, mockVerify } from './mock';
import { DEDUPE_PROMPT, EXTRACTION_PROMPT, FUSION_PROMPT, VERIFICATION_PROMPT } from './prompts';
import { buildContext, describeContext, distanceMetres, reverseGeocode } from './context';
import { CATEGORY_LABELS, DEDUPE_GATES, PRIORITY_LABELS, SLA_MINUTES, routeToDepartment } from './taxonomy';
import type {
  Database,
  DispatchPayload,
  Engine,
  Escalation,
  Extraction,
  HazardFlags,
  Incident,
  IncidentCategory,
  PriorityBand,
  PriorityResult,
  RawReport,
  ScoreFactor,
  SeverityBand,
  VerificationResult,
} from './types';
import { EMPTY_HAZARDS } from './types';
import { nextIncidentId } from './ids';

/**
 * The closed loop:
 *   Detect → Understand → Combine → Prioritise → Identify Dept → Notify
 *          → Respond → Verify Resolution → Escalate if required
 *
 * Each stage below is a separate exported function so it can be pointed at
 * individually, and every run emits a TraceStep that the UI replays.
 */

export interface TraceStep {
  stage: string;
  label: string;
  status: 'ok' | 'skipped' | 'fallback';
  detail: string;
  ms: number;
  engine?: Engine;
}

const SEVERITY_POINTS: Record<SeverityBand, number> = {
  critical: 55,
  high: 40,
  medium: 25,
  low: 12,
};

const HAZARD_POINTS: { key: keyof HazardFlags; points: number; label: string }[] = [
  { key: 'injuriesLikely', points: 18, label: 'Injuries likely' },
  { key: 'fireOrSmoke', points: 14, label: 'Fire or smoke present' },
  { key: 'structuralRisk', points: 14, label: 'Structural risk' },
  { key: 'electricalRisk', points: 10, label: 'Electrical risk' },
  { key: 'blockingTraffic', points: 8, label: 'Blocking traffic' },
  { key: 'waterLogging', points: 6, label: 'Water-logging' },
];

const SCALE_POINTS = { wide_area: 12, neighbourhood: 8, street: 4, individual: 0 } as const;
const SEVERITY_RANK: SeverityBand[] = ['low', 'medium', 'high', 'critical'];

// ─────────────────────────────── Stage 2: Understand ───────────────────────────

export async function understand(report: RawReport): Promise<{ extraction: Extraction; step: TraceStep }> {
  const call = await runPrompt(
    EXTRACTION_PROMPT,
    {
      channel: report.channel,
      receivedAt: report.receivedAt,
      location: `${report.location.lat.toFixed(5)}, ${report.location.lng.toFixed(5)}`,
      address: report.location.address ?? '',
      text: report.text ?? '',
      transcript: report.voiceTranscript ?? '',
      hasImage: report.imagePath ? 'yes' : 'no',
    },
    () =>
      mockExtract({
        text: report.text,
        transcript: report.voiceTranscript,
        hasImage: Boolean(report.imagePath),
        address: report.location.address,
      }),
    report.imagePath,
  );

  const extraction: Extraction = {
    reportId: report.id,
    ...call.data,
    hazards: { ...EMPTY_HAZARDS, ...call.data.hazards },
    engine: call.engine,
    modelLatencyMs: call.latencyMs,
  };

  return {
    extraction,
    step: {
      stage: 'Understand',
      label: 'Multimodal extraction',
      status: call.error ? 'fallback' : 'ok',
      detail: call.error
        ? `Live model unavailable (${call.error.slice(0, 90)}) — rule engine used.`
        : `Classified as ${CATEGORY_LABELS[extraction.category]}, severity ${extraction.severityBand}, confidence ${extraction.confidence}.`,
      ms: call.latencyMs,
      engine: call.engine,
    },
  };
}

// ──────────────────────────────── Stage 3: Combine ─────────────────────────────

/** Cheap gate: only incidents that are plausibly the same event reach the model. */
export function dedupeCandidates(
  db: Database,
  report: RawReport,
  category: IncidentCategory,
): Incident[] {
  const gate = DEDUPE_GATES[category];
  const now = new Date(report.receivedAt).getTime();
  return db.incidents.filter((inc) => {
    if (inc.status === 'verified_closed') return false;
    if (inc.category !== category) return false;
    const d = distanceMetres(inc.location, report.location);
    if (d > gate.radiusM) return false;
    const elapsed = Math.abs(now - new Date(inc.createdAt).getTime()) / 60000;
    return elapsed <= gate.windowMinutes;
  });
}

export async function adjudicateDuplicate(
  incident: Incident,
  report: RawReport,
  extraction: Extraction,
): Promise<{ sameIncident: boolean; confidence: number; reason: string; engine: Engine; ms: number }> {
  const gate = DEDUPE_GATES[extraction.category];
  const distanceM = distanceMetres(incident.location, report.location);
  const elapsedMinutes =
    Math.abs(new Date(report.receivedAt).getTime() - new Date(incident.createdAt).getTime()) / 60000;

  const call = await runPrompt(
    DEDUPE_PROMPT,
    {
      existingCategory: CATEGORY_LABELS[incident.category],
      existingSummary: incident.fusedSummary,
      existingTime: incident.createdAt,
      existingEvidence: `${incident.reports.length} report(s), ${incident.reports.filter((r) => r.imagePath).length} with photographs`,
      newCategory: CATEGORY_LABELS[extraction.category],
      newSummary: extraction.summary,
      newTime: report.receivedAt,
      distance: String(Math.round(distanceM)),
      elapsed: `${Math.round(elapsedMinutes)} minutes`,
    },
    () =>
      mockDedupe({
        distanceM,
        elapsedMinutes,
        sameCategory: incident.category === extraction.category,
        radiusM: gate.radiusM,
        windowMinutes: gate.windowMinutes,
      }),
  );

  return { ...call.data, engine: call.engine, ms: call.latencyMs };
}

// ─────────────────────────────── Stage 4: Prioritise ───────────────────────────

/**
 * Deterministic, explainable scoring. The model supplies bands and flags;
 * the arithmetic happens here so every score can be defended line by line.
 */
export function computePriority(
  extractions: Extraction[],
  reportCount: number,
  contextNote: { rain: boolean; heavyTraffic: boolean },
  openedAt: string,
): PriorityResult {
  const factors: ScoreFactor[] = [];

  // Worst case across all corroborating reports, not the average.
  const worstSeverity = extractions.reduce<SeverityBand>((worst, e) => {
    return SEVERITY_RANK.indexOf(e.severityBand) > SEVERITY_RANK.indexOf(worst) ? e.severityBand : worst;
  }, 'low');
  factors.push({
    label: `Severity band: ${worstSeverity}`,
    points: SEVERITY_POINTS[worstSeverity],
    detail: 'Highest band reported across all corroborating reports.',
  });

  const merged: HazardFlags = { ...EMPTY_HAZARDS };
  for (const e of extractions) {
    for (const k of Object.keys(merged) as (keyof HazardFlags)[]) {
      if (e.hazards?.[k]) merged[k] = true;
    }
  }
  for (const h of HAZARD_POINTS) {
    if (merged[h.key]) factors.push({ label: h.label, points: h.points });
  }

  const widest = extractions.reduce<keyof typeof SCALE_POINTS>((w, e) => {
    return SCALE_POINTS[e.affectedScale] > SCALE_POINTS[w] ? e.affectedScale : w;
  }, 'individual');
  if (SCALE_POINTS[widest] > 0) {
    factors.push({ label: `Affected scale: ${widest.replace('_', ' ')}`, points: SCALE_POINTS[widest] });
  }

  if (reportCount > 1) {
    const pts = Math.min(reportCount - 1, 4) * 3;
    factors.push({
      label: `Corroboration: ${reportCount} independent reports`,
      points: pts,
      detail: 'Capped at 4 additional reports to stop brigading from inflating priority.',
    });
  }

  if (contextNote.rain && (merged.waterLogging || worstSeverity !== 'low')) {
    factors.push({ label: 'Active precipitation', points: 5, detail: 'Live weather feed.' });
  }
  if (contextNote.heavyTraffic && merged.blockingTraffic) {
    factors.push({ label: 'Heavy traffic at location', points: 4, detail: 'Simulated traffic provider.' });
  }

  const ageMinutes = (Date.now() - new Date(openedAt).getTime()) / 60000;
  const provisional = factors.reduce((n, f) => n + f.points, 0);
  const provisionalBand = toBand(provisional);
  const overdueBy = ageMinutes - SLA_MINUTES[provisionalBand];
  if (overdueBy > 0) {
    const pts = Math.min(10, Math.round((overdueBy / SLA_MINUTES[provisionalBand]) * 5));
    if (pts > 0) {
      factors.push({
        label: 'Ageing past response target',
        points: pts,
        detail: `Open ${Math.round(ageMinutes)} min against a ${SLA_MINUTES[provisionalBand]} min target.`,
      });
    }
  }

  const score = Math.max(0, Math.min(100, factors.reduce((n, f) => n + f.points, 0)));
  return { score, band: toBand(score), factors };
}

export function toBand(score: number): PriorityBand {
  if (score >= 75) return 'P1';
  if (score >= 60) return 'P2';
  if (score >= 40) return 'P3';
  return 'P4';
}

// ─────────────────────── Stage 5/6: Route + Fuse + Notify ──────────────────────

function hazardNotes(extractions: Extraction[]): string[] {
  const notes: string[] = [];
  const any = (k: keyof HazardFlags) => extractions.some((e) => e.hazards?.[k]);
  if (any('injuriesLikely')) notes.push('possible injuries');
  if (any('fireOrSmoke')) notes.push('fire or smoke');
  if (any('electricalRisk')) notes.push('electrical risk');
  if (any('structuralRisk')) notes.push('structural risk');
  return notes;
}

export function buildDispatch(incident: Incident): DispatchPayload {
  const loc = incident.location;
  return {
    payloadId: `DSP-${incident.id.replace('INC-', '')}-${String(Date.now()).slice(-4)}`,
    generatedAt: new Date().toISOString(),
    incidentId: incident.id,
    priority: incident.priority.band,
    department: incident.department.name,
    subject: `[${incident.priority.band} ${PRIORITY_LABELS[incident.priority.band]}] ${incident.title}`,
    body: incident.fusedSummary,
    locationLine: `${loc.address ?? 'Unresolved address'} — ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`,
    evidenceCount: incident.reports.length,
    recommendedActions: incident.recommendedActions,
    deliveryChannel: 'in_app_outbox',
    deliveryNote:
      'Generated and queued to the in-app dispatch outbox. No municipal endpoint is connected, so nothing was transmitted externally.',
  };
}

// ───────────────────────────── Orchestrator: intake ────────────────────────────

export interface IntakeResult {
  incident: Incident;
  merged: boolean;
  trace: TraceStep[];
}

export async function processReport(db: Database, report: RawReport): Promise<IntakeResult> {
  const trace: TraceStep[] = [];
  const t0 = Date.now();

  // Stage 1 — Detect
  trace.push({
    stage: 'Detect',
    label: 'Report received',
    status: 'ok',
    detail: `Channel: ${report.channel}; modalities: ${report.modalities.join(', ')}.`,
    ms: 0,
  });

  // Enrich location before extraction so the model sees a human-readable place.
  const geoStart = Date.now();
  const geo = await reverseGeocode(report.location);
  if (geo.address) {
    report.location.address = geo.address;
    report.location.ward = geo.ward;
  }
  trace.push({
    stage: 'Detect',
    label: 'Reverse geocode',
    status: geo.address ? 'ok' : 'fallback',
    detail: geo.address ? `Resolved to ${geo.address}.` : 'Nominatim unavailable — raw coordinates retained.',
    ms: Date.now() - geoStart,
  });

  // Stage 2 — Understand
  const { extraction, step } = await understand(report);
  trace.push(step);

  // Context enrichment
  const ctxStart = Date.now();
  const context = await buildContext(report.location, new Date(report.receivedAt));
  trace.push({
    stage: 'Understand',
    label: 'Context enrichment',
    status: context.weather ? 'ok' : 'fallback',
    detail: describeContext(context),
    ms: Date.now() - ctxStart,
  });

  // Stage 3 — Combine
  const candidates = dedupeCandidates(db, report, extraction.category);
  let target: Incident | undefined;
  let mergeInfo: { confidence: number; reason: string; engine: Engine } | undefined;

  if (candidates.length === 0) {
    trace.push({
      stage: 'Combine',
      label: 'Duplicate check',
      status: 'skipped',
      detail: `No open ${CATEGORY_LABELS[extraction.category].toLowerCase()} within ${DEDUPE_GATES[extraction.category].radiusM} m and ${DEDUPE_GATES[extraction.category].windowMinutes} min. Treated as a new incident.`,
      ms: 0,
    });
  } else {
    for (const cand of candidates) {
      const verdict = await adjudicateDuplicate(cand, report, extraction);
      if (verdict.sameIncident && verdict.confidence >= 0.55) {
        target = cand;
        mergeInfo = { confidence: verdict.confidence, reason: verdict.reason, engine: verdict.engine };
        trace.push({
          stage: 'Combine',
          label: 'Duplicate confirmed',
          status: 'ok',
          detail: `Merged into ${cand.id} (confidence ${verdict.confidence}). ${verdict.reason}`,
          ms: verdict.ms,
          engine: verdict.engine,
        });
        break;
      }
      trace.push({
        stage: 'Combine',
        label: `Compared with ${cand.id}`,
        status: 'ok',
        detail: `Not the same event (confidence ${verdict.confidence}). ${verdict.reason}`,
        ms: verdict.ms,
        engine: verdict.engine,
      });
    }
  }

  const now = new Date().toISOString();

  if (target) {
    target.reports.push(report);
    target.extractions.push(extraction);
    target.updatedAt = now;
    if (mergeInfo) {
      target.mergeLog.push({
        at: now,
        reportId: report.id,
        confidence: mergeInfo.confidence,
        reason: mergeInfo.reason,
        engine: mergeInfo.engine,
      });
    }
    target.timeline.push({
      at: now,
      actor: 'System',
      event: 'Corroborating report merged',
      detail: `Report ${report.id} via ${report.channel}. Evidence now ${target.reports.length} reports.`,
    });
    target.context = context;
    await finalise(target, trace);
    return { incident: target, merged: true, trace };
  }

  const incident: Incident = {
    id: nextIncidentId(db),
    createdAt: now,
    updatedAt: now,
    title: extraction.summary.slice(0, 80),
    category: extraction.category,
    subtype: extraction.subtype,
    fusedSummary: extraction.summary,
    location: { ...report.location },
    reports: [report],
    extractions: [extraction],
    context,
    priority: { score: 0, band: 'P4', factors: [] },
    department: routeToDepartment(extraction.category, hazardNotes([extraction])),
    recommendedActions: [],
    status: 'new',
    slaDueAt: now,
    slaBreached: false,
    escalations: [],
    timeline: [
      { at: now, actor: 'System', event: 'Incident created', detail: `From report ${report.id} (${report.channel}).` },
    ],
    mergeLog: [],
  };

  db.incidents.push(incident);
  await finalise(incident, trace);
  trace.push({
    stage: 'Detect',
    label: 'Pipeline complete',
    status: 'ok',
    detail: `Total elapsed ${Date.now() - t0} ms.`,
    ms: Date.now() - t0,
  });
  return { incident, merged: false, trace };
}

/** Re-runs prioritise → route → fuse → notify for an incident. */
export async function finalise(incident: Incident, trace: TraceStep[]): Promise<void> {
  // Stage 4 — Prioritise
  const rain = (incident.context.weather?.precipitationMm ?? 0) > 0.2;
  const heavyTraffic =
    incident.context.traffic?.congestionLevel === 'heavy' ||
    incident.context.traffic?.congestionLevel === 'gridlock';

  incident.priority = computePriority(incident.extractions, incident.reports.length, { rain, heavyTraffic }, incident.createdAt);
  const dueMs = new Date(incident.createdAt).getTime() + SLA_MINUTES[incident.priority.band] * 60000;
  incident.slaDueAt = new Date(dueMs).toISOString();
  incident.slaBreached = Date.now() > dueMs && !['verified_closed', 'resolved_pending_verification'].includes(incident.status);

  trace.push({
    stage: 'Prioritise',
    label: 'Deterministic scoring',
    status: 'ok',
    detail: `${incident.priority.score}/100 → ${incident.priority.band} (${PRIORITY_LABELS[incident.priority.band]}). Response target ${SLA_MINUTES[incident.priority.band]} min.`,
    ms: 0,
  });

  // Stage 5 — Identify department
  incident.department = routeToDepartment(incident.category, hazardNotes(incident.extractions));
  trace.push({
    stage: 'Identify Dept',
    label: 'Routing',
    status: 'ok',
    detail: incident.department.reason,
    ms: 0,
  });

  // Fusion
  const reportBlock = incident.extractions
    .map((e, i) => {
      const r = incident.reports[i];
      return `Report ${i + 1} (${r?.channel ?? 'unknown'}, confidence ${e.confidence}): ${e.summary}${
        r?.voiceTranscript ? ` | voice: "${r.voiceTranscript}"` : ''
      }`;
    })
    .join('\n');

  const fusion = await runPrompt(
    FUSION_PROMPT,
    {
      category: CATEGORY_LABELS[incident.category],
      department: incident.department.name,
      address: incident.location.address ?? `${incident.location.lat}, ${incident.location.lng}`,
      context: describeContext(incident.context),
      reports: reportBlock,
    },
    () =>
      mockFuse({
        category: incident.category,
        reportCount: incident.reports.length,
        address: incident.location.address,
        department: incident.department.name,
      }),
  );

  incident.title = fusion.data.title;
  incident.fusedSummary = fusion.data.situationReport;
  incident.recommendedActions = fusion.data.recommendedActions;
  if (fusion.data.contradictions?.length) {
    incident.timeline.push({
      at: new Date().toISOString(),
      actor: 'System',
      event: 'Contradiction detected between reports',
      detail: fusion.data.contradictions.join(' | '),
    });
  }

  trace.push({
    stage: 'Combine',
    label: 'Situation report fused',
    status: fusion.error ? 'fallback' : 'ok',
    detail: fusion.error ? `Live model unavailable — playbook used.` : `${fusion.data.recommendedActions.length} recommended actions generated.`,
    ms: fusion.latencyMs,
    engine: fusion.engine,
  });

  // Stage 6 — Notify
  incident.dispatch = buildDispatch(incident);
  trace.push({
    stage: 'Notify',
    label: 'Dispatch packet generated',
    status: 'ok',
    detail: `${incident.dispatch.payloadId} queued for ${incident.department.name}. ${incident.dispatch.deliveryNote}`,
    ms: 0,
  });
  incident.updatedAt = new Date().toISOString();
}

// ──────────────────────── Stage 8: Verify resolution ───────────────────────────

export async function verifyResolution(
  incident: Incident,
  afterImagePath: string | undefined,
  closureNote: string | undefined,
): Promise<VerificationResult> {
  const call = await runPrompt(
    VERIFICATION_PROMPT,
    {
      category: CATEGORY_LABELS[incident.category],
      summary: incident.fusedSummary,
      address: incident.location.address ?? '',
      closureNote: closureNote ?? '',
    },
    () => mockVerify({ hasAfterImage: Boolean(afterImagePath), closureNote }),
    afterImagePath,
  );

  return {
    at: new Date().toISOString(),
    verdict: call.data.verdict,
    confidence: call.data.confidence,
    rationale: call.data.rationale,
    afterImagePath,
    engine: call.engine,
  };
}

// ──────────────────────────── Stage 9: Escalate ────────────────────────────────

/**
 * Statuses the SLA clock does not run against.
 *
 * `resolved_pending_verification` is here deliberately: the crew has reported
 * completion, so escalating them for slowness would be wrong. That incident is
 * not unwatched — if verification rejects the closure it moves to `reopened`,
 * which the first rule below escalates on its own terms.
 */
const TERMINAL: string[] = ['verified_closed', 'resolved_pending_verification'];

/**
 * Rule-based escalation sweep. Run on demand from the dashboard; in production
 * this would be a cron job. Rules are intentionally simple and inspectable.
 */
export function escalationSweep(incidents: Incident[]): { incident: Incident; escalation: Escalation }[] {
  const out: { incident: Incident; escalation: Escalation }[] = [];
  const now = Date.now();

  for (const inc of incidents) {
    if (TERMINAL.includes(inc.status)) continue;

    const due = new Date(inc.slaDueAt).getTime();
    const overdueMin = (now - due) / 60000;
    const target = SLA_MINUTES[inc.priority.band];
    const currentLevel = inc.escalations.length;

    let level = 0;
    let reason = '';
    let notified = '';

    if (inc.verification?.verdict === 'unresolved' && inc.status === 'reopened') {
      level = Math.max(currentLevel + 1, 2);
      reason = 'Closure rejected at verification — the reported problem is still visible in the after-evidence.';
      notified = 'Zonal Officer';
    } else if (overdueMin > target) {
      level = 2;
      reason = `Response target exceeded by more than 100% (${Math.round(overdueMin)} min past a ${target} min target).`;
      notified = 'Zonal Officer';
    } else if (overdueMin > 0) {
      level = 1;
      reason = `Response target breached by ${Math.round(overdueMin)} min.`;
      notified = `${inc.department.name} — Head`;
    }

    if (level > currentLevel) {
      const escalation: Escalation = { at: new Date().toISOString(), level, reason, notified };
      inc.escalations.push(escalation);
      inc.status = 'escalated';
      inc.slaBreached = true;
      inc.updatedAt = escalation.at;
      inc.timeline.push({
        at: escalation.at,
        actor: 'System',
        event: `Escalated to level ${level}`,
        detail: `${reason} Notified: ${notified}.`,
      });
      out.push({ incident: inc, escalation });
    }
  }

  return out;
}
