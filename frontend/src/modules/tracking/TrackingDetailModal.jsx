'use client';

import Modal from '@/components/ui/Modal';

const fmtDT = (d) => d
  ? new Date(d).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
  : '—';

const TRACKING_COLORS = {
  'At Port':    'bg-blue-100 text-blue-700',
  'Departed':   'bg-amber-100 text-amber-700',
  'In Transit': 'bg-purple-100 text-purple-700',
  'Arrived':    'bg-green-100 text-green-700',
  'Anchored':   'bg-gray-100 text-gray-600',
  'Delayed':    'bg-red-100 text-red-600',
};

function InfoRow({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="text-[13.5px] font-medium text-gray-700">{value || <span className="text-gray-300">—</span>}</p>
    </div>
  );
}

export default function TrackingDetailModal({ entry, open, onClose }) {
  if (!entry) return null;
  return (
    <Modal open={open} onClose={onClose} title="Tracking Entry Detail" size="md">
      <div className="flex flex-col gap-5">

        {/* Status + timestamp */}
        <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
          <span className={`text-[11px] font-bold px-3 py-1 rounded-full ${TRACKING_COLORS[entry.status] || 'bg-gray-100 text-gray-600'}`}>
            {entry.status}
          </span>
          <div>
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Last Update</p>
            <p className="text-sm font-semibold text-gray-700">{fmtDT(entry.lastUpdate)}</p>
          </div>
        </div>

        {/* Vessel + service + voyage + round */}
        <div className="grid grid-cols-2 gap-4">
          <InfoRow label="Vessel"  value={entry.vesselId ? `${entry.vesselId.vesselCode} — ${entry.vesselId.vesselName}` : null} />
          <InfoRow label="Service" value={entry.serviceId ? `${entry.serviceId.serviceCode} — ${entry.serviceId.serviceName}` : null} />
          <InfoRow label="Voyage"  value={<span className="mono font-bold text-teal-600">{entry.voyageId?.voyageNumber}</span>} />
          <InfoRow label="Round"   value={<span className="mono text-gray-600">{entry.roundId?.roundNumber}</span>} />
        </div>

        {/* Position */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Position</p>
          <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
            <div className="flex items-center gap-1.5 flex-wrap text-sm text-gray-700">
              {entry.countryId?.name && <><span className="font-medium">{entry.countryId.name}</span><span className="text-gray-300">›</span></>}
              {entry.cityId?.name    && <><span className="font-medium">{entry.cityId.name}</span><span className="text-gray-300">›</span></>}
              <span className="font-semibold text-teal-700">{entry.portId?.name}</span>
              {entry.portId?.code && <span className="mono text-xs text-teal-500">({entry.portId.code})</span>}
              {entry.terminalId?.name && <><span className="text-gray-300">›</span><span className="font-medium text-gray-600">{entry.terminalId.name}</span></>}
            </div>
          </div>
        </div>

        {/* Remarks */}
        {entry.remarks && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Remarks</p>
            <p className="text-sm text-gray-600 leading-relaxed">{entry.remarks}</p>
          </div>
        )}

        {/* Footer metadata */}
        <div className="border-t border-gray-100 pt-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Recorded by</p>
            <p className="text-sm text-gray-600">{entry.createdBy?.name || entry.createdBy?.email || 'Unknown'}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Recorded at</p>
            <p className="text-sm text-gray-500">{fmtDT(entry.createdAt)}</p>
          </div>
        </div>

        {/* Immutability notice */}
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5">
          <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
          <p className="text-[11px] text-gray-400">Append-only record — tracking entries cannot be edited or deleted.</p>
        </div>
      </div>
    </Modal>
  );
}
