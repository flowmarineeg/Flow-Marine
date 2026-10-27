'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { roundsService } from '@/services/rounds.service';
import { usePermission } from '@/context/PermissionContext';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';

const fmt = (d) => (d ? String(d).split('T')[0] : '—');

// Rounds of one liner service (Operations -> Routes -> Rounds tab). Create/edit stays on the Rounds screens.
export default function ServiceRounds({ serviceId }) {
  const router = useRouter();
  const { can } = usePermission();
  const { data, isLoading } = useQuery({
    queryKey: ['rounds', 'by-service', serviceId],
    queryFn: () => roundsService.list({ serviceId, limit: 100 }).then(r => r.data.data),
  });
  const rounds = data || [];

  if (isLoading) return <LoadingSpinner />;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-600">Rounds on this service</h2>
        {can('rounds', 'create') && <Button onClick={() => router.push('/rounds')}>Go to Rounds</Button>}
      </div>
      {rounds.length === 0 ? (
        <p className="text-sm text-gray-400">No rounds yet. Create one from the Rounds screen; its voyages are generated from this route.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr className="table-header">{['Round No', 'Vessel', 'Start', 'End', 'Status', ''].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {rounds.map(r => (
                <tr key={r._id} className="table-row">
                  <td><span className="mono font-bold text-teal-600">{r.roundNumber}</span><p className="text-xs text-gray-400">{r.roundName || '(unnamed)'}</p></td>
                  <td className="text-xs text-gray-600">{r.vesselId ? `${r.vesselId.vesselCode} ${r.vesselId.vesselName}` : '—'}</td>
                  <td className="text-gray-600">{fmt(r.startDate)}</td>
                  <td className="text-gray-600">{fmt(r.endDate)}</td>
                  <td><Badge label={r.status} /></td>
                  <td><button onClick={() => router.push(`/rounds/${r._id}`)} className="text-xs font-medium text-teal-600 hover:text-teal-800">Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
