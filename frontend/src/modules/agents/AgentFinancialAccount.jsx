'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { agentsService }  from '@/services/agents.service';
import { invoicesService } from '@/services/invoices.service';
import { paymentsService } from '@/services/payments.service';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import BookingsSummaryCard from '@/components/ui/BookingsSummaryCard';

// Sprint 033 — Agent Details is the financial engine's primary consumer.
// This is a connected account statement (Agent → Round → Voyage → Final
// Loading Bookings → Invoice → Payments), not a set of unrelated tabs —
// every level states its own Total Freight / Total Paid / Remaining
// Balance before the user drills further.

const fmtMoney = (n) => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—';
const fmtDate  = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const TABS = ['Overview', 'Financial Summary', 'Rounds', 'Voyages', 'Bookings', 'Invoices', 'Payments'];

// ── Small building blocks ──────────────────────────────────────────────────
function Kpi({ label, value, tone = 'gray' }) {
  const tones = {
    gray:  'text-gray-800',
    green: 'text-green-700',
    amber: 'text-amber-700',
    red:   'text-red-600',
    teal:  'text-teal-700',
  };
  return (
    <div className="card p-4">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-xl font-bold ${tones[tone]}`}>{value}</p>
    </div>
  );
}

// A Total Freight / Total Paid / Remaining Balance strip — reused at every
// level of the statement (agent, round, voyage) per the "Final Revision
// Required" refinement: state the numbers before drilling further.
function MoneyStrip({ freight, paid, remaining, size = 'sm' }) {
  const big = size === 'lg';
  return (
    <div className={`flex flex-wrap items-center gap-x-6 gap-y-1 ${big ? 'text-sm' : 'text-xs'}`}>
      <span className="text-gray-500">Total Freight <b className="text-gray-800 font-semibold ml-1">{fmtMoney(freight)}</b></span>
      <span className="text-gray-500">Total Paid <b className="text-green-700 font-semibold ml-1">{fmtMoney(paid)}</b></span>
      <span className="text-gray-500">Remaining <b className={`font-semibold ml-1 ${remaining > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{fmtMoney(remaining)}</b></span>
    </div>
  );
}

// ── Rounds level — the primary statement surface (expand → Voyages → Bookings) ─
function RoundsStatement({ rounds }) {
  const [openRound, setOpenRound] = useState(null);
  const [openVoyage, setOpenVoyage] = useState(null);

  if (!rounds.length) return <p className="text-sm text-gray-400 italic py-8 text-center">No Final Loading bookings for this agent yet.</p>;

  return (
    <div className="flex flex-col gap-3">
      {rounds.map(r => {
        const isOpen = openRound === String(r.roundId);
        return (
          <div key={r.roundId} className="card overflow-hidden">
            <button
              onClick={() => { setOpenRound(isOpen ? null : String(r.roundId)); setOpenVoyage(null); }}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50/60 transition text-left"
            >
              <div className="flex items-center gap-2">
                <svg width="12" height="12" className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" d="M9 5l7 7-7 7" />
                </svg>
                <span className="mono text-sm font-bold text-gray-700">{r.roundNumber}</span>
                <span className="text-[11px] text-gray-400">{r.roundName || '(unnamed)'}</span>
                <span className="text-[11px] text-gray-400">{r.voyages.length} voyage{r.voyages.length !== 1 ? 's' : ''}</span>
              </div>
              <MoneyStrip freight={r.totalFreight} paid={r.totalPaid} remaining={r.remaining} />
            </button>

            {isOpen && (
              <div className="border-t border-gray-100 px-5 py-3 flex flex-col gap-2 bg-gray-50/40">
                {r.voyages.map(v => {
                  const vOpen = openVoyage === String(v.voyageId);
                  return (
                    <div key={v.voyageId} className="bg-white border border-gray-100 rounded-lg overflow-hidden">
                      <button
                        onClick={() => setOpenVoyage(vOpen ? null : String(v.voyageId))}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition text-left"
                      >
                        <div className="flex items-center gap-2">
                          <svg width="10" height="10" className={`transition-transform ${vOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" d="M9 5l7 7-7 7" />
                          </svg>
                          <span className="mono text-xs font-bold text-gray-700">{v.voyageNumber}</span>
                          <span className="text-[10px] text-gray-400">{v.voyageName || '(unnamed)'}</span>
                          <span className="text-[10px] text-gray-400">{v.bookings.length} booking{v.bookings.length !== 1 ? 's' : ''}</span>
                        </div>
                        <MoneyStrip freight={v.totalFreight} paid={v.totalPaid} remaining={v.remaining} />
                      </button>
                      {/* Sprint 044 — same aggregate summary shape as the
                          Bookings tab / invoice creation overview, not a
                          per-booking table: booking count, total revenue,
                          per-container-type breakdown. */}
                      {vOpen && (
                        <div className="border-t border-gray-100 p-3">
                          <BookingsSummaryCard
                            bookings={v.bookings}
                            getAmount={(b) => b.totalFreight}
                            emptyMessage="No Final Loading bookings for this voyage."
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Flat ledger tabs (Voyages / Bookings) ──────────────────────────────────
function VoyagesLedger({ rounds }) {
  const rows = rounds.flatMap(r => r.voyages.map(v => ({ ...v, roundNumber: r.roundNumber, roundName: r.roundName })));
  if (!rows.length) return <p className="text-sm text-gray-400 italic py-8 text-center">No voyages yet.</p>;
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="table-header">{['Round', 'Voyage', 'Bookings', 'Total Freight', 'Total Paid', 'Remaining'].map(h => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(v => (
              <tr key={v.voyageId} className="table-row">
                <td className="mono text-xs font-semibold text-gray-600">{v.roundNumber}<p className="font-normal text-gray-400">{v.roundName || '(unnamed)'}</p></td>
                <td className="mono text-xs font-bold text-teal-600">{v.voyageNumber}<p className="font-normal text-gray-400">{v.voyageName || '(unnamed)'}</p></td>
                <td className="text-xs text-gray-600">{v.bookings.length}</td>
                <td className="text-xs text-gray-700">{fmtMoney(v.totalFreight)}</td>
                <td className="text-xs text-green-700">{fmtMoney(v.totalPaid)}</td>
                <td className={`text-xs font-medium ${v.remaining > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{fmtMoney(v.remaining)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Sprint 044 — replaced the old one-row-per-booking flat table with the
// same aggregate summary shape used by invoice creation's Voyage/Round
// scope (BookingsSummaryCard): booking count, total revenue, and a
// per-container-type breakdown. No individual booking numbers here
// anymore — that per-booking drill-down still lives one level up, in the
// Rounds tab's expandable Round -> Voyage -> Booking statement (BookingRow
// inside RoundsStatement, untouched by this sprint).
function BookingsLedger({ rounds }) {
  const rows = rounds.flatMap(r => r.voyages.flatMap(v => v.bookings));
  return (
    <BookingsSummaryCard
      bookings={rows}
      getAmount={(b) => b.totalFreight}
      emptyMessage="No Final Loading bookings yet."
    />
  );
}

function InvoicesTab({ agentId, router }) {
  const { data, isLoading } = useQuery({
    queryKey: ['agent-invoices', agentId],
    queryFn: () => invoicesService.list({ agentId, limit: 50 }).then(r => r.data.data),
  });
  if (isLoading) return <LoadingSpinner />;
  const rows = data || [];
  if (!rows.length) return <p className="text-sm text-gray-400 italic py-8 text-center">No invoices yet.</p>;
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="table-header">{['Invoice No', 'Type', 'Date', 'Total', 'Paid', 'Balance', 'Status'].map(h => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(inv => (
              <tr key={inv._id} className="table-row cursor-pointer" onClick={() => router.push(`/invoices/${inv._id}`)}>
                <td><span className="mono text-xs font-bold text-teal-600">{inv.invoiceNumber}</span></td>
                <td className="text-xs text-gray-600">{inv.invoiceType}</td>
                <td className="text-xs text-gray-600">{fmtDate(inv.invoiceDate)}</td>
                <td className="text-xs text-gray-700">{fmtMoney(inv.totalAmount)}</td>
                <td className="text-xs text-green-700">{fmtMoney(inv.paidAmount)}</td>
                <td className="text-xs text-amber-700">{fmtMoney(inv.balanceAmount)}</td>
                <td><Badge label={inv.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaymentsTab({ agentId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['agent-payments', agentId],
    queryFn: () => paymentsService.list({ agentId, limit: 50 }).then(r => r.data.data),
  });
  if (isLoading) return <LoadingSpinner />;
  const rows = data || [];
  if (!rows.length) return <p className="text-sm text-gray-400 italic py-8 text-center">No payments recorded yet.</p>;
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="table-header">{['Date', 'Invoice', 'Amount', 'Method', 'Reference'].map(h => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(p => (
              <tr key={p._id} className="table-row">
                <td className="text-xs text-gray-600">{fmtDate(p.paymentDate)}</td>
                <td className="mono text-xs font-semibold text-teal-600">{p.invoiceId?.invoiceNumber || '—'}</td>
                <td className="text-xs text-gray-700 font-medium">{fmtMoney(p.amount)}</td>
                <td className="text-xs text-gray-600">{p.method}</td>
                <td className="text-xs text-gray-400">{p.reference || '—'}</td>
                {/* <td className="text-xs text-gray-500">
                  {(p.allocations || []).map(a => a.bookingId?.bookingNumber).filter(Boolean).join(', ') || '—'}
                </td> */}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AgentFinancialAccount({ id, onEdit }) {
  const router = useRouter();
  const [tab, setTab] = useState('Overview');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['agent-financial-account', id],
    queryFn: () => agentsService.getFinancialAccount(id).then(r => r.data.data),
  });

  if (isLoading) return <LoadingSpinner fullPage />;
  if (isError || !data) {
    return (
      <div className="flex flex-col items-center py-16 text-gray-400">
        <p className="text-sm">{error?.response?.data?.message || 'Failed to load agent financial account'}</p>
      </div>
    );
  }

  const { agent, kpis, rounds } = data;

  return (
    <div className="animate-fadeIn flex flex-col gap-5">
      {/* Statement header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="mono text-xl font-bold text-gray-800">{agent.agentCode}</span>
            <span className="text-gray-300">&middot;</span>
            <span className="text-xl font-semibold text-gray-700">{agent.agentName}</span>
            <Badge label={agent.status} />
          </div>
          <MoneyStrip freight={kpis.totalRevenue} paid={kpis.totalPaid} remaining={kpis.remainingBalance} size="lg" />
        </div>
        <button onClick={onEdit} className="btn btn-secondary btn-md">Edit Agent</button>
      </div>

      {/* Tab strip — same pattern as BookingList.jsx Operational/Manual tabs */}
      <div className="flex items-center gap-1 border-b border-gray-100 overflow-x-auto">
        {TABS.map(tb => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap border-b-2 transition ${
              tab === tb ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {tb}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 card p-5">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">Agent Details</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
              {[
                { label: 'Agent Code', val: agent.agentCode },
                { label: 'Agent Name', val: agent.agentName },
                { label: 'Country', val: agent.country },
                { label: 'City', val: agent.city },
                { label: 'Port', val: agent.port },
                { label: 'Status', val: agent.status },
              ].map(({ label, val }) => (
                <div key={label}>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                  <p className="text-[13px] font-medium text-gray-700">{val || <span className="text-gray-300">—</span>}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <Kpi label="Total Freight" value={fmtMoney(kpis.totalRevenue)} />
            <Kpi label="Total Paid" value={fmtMoney(kpis.totalPaid)} tone="green" />
            <Kpi label="Remaining Balance" value={fmtMoney(kpis.remainingBalance)} tone="amber" />
          </div>
        </div>
      )}

      {tab === 'Financial Summary' && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Total Revenue" value={fmtMoney(kpis.totalRevenue)} />
            <Kpi label="Total Invoiced" value={fmtMoney(kpis.totalInvoiced)} tone="teal" />
            <Kpi label="Total Paid" value={fmtMoney(kpis.totalPaid)} tone="green" />
            <Kpi label="Outstanding Balance" value={fmtMoney(kpis.outstandingBalance)} tone="amber" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <Kpi label="Remaining Balance (Overall)" value={fmtMoney(kpis.remainingBalance)} tone="amber" />
            <Kpi label="Bookings Awaiting Invoice" value={`${kpis.bookingsAwaitingInvoiceCount} (${fmtMoney(kpis.bookingsAwaitingInvoiceFreight)})`} />
            <Kpi label="Bookings Awaiting Payment" value={kpis.bookingsAwaitingPaymentCount} tone="amber" />
          </div>
          <div className="card p-5">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Payment Progress</p>
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-teal-500 transition-all" style={{ width: `${Math.min(100, Math.round(kpis.paymentProgress * 100))}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-2">{Math.round(kpis.paymentProgress * 100)}% of invoiced amount paid</p>
          </div>
        </div>
      )}

      {tab === 'Rounds'   && <RoundsStatement rounds={rounds} />}
      {tab === 'Voyages'  && <VoyagesLedger rounds={rounds} />}
      {tab === 'Bookings' && <BookingsLedger rounds={rounds} />}
      {tab === 'Invoices' && <InvoicesTab agentId={id} router={router} />}
      {tab === 'Payments' && <PaymentsTab agentId={id} />}
    </div>
  );
}
