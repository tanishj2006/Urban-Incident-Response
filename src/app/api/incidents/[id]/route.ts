import { NextResponse } from 'next/server';
import { mutate } from '@/lib/store';
import { STATUS_LABELS } from '@/lib/taxonomy';
import type { IncidentStatus } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID: IncidentStatus[] = [
  'new',
  'acknowledged',
  'assigned',
  'in_progress',
  'resolved_pending_verification',
  'verified_closed',
  'reopened',
  'escalated',
];

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json()) as { status?: IncidentStatus; assignee?: string; actor?: string };

  const result = await mutate((db) => {
    const inc = db.incidents.find((i) => i.id === id);
    if (!inc) return null;

    const at = new Date().toISOString();
    const actor = body.actor || 'Control room';

    if (body.status) {
      if (!VALID.includes(body.status)) return { error: 'Unknown status' };
      // Closing by hand must not bypass the verification loop.
      if (body.status === 'verified_closed' && !inc.verification) {
        return {
          error:
            'This incident cannot be closed directly. Submit after-evidence through the verification step first.',
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
    return { ok: true, status: inc.status, assignee: inc.assignee };
  });

  if (result === null) return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
  if ('error' in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
