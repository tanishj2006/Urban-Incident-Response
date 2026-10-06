import type { ReactNode } from 'react';
import type { Engine, PriorityBand, IncidentStatus } from '@/lib/types';
import { PRIORITY_LABELS, STATUS_LABELS } from '@/lib/taxonomy';
import { Icon, type IconName } from './icons';

/** Urgency: red → orange → yellow → slate. The word always accompanies the colour. */
const PRIORITY_STYLE: Record<PriorityBand, string> = {
  P1: 'bg-p1-soft text-p1',
  P2: 'bg-p2-soft text-p2',
  P3: 'bg-p3-soft text-p3',
  P4: 'bg-p4-soft text-p4',
};

/** Plain-English urgency, shown instead of the bare code when there is room. */
const PRIORITY_PLAIN: Record<PriorityBand, string> = {
  P1: 'Urgent',
  P2: 'High',
  P3: 'Medium',
  P4: 'Low',
};

export function PriorityChip({ band, withLabel = true }: { band: PriorityBand; withLabel?: boolean }) {
  return (
    <span className={`chip ${PRIORITY_STYLE[band]}`} title={`${band} · ${PRIORITY_LABELS[band]}`}>
      <span className="chip-dot" aria-hidden />
      {PRIORITY_PLAIN[band]}
      {withLabel && <span className="font-normal opacity-70">{band}</span>}
    </span>
  );
}

/** Progress: blue → violet → teal → green, with red reserved for "escalated". */
const STATUS_STYLE: Record<string, string> = {
  reported: 'bg-sky-soft text-sky',
  verified: 'bg-accent-soft text-accent',
  assigned: 'bg-violet-soft text-violet',
  in_progress: 'bg-p3-soft text-p3',
  resolved: 'bg-teal-soft text-teal',
  closed: 'bg-ok-soft text-ok',
  escalated: 'bg-p1-soft text-p1',
};

export function StatusChip({ status }: { status: IncidentStatus }) {
  return (
    <span className={`chip ${STATUS_STYLE[status] ?? 'bg-sunken text-ink-2'}`}>
      <span className="chip-dot" aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  );
}

/**
 * Every AI-derived value is badged with the engine that produced it. This is
 * the honesty mechanism: a rule-engine result must never read as a model result.
 */
export function EngineChip({ engine }: { engine: Engine }) {
  if (engine === 'gemini') {
    return (
      <span className="chip bg-violet-soft text-violet">
        <Icon name="sparkle" size={13} />
        Gemini AI
      </span>
    );
  }
  return (
    <span className="chip bg-p4-soft text-p4" title="Produced by the built-in rule engine, not a live AI model">
      Rule engine
    </span>
  );
}

export function Panel({
  title,
  hint,
  action,
  children,
  className = '',
  dense = false,
}: {
  title?: string;
  /** One plain sentence under the title saying what this box is for. */
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  dense?: boolean;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div>
            <h2 className="text-[15.5px] font-semibold tracking-tight text-ink">{title}</h2>
            {hint && <p className="mt-0.5 text-[13px] leading-snug text-muted">{hint}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={dense ? '' : 'p-5'}>{children}</div>
    </section>
  );
}

type Tone = 'blue' | 'red' | 'orange' | 'violet' | 'green' | 'teal';

const TILE: Record<Tone, string> = {
  blue: 'bg-accent-soft text-accent',
  red: 'bg-p1-soft text-p1',
  orange: 'bg-p2-soft text-p2',
  violet: 'bg-violet-soft text-violet',
  green: 'bg-ok-soft text-ok',
  teal: 'bg-teal-soft text-teal',
};

const NUMBER: Record<Tone, string> = {
  blue: 'text-ink',
  red: 'text-p1',
  orange: 'text-p2',
  violet: 'text-violet',
  green: 'text-ok',
  teal: 'text-teal',
};

/**
 * A headline number with a coloured icon and a sentence saying what it counts.
 * The colour is applied only when the number is worth attention (`alert`).
 */
export function Metric({
  value,
  label,
  note,
  icon,
  tone = 'blue',
  alert = true,
}: {
  value: ReactNode;
  label: string;
  note?: string;
  icon: IconName;
  tone?: Tone;
  alert?: boolean;
}) {
  return (
    <div className="panel flex items-start gap-3.5 px-4 py-4">
      <span className={`icon-tile ${TILE[tone]}`}>
        <Icon name={icon} size={21} />
      </span>
      <div className="min-w-0">
        <div className={`tnum text-[28px] leading-none font-bold ${alert ? NUMBER[tone] : 'text-ink'}`}>
          {value}
        </div>
        <div className="mt-1.5 text-[14px] leading-tight font-semibold text-ink-2">{label}</div>
        {note && <div className="mt-0.5 text-[12.5px] leading-snug text-muted">{note}</div>}
      </div>
    </div>
  );
}

export function KeyValue({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="grid grid-cols-[132px_1fr] gap-3 py-1.5 text-[14px]">
      <dt className="text-muted">{k}</dt>
      <dd className="text-ink-2">{v}</dd>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-[14px] text-faint">{children}</p>;
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
