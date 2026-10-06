import type { Metadata } from 'next';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { Icon } from '@/components/icons';
import { hasLiveEngine, keyCount } from '@/lib/ai';
import './globals.css';

export const metadata: Metadata = {
  title: 'Urban Incident Response — Multimodal AI Coordination Layer',
  description:
    'Converts fragmented multimodal citizen reports into structured, prioritised, routed incidents with a closed verification loop.',
};

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-accent text-white shadow-[0_3px_10px_rgba(37,99,235,0.35)]">
        <Icon name="shield" size={22} />
      </span>
      <span>
        <span className="block text-[15.5px] leading-tight font-bold tracking-tight text-ink">
          Urban Incident Response
        </span>
        <span className="block text-[12px] leading-tight text-muted">Report it. Route it. Resolve it.</span>
      </span>
    </Link>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const live = hasLiveEngine();
  const keys = keyCount();

  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen">
          <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col justify-between border-r border-line bg-panel px-4 py-6 lg:flex">
            <div>
              <div className="px-2 pb-7">
                <Brand />
              </div>
              <Nav />
            </div>

            <div className="rounded-sm border border-line bg-sunken p-3.5">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${live ? 'bg-ok shadow-[0_0_0_4px_var(--color-ok-soft)]' : 'bg-faint'}`}
                  aria-hidden
                />
                <span className="text-[13.5px] font-semibold text-ink-2">
                  {live ? 'Gemini AI connected' : 'Gemini AI not connected'}
                </span>
              </div>
              <p className="mt-1.5 text-[12px] leading-snug text-muted">
                {live
                  ? `${keys} key${keys > 1 ? 's' : ''} loaded. If a key is refused or out of quota, built-in rules take over, and every result says which one produced it.`
                  : 'No AI key is set, so built-in rules handle every step. Each result is labelled "Rule engine".'}
              </p>
            </div>
          </aside>

          <main className="min-w-0 flex-1">
            <div className="border-b border-line bg-panel px-5 py-3 lg:hidden">
              <Brand />
              <div className="mt-3 overflow-x-auto [&>nav]:flex-row">
                <Nav />
              </div>
            </div>
            <div className="mx-auto max-w-[1180px] px-5 py-7 lg:px-10 lg:py-10">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
