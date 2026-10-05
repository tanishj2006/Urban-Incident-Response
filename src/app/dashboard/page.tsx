import { listIncidents } from '@/lib/store';
import OpsConsole from '@/components/OpsConsole';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const incidents = await listIncidents();
  return <OpsConsole incidents={incidents} />;
}
