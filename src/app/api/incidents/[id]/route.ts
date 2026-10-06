import { NextResponse } from 'next/server';
import { mutate } from '@/lib/store';
import { ALL_CATEGORIES, PRIORITY_BANDS, STATUS_LABELS } from '@/lib/taxonomy';
import { applyPriorityOverride, applyRecategorisation, separateReport } from '@/lib/pipeline';
import type { IncidentCategory, IncidentStatus, PriorityBand } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Official actions on an incident.
 *
 * Every consequential decision in this system is taken here, by a person, not
 * by the pipeline — Stage 1 §4.1.13 makes that the governing design principle.
 * In particular `closed` cannot be reached without `confirmClosure`, and
 * `confirmClosure` refuses without post-action evidence on file.
 */

/** Statuses an official may set directly. `closed` is deliberately excluded. */
const SETTABLE: IncidentStatus[] = ['reported', 'verified', 'assigned', 'in_progress', 'resolved'];

interface Body {
  status?: IncidentStatus;
  assignee?: string;
  actor?: string;
  /** Official confirmation of closure — the only route to `closed`. */
  confirmClosure?: { note?: string };
  /** Reopen a closed or resolved incident. */
  reopen?: { reason: string };
  priorityOverride?: { band: PriorityBand | 'clear'; reason?: string };
  recategorise?: { to: IncidentCategory };
  separate?: { reportId: string };
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json()) as Body;
  const actor = body.actor?.trim() || 'Duty Officer';

  // Separation creates a second incident, so it needs the whole database.
  if (body.separate) {
    const result = await mutate((db) => separateReport(db, id, body.separate!.reportId, actor));
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, newIncidentId: result.newIncidentId });
  }

  const result = await mutate(async (db) => {
    const inc = db.incidents.find((i) => i.id === id);
    if (!inc) return null;
    const at = new Date().toISOString();

    if (body.recategorise) {
      if (!ALL_CATEGORIES.includes(body.recategorise.to)) {
        return { error: 'Unknown category.' };
      }
      await applyRecategorisation(inc, body.recategorise.to, actor);
    }

    if (body.priorityOverride) {
      const b = body.priorityOverride.band;
      if (b === 'clear') {
        applyPriorityOverride(inc, inc.recommendedPriority.band, actor);
      } else if (PRIORITY_BANDS.includes(b)) {
        applyPriorityOverride(inc, b, actor, body.priorityOverride.reason);
      } else {
        return { error: 'Unknown priority band.' };
      }
    }

    if (body.confirmClosure) {
      // Stage 1 §1.3.2 excludes "final closure of an incident without human
      // confirmation", and a confirmation with nothing to inspect is not one.
      if (!inc.verification) {
        return {
          error:
            'Closure needs post-action evidence on file. Submit the after-photograph for verification first.',
        };
      }
      inc.status = 'closed';
      inc.closure = { by: actor, at, note: body.confirmClosure.note };
      inc.slaBreached = false;
      inc.timeline.push({
        at,
        actor,
        event: 'Closure confirmed by official',
        detail:
          inc.verification.verdict === 'resolved'
            ? 'Incident closed. Verification agreed the problem was resolved.'
            : `Incident closed despite a "${inc.verification.verdict}" verification verdict. Official judgement recorded.`,
      });
    }

    if (body.reopen) {
      inc.status = 'in_progress';
      delete inc.closure;
      inc.timeline.push({
        at,
        actor,
        event: 'Incident reopened',
        detail: body.reopen.reason,
      });
    }

    if (body.status) {
      if (!SETTABLE.includes(body.status)) {
        return {
          error:
            body.status === 'closed'
              ? 'An incident cannot be set to Closed directly. Use the closure confirmation, which records who confirmed it.'
              : 'Unknown status.',
        };
      }
      const from = inc.status;
      inc.status = body.status;
      inc.timeline.push({
        at,
        actor,
        event: `Status changed to ${STATUS_LABELS[body.status]}`,
        detail: `Previously ${STATUS_LABELS[from]}.`,
      });
    }

    if (typeof body.assignee === 'string') {
      inc.assignee = body.assignee || undefined;
      inc.timeline.push({
        at,
        actor,
        event: body.assignee ? 'Crew assigned' : 'Assignment cleared',
        detail: body.assignee || undefined,
      });
    }

    inc.updatedAt = at;
    return { ok: true, status: inc.status };
  });

  if (result === null) return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
  if ('error' in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
