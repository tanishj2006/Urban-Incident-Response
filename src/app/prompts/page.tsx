import { ALL_PROMPTS } from '@/lib/prompts';
import { Panel } from '@/components/ui';

export const dynamic = 'force-dynamic';

/** Illustrative values, so the rendered example reads like a real call. */
const SAMPLE_VARS: Record<string, Record<string, string>> = {
  'p1-extract': {
    channel: 'citizen_app',
    receivedAt: '2026-10-05T18:41:00+05:30',
    location: '19.04012, 72.86255',
    address: 'Sion Circle, Sion, Mumbai',
    text: 'Two-wheeler and auto collided at the circle. Rider is on the road and not getting up. Traffic completely stuck.',
    transcript: '',
    hasImage: 'yes',
  },
  'p2-dedupe': {
    existingCategory: 'Road accident',
    existingSummary:
      'Collision between a two-wheeler and an auto-rickshaw at Sion Circle; one rider is immobile on the carriageway.',
    existingTime: '2026-10-05T18:41:00+05:30',
    existingEvidence: '1 report(s), 1 with photographs',
    newCategory: 'Road accident',
    newSummary: 'Caller reports a bike-auto collision at Sion Circle with one person bleeding from the leg.',
    newTime: '2026-10-05T18:44:00+05:30',
    distance: '38',
    elapsed: '3 minutes',
  },
  'p3-fuse': {
    category: 'Road accident',
    department: 'Traffic Police Control Room',
    address: 'Sion Circle, Sion, Mumbai',
    context: 'Partly cloudy, 29.4°C, 0 mm precipitation; traffic heavy (simulated); time of day: evening',
    reports:
      'Report 1 (citizen_app, confidence 0.88): Collision between a two-wheeler and an auto-rickshaw; one rider immobile on the carriageway.\nReport 2 (phone_call, confidence 0.79): Caller reports one person bleeding from the leg.',
  },
  'p4-verify': {
    category: 'Pothole / road damage',
    summary:
      'A deep pothole in the left lane of the Sion–Panvel Highway at Mankhurd is causing two-wheelers to swerve.',
    address: 'Sion–Panvel Highway, Mankhurd, Mumbai',
    closureNote: 'Cold-mix patch applied.',
  },
};

export default function PromptsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">Prompt library</h1>
        <p className="mt-1.5 max-w-[72ch] text-[14.5px] text-muted">
          Every prompt the system issues, with the reasoning behind its wording and the JSON schema that
          constrains its output. These are not documentation copies — this page renders the same objects the
          pipeline executes, so the two cannot drift apart.
        </p>
      </header>

      <div className="panel bg-sunken px-4 py-3 text-[13.5px] leading-snug text-ink-2">
        <strong className="font-medium">Two rules shape all four prompts.</strong> First, the model is never
        asked for a number it would have to invent — it returns bands and booleans, and deterministic code
        turns those into scores. Second, every prompt has an explicit way to express doubt, because a
        confident wrong answer is more dangerous here than an admitted uncertainty.
      </div>

      <div className="space-y-5">
        {ALL_PROMPTS.map((p) => {
          const vars = SAMPLE_VARS[p.id] ?? {};
          return (
            <Panel key={p.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip bg-accent-soft text-accent">{p.stage}</span>
                <span className="mono text-faint">{p.id}</span>
              </div>
              <h2 className="mt-2 text-[17px] font-semibold tracking-tight">{p.title}</h2>
              <p className="mt-1 max-w-[76ch] text-[14px] text-muted">{p.purpose}</p>

              <div className="mt-4">
                <div className="label mb-2">Why it is worded this way</div>
                <ul className="space-y-1.5">
                  {p.designNotes.map((n, i) => (
                    <li key={i} className="flex gap-2.5 text-[13.5px] leading-snug">
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-faint" />
                      <span className="text-ink-2">{n}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <div className="label mb-1.5">System instruction</div>
                  <pre className="mono overflow-x-auto rounded-sm border border-line bg-sunken p-3 leading-relaxed whitespace-pre-wrap text-ink-2">
                    {p.system}
                  </pre>
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="label mb-1.5">Example user message</div>
                    <pre className="mono overflow-x-auto rounded-sm border border-line bg-sunken p-3 leading-relaxed whitespace-pre-wrap text-ink-2">
                      {p.buildUser(vars)}
                    </pre>
                  </div>
                  <div>
                    <div className="label mb-1.5">Enforced response schema</div>
                    <pre className="mono max-h-[260px] overflow-auto rounded-sm border border-line bg-sunken p-3 leading-relaxed text-ink-2">
                      {JSON.stringify(p.responseSchema, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
