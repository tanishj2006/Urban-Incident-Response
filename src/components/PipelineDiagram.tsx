const STAGES = [
  { n: 1, name: 'Detect', note: 'Multi-channel intake' },
  { n: 2, name: 'Understand', note: 'Vision + text + voice' },
  { n: 3, name: 'Combine', note: 'Collapse duplicates' },
  { n: 4, name: 'Prioritise', note: 'Deterministic score' },
  { n: 5, name: 'Identify dept.', note: 'Allocation table' },
  { n: 6, name: 'Notify', note: 'Dispatch packet' },
  { n: 7, name: 'Respond', note: 'Crew action' },
  { n: 8, name: 'Verify', note: 'After-evidence' },
  { n: 9, name: 'Escalate', note: 'SLA rules' },
];

export default function PipelineDiagram({ active }: { active?: string }) {
  return (
    <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-sm bg-line sm:grid-cols-3 lg:grid-cols-9">
      {STAGES.map((s) => {
        const on = active === s.name;
        return (
          <li
            key={s.n}
            className={`px-3 py-3 ${on ? 'bg-accent-soft' : 'bg-panel'}`}
            aria-current={on ? 'step' : undefined}
          >
            <div className={`mono text-[11px] ${on ? 'text-accent' : 'text-faint'}`}>
              {String(s.n).padStart(2, '0')}
            </div>
            <div className={`mt-1 text-[12.5px] leading-tight font-medium ${on ? 'text-accent' : 'text-ink'}`}>
              {s.name}
            </div>
            <div className="mt-0.5 text-[11px] leading-tight text-faint">{s.note}</div>
          </li>
        );
      })}
    </ol>
  );
}
