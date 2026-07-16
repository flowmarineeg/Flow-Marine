'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsService }  from '@/services/reports.service';
import { voyagesService }  from '@/services/voyages.service';
import { agentsService }   from '@/services/agents.service';
import { servicesService } from '@/services/services.service';
import { BOOKING_STATUS }  from '@/utils/constants';
import ReportLayout        from './ReportLayout';
import { ReportStatCard, ReportEmptyState, rsc, fmtMoney, fmtNum } from './reportHelpers';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Badge from '@/components/ui/Badge';

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—';

export default function BookingReport() {
  const [filters, setFilters] = useState({ voyageId: '', agentId: '', status: '', serviceId: '', dateFrom: '', dateTo: '' });
  const [run, setRun] = useState(false);

  const { data: vgData }  = useQuery({ queryKey: ['voyages-dd'],           queryFn: () => voyagesService.list({ limit: 200 }).then(r => r.data.data) });
  const { data: agData }  = useQuery({ queryKey: ['agents-dd'],            queryFn: () => agentsService.list({ limit: 200, status: 'Active' }).then(r => r.data.data) });
  const { data: svcData } = useQuery({ queryKey: ['services-active-dropdown'], queryFn: () => servicesService.listActive().then(r => r.data.data) });
  const voyages  = vgData  || [];
  const agents   = agData  || [];
  const services = svcData || [];

  const { data, isLoading } = useQuery({
    queryKey: ['report-bookings', filters],
    queryFn:  () => reportsService.getBookingReport({ ...filters, limit: 200 }).then(r => r.data.data),
    enabled:  run,
  });

  const rows    = data?.rows    || [];
  const summary = data?.summary || {};

  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  return (
    <ReportLayout
      title="Booking Report"
      subtitle="Filtered view of cargo bookings with freight totals"
      filters={
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Service</p>
            <select value={filters.serviceId} onChange={e => set('serviceId', e.target.value)} className={rsc}>
              <option value="">All Services</option>
              {services.map(s => <option key={s._id} value={s._id}>{s.serviceCode}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Voyage</p>
            <select value={filters.voyageId} onChange={e => set('voyageId', e.target.value)} className={rsc}>
              <option value="">All Voyages</option>
              {voyages.map(v => <option key={v._id} value={v._id}>{v.voyageNumber}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Agent</p>
            <select value={filters.agentId} onChange={e => set('agentId', e.target.value)} className={rsc}>
              <option value="">All Agents</option>
              {agents.map(a => <option key={a._id} value={a._id}>{a.agentCode}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Status</p>
            <select value={filters.status} onChange={e => set('status', e.target.value)} className={rsc}>
              <option value="">All</option>
              {BOOKING_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">From</p>
            <input type="date" value={filters.dateFrom} onChange={e => set('dateFrom', e.target.value)}
              className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-500" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">To</p>
            <input type="date" value={filters.dateTo} onChange={e => set('dateTo', e.target.value)}
              className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-500" />
          </div>
          <button onClick={() => setRun(true)} className="btn btn-primary btn-md">Run Report</button>
        </div>
      }
      summary={rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <ReportStatCard label="Bookings"      value={fmtNum(summary.count)}        />
          <ReportStatCard label="Total Freight" value={fmtMoney(summary.totalFreight)} accent />
          <ReportStatCard label="Total Units"   value={fmtNum(summary.totalQty)}     />
          <ReportStatCard label="Total Slots"   value={fmtNum(summary.totalSlots)}   />
        </div>
      )}
    >
      {isLoading ? <LoadingSpinner fullPage /> :
       !run ? (
        <div className="card flex items-center justify-center py-16 text-gray-400">
          <p className="text-sm">Set filters and click "Run Report".</p>
        </div>
       ) : rows.length === 0 ? <ReportEmptyState /> : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="table-header">
                  {['Booking No','Voyage','Agent','Shipper','Consignee','Container','Qty','Freight','Status','Date'].map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map(b => (
                  <tr key={b._id} className="table-row">
                    <td><span className="mono text-xs font-bold text-teal-600">{b.bookingNumber}</span></td>
                    <td><span className="mono text-xs text-gray-500">{b.voyageId?.voyageNumber}</span></td>
                    <td className="text-xs text-gray-500">{b.agentId?.agentName}</td>
                    <td className="text-xs text-gray-700 max-w-[120px] truncate">{b.shipper}</td>
                    <td className="text-xs text-gray-500 max-w-[120px] truncate">{b.consignee}</td>
                    <td><span className="mono text-xs text-gray-500">{b.containerTypeId?.code}</span></td>
                    <td className="text-xs text-gray-600">{fmtNum(b.quantity)}</td>
                    <td><span className="mono text-xs font-semibold text-teal-700">{fmtMoney(b.totalFreight)}</span></td>
                    <td><Badge label={b.status} /></td>
                    <td className="text-xs text-gray-400">{fmt(b.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ReportLayout>
  );
}
