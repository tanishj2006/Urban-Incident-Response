import { NextResponse } from 'next/server';
import { resetDb } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Restores the controlled test scenarios. Useful immediately before a demo. */
export async function POST() {
  await resetDb();
  return NextResponse.json({ ok: true, message: 'Test scenarios restored.' });
}
