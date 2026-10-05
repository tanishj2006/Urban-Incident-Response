import ReportForm from '@/components/ReportForm';
import PipelineDiagram from '@/components/PipelineDiagram';

export const dynamic = 'force-dynamic';

export default function ReportPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">Report intake</h1>
        <p className="mt-1.5 max-w-[66ch] text-[14.5px] text-muted">
          Submit a report the way a citizen or field officer would — a photograph, a written description, a
          spoken note, a location, or any combination. The system fuses whatever modalities are present.
        </p>
      </header>

      <PipelineDiagram active="Detect" />
      <ReportForm />
    </div>
  );
}
