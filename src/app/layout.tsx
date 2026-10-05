import type { Metadata } from 'next';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { hasLiveEngine } from '@/lib/ai';
import './globals.css';

export const metadata: Metadata = {
  title: 'Urban Incident Response — Multimodal AI Coordination Layer',
  description:
    'Converts fragmented multimodal citizen reports into structured, prioritised, routed incidents with a closed verification loop.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const live = hasLiveEngine();

  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen">
          <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col justify-between border-r border-line bg-panel px-3 py-5 lg:flex">
            <div>
              <Link href="/" className="block px-3 pb-6">
                <div className="text-[14.5px] leading-tight font-semibold tracking-tight text-ink">
                  Urban Incident
                  <br />
                  Response
                </div>
                <div className="mt-1.5 text-[11.5px] text-faint">Multimodal coordination layer</div>
              </Link>
              <Nav />
            </div>

            <div className="px-3">
              <div className="rule mb-3" />
              <div className="label mb-1.5">Inference engine</div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${live ? 'bg-ok' : 'bg-faint'}`}
                  aria-hidden
                />
                <span className="text-[12.5px] text-ink-2">{live ? 'Gemini (live)' : 'Rule engine'}</span>
              </div>
              <p className="mt-1.5 text-[11.5px] leading-snug text-faint">
                {live
                  ? 'Live multimodal calls enabled. Falls back to rules on failure.'
                  : 'No GEMINI_API_KEY set. All AI stages run on deterministic rules and are badged as such.'}
              </p>
            </div>
          </aside>

          <main className="min-w-0 flex-1">
            <div className="mx-auto max-w-[1180px] px-5 py-7 lg:px-9 lg:py-9">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
