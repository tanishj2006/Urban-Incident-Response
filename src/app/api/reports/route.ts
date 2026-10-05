import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { mutate } from '@/lib/store';
import { processReport } from '@/lib/pipeline';
import { reportId } from '@/lib/ids';
import type { Channel, Modality, RawReport } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_IMAGE = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 8 * 1024 * 1024;

async function saveImage(file: File): Promise<string | undefined> {
  if (!file || file.size === 0) return undefined;
  if (!ALLOWED_IMAGE.includes(file.type)) {
    throw new Error(`Unsupported image type "${file.type}". Use JPEG, PNG or WebP.`);
  }
  if (file.size > MAX_BYTES) throw new Error('Image is larger than 8 MB.');

  const ext = file.type === 'image/png' ? '.png' : file.type === 'image/webp' ? '.webp' : '.jpg';
  const name = `rpt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}${ext}`;
  const dir = path.join(process.cwd(), 'public', 'uploads');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  return `/uploads/${name}`;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const text = String(form.get('text') ?? '').trim();
    const transcript = String(form.get('voiceTranscript') ?? '').trim();
    const channel = (String(form.get('channel') || 'citizen_app')) as Channel;
    const reporterName = String(form.get('reporterName') ?? '').trim();
    const lat = Number(form.get('lat'));
    const lng = Number(form.get('lng'));
    const image = form.get('image');

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: 'A valid location is required.' }, { status: 400 });
    }
    if (!text && !transcript && !(image instanceof File && image.size > 0)) {
      return NextResponse.json(
        { error: 'Provide at least one of: a description, a voice note, or a photograph.' },
        { status: 400 },
      );
    }

    const imagePath = image instanceof File ? await saveImage(image) : undefined;

    const modalities: Modality[] = ['location'];
    if (text) modalities.push('text');
    if (transcript) modalities.push('voice');
    if (imagePath) modalities.push('image');

    const report: RawReport = {
      id: reportId(),
      receivedAt: new Date().toISOString(),
      channel,
      modalities,
      reporterName: reporterName || undefined,
      text: text || undefined,
      voiceTranscript: transcript || undefined,
      imagePath,
      location: { lat, lng, accuracyM: Number(form.get('accuracyM')) || undefined },
    };

    const result = await mutate((db) => processReport(db, report));

    return NextResponse.json({
      incidentId: result.incident.id,
      merged: result.merged,
      priority: result.incident.priority,
      department: result.incident.department.name,
      trace: result.trace,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error during intake.' },
      { status: 500 },
    );
  }
}
