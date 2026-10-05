import { NextResponse } from 'next/server';
import { mutate } from '@/lib/store';
import { escalationSweep } from '@/lib/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stage 9 — Escalate if required.
 *
 * Run on demand from the operations console. In production this would be a
 * scheduled job; exposing it as a button makes the rule observable in a demo
 * instead of hidden behind a timer.
 */
export async function POST() {
  const escalated = await mutate((db) => {
    const results = escalationSweep(db.incidents);
    return results.map((r) => ({
      id: r.incident.id,
      title: r.incident.title,
      level: r.escalation.level,
      reason: r.escalation.reason,
      notified: r.escalation.notified,
    }));
  });

  return NextResponse.json({
    count: escalated.length,
    escalated,
    message:
      escalated.length === 0
        ? 'Sweep complete. No incident is past its response target beyond its current escalation level.'
        : `Sweep complete. ${escalated.length} incident(s) escalated.`,
  });
}
