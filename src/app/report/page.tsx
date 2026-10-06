import ReportForm from '@/components/ReportForm';

export const dynamic = 'force-dynamic';

export default function ReportPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[28px] leading-tight font-bold tracking-tight">Report an issue</h1>
        <p className="mt-2 max-w-[62ch] text-[16px] leading-relaxed text-ink-2">
          Tell us what is wrong and where. Add whatever you have: a photo, a few words, a voice note. The more
          you add, the better the system understands it. You only need one.
        </p>
      </header>

      <ReportForm />
    </div>
  );
}
