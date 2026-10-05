import type { Database } from './types';

/**
 * Kept in its own module so that seed.ts can use the pipeline's scoring logic
 * without creating a store → seed → pipeline → store import cycle.
 */
export function nextIncidentId(db: Database): string {
  db.counter += 1;
  return `INC-${new Date().getFullYear()}-${String(db.counter).padStart(4, '0')}`;
}

export function reportId(): string {
  return `RPT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}
