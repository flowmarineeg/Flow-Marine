'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePermission } from '@/context/PermissionContext';
import { getVoyageLabel } from '@/utils/voyageLabel';
import FormPage from '@/components/ui/FormPage';
import BookingForm from '@/modules/bookings/BookingForm';
import ManualBookingForm from '@/modules/bookings/ManualBookingForm';

const REASONS = {
  VOYAGE_CANCELLED:   'This voyage is Cancelled.',
  VOYAGE_COMPLETED:   'This voyage is Completed.',
  ROUND_CLOSED:       'The round is closed.',
  ROUND_NOT_BOOKABLE: 'The round is Cancelled or Completed, so it cannot take bookings.',
};

const ACTIONS = [
  { key: 'estimate',    label: 'Add Estimated Booking',    title: 'New Estimated Booking', primary: false },
  { key: 'operational', label: 'Add Operational Booking',  title: 'New Booking',           primary: true  },
  { key: 'allocation',  label: 'Allocation',               title: 'New Allocation',        primary: false },
];

/**
 * Quick actions of the Voyage page: the booking forms opened with this voyage fixed (presets).
 * Each button is disabled, with the reason shown, when the summary says canBook is false, the voyage has fewer than
 * two port calls, or the user has no bookings:create. The server stays the final judge. After a save the summary,
 * the voyage and both booking lists are refreshed.
 */
export default function VoyageQuickActions({ voyage, summary }) {
  const qc = useQueryClient();
  const { can } = usePermission();
  const [open, setOpen] = useState(null); // 'estimate' | 'operational' | 'allocation' | null

  const calls = (summary?.ports || []).map(p => ({ index: p.index, legKey: p.legKey, portId: p.portId, name: p.name, code: p.code }));
  const actions = summary?.actions;

  let reason = null;
  if (!can('bookings', 'create')) reason = 'You do not have permission to create bookings.';
  else if (!summary) reason = 'The voyage totals are not loaded yet.';
  else if (actions && !actions.canBook) reason = REASONS[actions.reason] || 'Bookings are closed for this voyage.';
  else if (calls.length < 2) reason = 'This voyage has fewer than two port calls.';
  const disabled = !!reason;

  const fixed = {
    round: { _id: voyage.round?._id, roundNumber: voyage.round?.roundNumber, roundName: voyage.round?.roundName },
    voyage: { _id: voyage._id, voyageNumber: voyage.voyageNumber, voyageName: voyage.voyageName, direction: voyage.direction },
    calls,
    nextIndex: summary?.nextPort?.next?.index ?? null,
  };

  const done = () => {
    setOpen(null);
    qc.invalidateQueries({ queryKey: ['voyage-summary', voyage._id] });
    qc.invalidateQueries({ queryKey: ['voyage', voyage._id] });
    qc.invalidateQueries({ queryKey: ['bookings'] });
    qc.invalidateQueries({ queryKey: ['manual-bookings'] });
  };
  const close = () => setOpen(null);
  const current = ACTIONS.find(a => a.key === open);

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        {ACTIONS.map(a => (
          <button
            key={a.key}
            type="button"
            disabled={disabled}
            title={reason || a.label}
            onClick={() => setOpen(a.key)}
            className={`btn btn-sm ${a.primary ? 'btn-primary' : 'btn-secondary'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {a.key !== 'allocation' && '+ '}{a.label}
          </button>
        ))}
      </div>
      {disabled && <p className="text-xs text-gray-400 mt-1.5">Quick actions are off: {reason}</p>}

      <FormPage open={!!open} onClose={close} title={`${current?.title || ''} — ${getVoyageLabel(voyage) || ''}`} size="lg">
        {open === 'operational' && <BookingForm presets={{ fixed }} onSuccess={done} onCancel={close} />}
        {(open === 'estimate' || open === 'allocation') && (
          <ManualBookingForm presets={{ fixed, kind: open === 'allocation' ? 'Allocation' : 'Estimate' }} onSuccess={done} onCancel={close} />
        )}
      </FormPage>
    </div>
  );
}
