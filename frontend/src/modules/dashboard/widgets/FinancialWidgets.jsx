'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { reportsService } from '@/services/reports.service';
import { useDashboardFilters } from '../DashboardFilterContext';
import { WidgetCard, WidgetEmptyState, WidgetSkeleton, fmtMoney, fmtNum } from './WidgetPrimitives';

// Sprint 039 — Financial widgets are inherently Round-scoped, because
// their backing function, reports.service.js#getRoundPnL, is itself
// deliberately round-scoped (Sprint 035 ADR-1 — no cross-round
// re-aggregation is invented here, per Sprint 039 ADR-3). Each widget
// shows an explicit "select a round" empty state rather than a
// fabricated fleet-wide fallback or a silent zero.

export function VoyageProfitabilityWidget() {
  const router = useRouter();
  const { roundId, voyageId } = useDashboardFilters();
  const { data, isLoading } = useQuery({
    queryKey: ['dash-round-pnl', roundId, voyageId],
    queryFn:  () => reportsService.getRoundPnL({ roundId, voyageId: voyageId || undefined }).then(r => r.data.data),
    enabled:  !!roundId,
  });
  const summary = data?.summary;

  return (
    <WidgetCard
      title="Voyage Profitability"
      action={roundId && <button onClick={() => router.push(`/reports/round-pnl?roundId=${roundId}${voyageId ? `&voyageId=${voyageId}` : ''}`)} className="text-xs text-teal-600 font-semibold hover:text-teal-800 transition">View report →</button>}
    >
      {!roundId ? (
        <WidgetEmptyState message="Select a Round in the filter bar above to see Voyage Cost, Profit, and Margin." />
      ) : isLoading ? (
        <WidgetSkeleton rows={2} height={44} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Revenue</p>
            <p className="text-sm font-bold text-teal-700">{fmtMoney(summary?.totalRevenue)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Voyage Cost</p>
            <p className="text-sm font-bold text-gray-700">{fmtMoney(summary?.totalVoyageCost)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Other Voyage Cost</p>
            <p className="text-sm font-bold text-gray-700">{fmtMoney(summary?.totalOtherVoyageCost)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Net Profit</p>
            <p className={`text-sm font-bold ${(summary?.netProfit ?? 0) >= 0 ? 'text-teal-700' : 'text-red-600'}`}>{fmtMoney(summary?.netProfit)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Profit Margin</p>
            <p className="text-sm font-bold text-gray-700">{(summary?.profitMarginPct ?? 0).toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Profit / TEU</p>
            <p className="text-sm font-bold text-gray-700">{fmtMoney(summary?.profitPerTEU)}</p>
          </div>
        </div>
      )}
    </WidgetCard>
  );
}

export function TotalExpensesWidget() {
  const router = useRouter();
  const { roundId, voyageId, dateFrom, dateTo } = useDashboardFilters();
  const { data, isLoading } = useQuery({
    queryKey: ['dash-expenses', roundId, voyageId, dateFrom, dateTo],
    queryFn:  () => reportsService.getExpenseReport({ roundId, voyageId, dateFrom, dateTo }).then(r => r.data.data),
  });
  const summary = data?.summary || [];
  const classificationSummary = data?.classificationSummary || [];
  const totalByCurrency = {};
  summary.forEach(s => { totalByCurrency[s.currency] = (totalByCurrency[s.currency] || 0) + s.total; });

  return (
    <WidgetCard
      title="Total Expenses"
      action={<button onClick={() => router.push('/reports/expenses')} className="text-xs text-teal-600 font-semibold hover:text-teal-800 transition">View report →</button>}
    >
      {isLoading ? <WidgetSkeleton rows={2} height={36} />
       : summary.length === 0 ? <WidgetEmptyState message="No expenses recorded for the current filters." />
       : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            {Object.entries(totalByCurrency).map(([cur, amt]) => (
              <div key={cur}>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Total ({cur})</p>
                <p className="text-lg font-bold text-red-600">{fmtNum(amt)}</p>
              </div>
            ))}
          </div>
          {classificationSummary.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
              {classificationSummary.map((s, i) => (
                <span key={i} className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                  s.classification === 'Voyage Cost' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-50 text-slate-600 border border-slate-200'
                }`}>
                  {s.classification}: {fmtNum(s.total)} {s.currency}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </WidgetCard>
  );
}
