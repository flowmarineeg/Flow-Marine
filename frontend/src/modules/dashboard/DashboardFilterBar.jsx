'use client';

import { useQuery } from '@tanstack/react-query';
import { useDashboardFilters } from './DashboardFilterContext';
import { roundsService }  from '@/services/rounds.service';
import { voyagesService } from '@/services/voyages.service';
import { servicesService } from '@/services/services.service';
import { agentsService }  from '@/services/agents.service';

const sc = 'text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:border-teal-500 cursor-pointer';

/**
 * Sprint 039 — Global Dashboard Filter Bar (Refinement 1). Pure shared
 * state — this widget itself fetches only the dropdown option lists,
 * never any KPI data. Round → Voyage cascades the same way every
 * existing report page's own Round→Voyage dropdown already does.
 */
export default function DashboardFilterBar() {
  const { roundId, voyageId, serviceId, agentId, dateFrom, dateTo, setFilter, clearFilters } = useDashboardFilters();

  const { data: rdData } = useQuery({
    queryKey: ['dash-rounds-dd'],
    queryFn:  () => roundsService.list({ limit: 200 }).then(r => r.data.data),
  });
  const { data: vgData } = useQuery({
    queryKey: ['dash-voyages-dd', roundId],
    queryFn:  () => voyagesService.list({ roundId, limit: 200 }).then(r => r.data.data),
    enabled:  !!roundId,
  });
  const { data: svcData } = useQuery({
    queryKey: ['dash-services-dd'],
    queryFn:  () => servicesService.listActive().then(r => r.data.data),
  });
  const { data: agData } = useQuery({
    queryKey: ['dash-agents-dd'],
    queryFn:  () => agentsService.list({ limit: 200, status: 'Active' }).then(r => r.data.data),
  });

  const rounds   = rdData?.data || rdData || [];
  const voyages  = vgData || [];
  const services = svcData || [];
  const agents   = agData?.data || agData || [];

  const hasAnyFilter = roundId || voyageId || serviceId || agentId || dateFrom || dateTo;

  return (
    <div className="card p-4 flex flex-wrap items-end gap-3">
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Round</p>
        <select value={roundId} onChange={e => setFilter('roundId', e.target.value)} className={sc}>
          <option value="">All Rounds</option>
          {rounds.map(r => <option key={r._id} value={r._id}>{r.roundNumber} — {r.roundName || '(unnamed)'}</option>)}
        </select>
      </div>
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Voyage</p>
        <select value={voyageId} onChange={e => setFilter('voyageId', e.target.value)} disabled={!roundId} className={`${sc} disabled:opacity-50`}>
          <option value="">All Voyages</option>
          {voyages.map(v => <option key={v._id} value={v._id}>{v.voyageNumber} ({v.voyageName || 'unnamed'})</option>)}
        </select>
      </div>
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Service</p>
        <select value={serviceId} onChange={e => setFilter('serviceId', e.target.value)} className={sc}>
          <option value="">All Services</option>
          {services.map(s => <option key={s._id} value={s._id}>{s.serviceCode}</option>)}
        </select>
      </div>
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Agent</p>
        <select value={agentId} onChange={e => setFilter('agentId', e.target.value)} className={sc}>
          <option value="">All Agents</option>
          {agents.map(a => <option key={a._id} value={a._id}>{a.agentCode}</option>)}
        </select>
      </div>
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">From</p>
        <input type="date" value={dateFrom} onChange={e => setFilter('dateFrom', e.target.value)}
          className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-500" />
      </div>
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">To</p>
        <input type="date" value={dateTo} onChange={e => setFilter('dateTo', e.target.value)}
          className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-500" />
      </div>
      {hasAnyFilter && (
        <button onClick={clearFilters} className="text-xs font-semibold text-gray-400 hover:text-gray-600 transition pb-2">
          Clear filters
        </button>
      )}
    </div>
  );
}
