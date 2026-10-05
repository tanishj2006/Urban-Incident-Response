import type { ReactNode } from 'react';
import type { Engine, PriorityBand, IncidentStatus } from '@/lib/types';
import { PRIORITY_LABELS, STATUS_LABELS } from '@/lib/taxonomy';

const PRIORITY_STYLE: Record<PriorityBand, string> = {
  P1: 'bg-p1-soft text-p1',
  P2: 'bg-p2-soft text-p2',
  P3: 'bg-p3-soft text-p3',
  P4: 'bg-p4-soft text-p4',
};

export function PriorityChip({ band, withLabel = true }: { band: PriorityBand; withLabel?: boolean }) {
  return (
    <span className={`chip ${PRIORITY_STYLE[band]}`}>
      {band}
      {withLabel && <span className="font-normal opacity-75">{PRIORITY_LABELS[band]}</span>}
    </span>
  );
}

const STATUS_STYLE: Record<string, string> = {
  new: 'bg-accent-soft text-accent',
  acknowledged: 'bg-sunken text-ink-2',
  assigned: 'bg-sunken text-ink-2',
  in_progress: 'bg-p2-soft text-p2',
  resolved_pending_verification: 'bg-p3-soft text-p3',
  verified_closed: 'bg-ok-soft text-ok',
  reopened: 'bg-p1-soft text-p1',
  escalated: 'bg-p1-soft text-p1',
};

export function StatusChip({ status }: { status: IncidentStatus }) {
  return <span className={`chip ${STATUS_STYLE[status] ?? 'bg-sunken text-ink-2'}`}>{STATUS_LABELS[status]}</span>;
}

/**
 * Every AI-derived value is badged with the engine that produced it. This is
 * the honesty mechanism: a rule-engine result must never read as a model result.
 */
export function EngineChip({ engine }: { engine: Engine }) {
  if (engine === 'gemini') {
    return <span className="chip bg-accent-soft text-accent">Gemini</span>;
  }
  return (
    <span className="chip bg-p4-soft text-p4" title="Produced by the deterministic rule engine, not a live model">
      Rule engine
    </span>
  );
}

export function Panel({
  title,
  action,
  children,
  className = '',
  dense = false,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  dense?: boolean;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <h2 className="label">{title}</h2>
          {action}
        </header>
      )}
      <div className={dense ? '' : 'p-4'}>{children}</div>
    </section>
  );
}

export function Metric({ value, label, tone }: { value: ReactNode; label: string; tone?: string }) {
  return (
    <div className="panel px-4 py-3.5">
      <div className={`tnum text-[26px] leading-none font-semibold ${tone ?? 'text-ink'}`}>{value}</div>
      <div className="label mt-2">{label}</div>
    </div>
  );
}

export function KeyValue({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="grid grid-cols-[132px_1fr] gap-3 py-1.5 text-[13.5px]">
      <dt className="text-muted">{k}</dt>
      <dd className="text-ink-2">{v}</dd>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-[13.5px] text-faint">{children}</p>;
}

/** Relative time, rendered server-side at request time. */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} d ago`;
}

export function untilText(iso: string): { text: string; overdue: boolean } {
  const diff = new Date(iso).getTime() - Date.now();
  const overdue = diff < 0;
  const m = Math.abs(Math.round(diff / 60000));
  const label = m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
  return { text: overdue ? `${label} overdue` : `${label} left`, overdue };
}
