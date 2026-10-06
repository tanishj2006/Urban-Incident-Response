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

      // This stage is ADVISORY. It never closes an incident: Stage 1 §1.3.2
      // excludes "final closure without human confirmation", so the best a
      // positive verdict can do is move the incident to `resolved` and wait.
      if (verification.verdict === 'unresolved') {
        inc.status = 'in_progress';
        inc.timeline.push({
          at: verification.at,
          actor: 'System',
          event: 'Closure rejected at verification',
          detail: `${verification.rationale} Returned to in progress.`,
        });
      } else {
        inc.status = 'resolved';
        inc.timeline.push({
          at: verification.at,
          actor: 'System',
          event:
            verification.verdict === 'resolved'
              ? 'Verification suggests resolved'
              : 'Verification suggests partial resolution',
          detail: `${verification.rationale} Advisory only — awaiting an official's closure confirmation.`,
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
