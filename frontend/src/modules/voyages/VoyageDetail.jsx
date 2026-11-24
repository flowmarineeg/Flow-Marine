'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useVoyage, useVoyageSummary } from '@/hooks/useVoyage';
import { usePermission } from '@/context/PermissionContext';
import { getVoyageLabel } from '@/utils/voyageLabel';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import VoyagePortStrip from '@/modules/voyages/VoyagePortStrip';
import VoyageKpiCards from '@/modules/voyages/VoyageKpiCards';
import VoyageOverviewTab from '@/modules/voyages/VoyageOverviewTab';
import VoyageBookingsTab from '@/modules/voyages/VoyageBookingsTab';
import VoyageQuickActions from '@/modules/voyages/VoyageQuickActions';

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const TABS = [
  { key: 'overview',    label: 'Overview' },
  { key: 'estimated',   label: 'Estimated bookings' },
  { key: 'operational', label: 'Bookings' },
];

function DateCell({ label, value, actual }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-semibold ${value ? (actual ? 'text-blue-600' : 'text-gray-700') : 'text-gray-300'}`}>{fmt(value)}</p>
    </div>
  );
}

function Message({ title, text, onBack, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-gray-400">
      <p className="text-sm font-semibold text-gray-600">{title}</p>
      {text && <p className="text-sm mt-1">{text}</p>}
      <div className="flex gap-4 mt-3">
        {onRetry && <button onClick={onRetry} className="text-sm text-teal-600 hover:underline">Try again</button>}
        <button onClick={onBack} className="text-sm text-teal-600 hover:underline">← Back to Voyages</button>
      </div>
    </div>
  );
}

/** Voyage Details page: header, quick actions, port strip, four cards, three tabs (the tables are read-only). */
export default function VoyageDetail({ voyageId }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = usePermission();
  const [tab, setTab]   = useState('overview');
  const [port, setPort] = useState(null); // { legKey, portId, name } → filters the two booking tabs only

  const voyageQ  = useVoyage(voyageId);
  const summaryQ = useVoyageSummary(voyageId);
  const voyage   = voyageQ.data;
  const summary  = summaryQ.data;
  // Opened from a vessel's page (`?from=<vesselId>`): go back there, else to the vessel list.
  const from = searchParams.get('from');
  const back = () => router.push(from && /^[a-f0-9]{24}$/i.test(from) ? `/voyages/vessel/${from}` : '/voyages');

  if (voyageQ.isLoading) return <LoadingSpinner fullPage />;
  if (voyageQ.isError || !voyage) {
    const status = voyageQ.error?.response?.status;
    return status === 404 || status === 400
      ? <Message title="Voyage not found" onBack={back} />
      : <Message title="Could not load the voyage" text={voyageQ.error?.response?.data?.message || voyageQ.error?.message} onBack={back} onRetry={() => voyageQ.refetch()} />;
  }

  const round  = voyage.round;
  const vessel = voyage.vessel;

  return (
    <div className="animate-fadeIn min-w-0 w-full">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-5">
        <button onClick={back} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M15 19l-7-7 7-7" />
          </svg>
          Voyages
        </button>
        <span className="text-gray-200">/</span>
        <span className="mono text-sm font-bold text-gray-600">{voyage.voyageNumber}</span>
      </div>

      {/* Header */}
      <div className="card p-5 mb-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="mono text-lg font-bold text-gray-800">{getVoyageLabel(voyage)}</span>
              {voyage.voyageName && <span className="mono text-xs text-gray-400">({voyage.voyageNumber})</span>}
              {voyage.direction && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{voyage.direction}</span>}
              <Badge label={voyage.status} />
            </div>
            <p className="text-sm text-gray-600">
              {round ? (
                can('rounds', 'read')
                  ? <button onClick={() => router.push(`/rounds/${round._id}`)} className="mono font-semibold text-teal-600 hover:underline">{round.roundNumber}</button>
                  : <span className="mono font-semibold">{round.roundNumber}</span>
              ) : '—'}
              {round?.roundName && <span className="text-gray-400"> ({round.roundName})</span>}
              <span className="text-gray-300 mx-1.5">·</span>
              <span className="mono font-semibold text-gray-500">{vessel?.vesselCode}</span> {vessel?.vesselName || '—'}
              <span className="text-gray-300 mx-1.5">·</span>
              <span className="mono text-teal-600 font-semibold">{voyage.serviceId?.serviceCode}</span> {voyage.serviceId?.serviceName}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Route {voyage.polId?.name || '—'} → {voyage.podId?.name || '—'}
              {round && <> · Round {fmt(round.startDate)} – {fmt(round.endDate)} · {round.status}{round.closeStatus && round.closeStatus !== 'Open' ? ` · ${round.closeStatus}` : ''}</>}
            </p>
          </div>
          <div className="flex items-center gap-5">
            <DateCell label="ETD" value={voyage.etd} />
            <DateCell label="ETA" value={voyage.eta} />
            <DateCell label="ATD" value={voyage.atd} actual />
            <DateCell label="ATA" value={voyage.ata} actual />
          </div>
        </div>
      </div>

      {voyage.status === 'Cancelled' && (
        <div className="rounded-lg px-4 py-2.5 mb-4 text-sm font-medium" style={{ background: '#FBE4E4', color: '#8E1C1C' }}>
          This voyage is Cancelled. TEU shows 0 because a Cancelled voyage is not counted in capacity.
        </div>
      )}

      {/* Quick actions: booking forms with this voyage fixed; disabled with a reason when booking is not possible */}
      <VoyageQuickActions voyage={voyage} summary={summary} />

      {/* Summary: port strip + cards */}
      {summaryQ.isLoading ? (
        <div className="card mb-4"><LoadingSpinner fullPage /></div>
      ) : summaryQ.isError || !summary ? (
        <div className="card p-6 mb-4 text-center">
          <p className="text-sm text-gray-500 mb-2">{summaryQ.error?.response?.data?.message || 'Could not load the voyage totals.'}</p>
          <button onClick={() => summaryQ.refetch()} className="text-sm text-teal-600 hover:underline">Try again</button>
        </div>
      ) : (
        <>
          <VoyagePortStrip ports={summary.ports} selected={port} onSelect={setPort} />
          <VoyageKpiCards summary={summary} />
        </>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-4">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 text-[13px] font-semibold border-b-2 transition ${
              tab === t.key ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {port && tab !== 'overview' && (
        <div className="flex items-center gap-2 mb-3 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
            Port: {port.name}
            <button type="button" onClick={() => setPort(null)} aria-label="Clear port filter" className="hover:text-teal-900">✕</button>
          </span>
          <span className="text-gray-400">Cards show the whole voyage.</span>
        </div>
      )}

      {tab === 'overview' && summary && <VoyageOverviewTab summary={summary} />}
      {tab === 'estimated' && (
        <VoyageBookingsTab key={`est|${port?.legKey}|${port?.portId}`} voyageId={voyageId} layer="estimated" port={port} />
      )}
      {tab === 'operational' && (
        <VoyageBookingsTab key={`op|${port?.legKey}|${port?.portId}`} voyageId={voyageId} layer="operational" port={port} />
      )}
    </div>
  );
}
