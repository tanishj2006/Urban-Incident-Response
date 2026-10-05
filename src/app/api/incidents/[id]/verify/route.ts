import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { mutate } from '@/lib/store';
import { verifyResolution } from '@/lib/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stage 8 — Verify Resolution.
 *
 * A crew marking something "done" is a claim, not evidence. This endpoint takes
 * the after-photograph and re-reads it against the ORIGINAL complaint. An
 * unresolved verdict reopens the incident rather than closing it, which is what
 * makes the loop closed rather than a straight line.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  try {
    const form = await req.formData();
    const closureNote = String(form.get('closureNote') ?? '').trim();
    const file = form.get('afterImage');

    let afterImagePath: string | undefined;
    if (file instanceof File && file.size > 0) {
      if (file.size > 8 * 1024 * 1024) throw new Error('Image is larger than 8 MB.');
      const ext = file.type === 'image/png' ? '.png' : file.type === 'image/webp' ? '.webp' : '.jpg';
      const name = `after-${id}-${Date.now()}${ext}`;
      const dir = path.join(process.cwd(), 'public', 'uploads');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
      afterImagePath = `/uploads/${name}`;
    }

    const snapshot = await mutate((db) => db.incidents.find((i) => i.id === id));
    if (!snapshot) return NextResponse.json({ error: 'Incident not found' }, { status: 404 });

    const verification = await verifyResolution(snapshot, afterImagePath, closureNote);

    const updated = await mutate((db) => {
      const inc = db.incidents.find((i) => i.id === id);
      if (!inc) return null;

      inc.verification = verification;
      inc.updatedAt = verification.at;

      if (verification.verdict === 'resolved') {
        inc.status = 'verified_closed';
        inc.slaBreached = false;
        inc.timeline.push({
          at: verification.at,
          actor: 'System',
          event: 'Resolution verified',
          detail: `After-evidence accepted at ${verification.confidence} confidence. Incident closed.`,
        });
      } else if (verification.verdict === 'partial') {
        inc.status = 'resolved_pending_verification';
        inc.timeline.push({
          at: verification.at,
          actor: 'System',
          event: 'Partial resolution — held open',
          detail: verification.rationale,
        });
      } else {
        inc.status = 'reopened';
        inc.timeline.push({
          at: verification.at,
          actor: 'System',
          event: 'Closure rejected at verification',
          detail: `${verification.rationale} Incident reopened.`,
        });
      }
      return { status: inc.status };
    });

    return NextResponse.json({ verification, status: updated?.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Verification failed.' },
      { status: 500 },
    );
  }
}
