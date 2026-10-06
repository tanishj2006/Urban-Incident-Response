import { Icon, type IconName } from './icons';

/**
 * The nine stages from Stage 1, named for what happens rather than how it is
 * built. `name` is the key other pages pass as `active`; `title` is what a
 * visitor reads.
 */
const STAGES: { n: number; name: string; title: string; note: string; icon: IconName; tint: string }[] = [
  { n: 1, name: 'Detect', title: 'Receive', note: 'A report arrives', icon: 'inbox', tint: 'bg-sky-soft text-sky' },
  { n: 2, name: 'Understand', title: 'Understand', note: 'AI reads photo, text and voice', icon: 'eye', tint: 'bg-violet-soft text-violet' },
  { n: 3, name: 'Combine', title: 'Link repeats', note: 'Same problem, one case', icon: 'link', tint: 'bg-accent-soft text-accent' },
  { n: 4, name: 'Prioritise', title: 'Rate urgency', note: 'A fixed, visible score', icon: 'gauge', tint: 'bg-p2-soft text-p2' },
  { n: 5, name: 'Identify dept.', title: 'Pick department', note: 'Who should fix it', icon: 'building', tint: 'bg-teal-soft text-teal' },
  { n: 6, name: 'Notify', title: 'Alert the team', note: 'Dispatch details sent', icon: 'bell', tint: 'bg-p3-soft text-p3' },
  { n: 7, name: 'Respond', title: 'Fix it', note: 'The crew gets to work', icon: 'wrench', tint: 'bg-violet-soft text-violet' },
  { n: 8, name: 'Verify', title: 'Check the fix', note: 'An official confirms', icon: 'shield', tint: 'bg-ok-soft text-ok' },
  { n: 9, name: 'Escalate', title: 'Escalate if late', note: 'Overdue cases go up', icon: 'arrowUp', tint: 'bg-p1-soft text-p1' },
];

export default function PipelineDiagram({ active }: { active?: string }) {
  return (
    <ol className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-9">
      {STAGES.map((s) => {
        const on = active === s.name;
        return (
          <li
            key={s.n}
            aria-current={on ? 'step' : undefined}
            className={`rounded-sm border px-3 py-3 ${
              on ? 'border-accent bg-accent-soft shadow-[0_0_0_3px_var(--color-accent-soft)]' : 'border-line bg-panel'
            }`}
          >
            <span className={`flex h-8 w-8 items-center justify-center rounded-[10px] ${s.tint}`}>
              <Icon name={s.icon} size={17} />
            </span>
            <div className="mt-2 text-[13.5px] leading-tight font-semibold text-ink">{s.title}</div>
            <div className="mt-0.5 text-[12px] leading-snug text-muted">{s.note}</div>
          </li>
        );
      })}
    </ol>
  );
}
