'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { routesService }    from '@/services/routes.service';
import { locationsService } from '@/services/locations.service';
import { agentsService }    from '@/services/agents.service';

// ─── Empty leg factory ────────────────────────────────────────────────────────
const emptyLeg = () => ({
  _key:       Math.random().toString(36).slice(2),
  countryId:  '',
  cityId:     '',
  portId:     '',
  terminalId: '',
  agentId:    '',
});

// ─── Shared select class ──────────────────────────────────────────────────────
const sc = 'w-full text-[13px] border border-gray-200 rounded-md px-3 py-2 bg-white text-gray-800 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition disabled:opacity-50 disabled:cursor-not-allowed';

// ─── Single leg row ───────────────────────────────────────────────────────────
function LegRow({ leg, index, total, onChange, onRemove, disabled, agents }) {
  const { data: countries } = useQuery({
    queryKey: ['loc', 'countries'],
    queryFn:  () => locationsService.getCountries().then(r => r.data.data),
    staleTime: 5 * 60 * 1000,
  });
  const { data: cities } = useQuery({
    queryKey: ['loc', 'cities', leg.countryId],
    queryFn:  () => locationsService.getCities({ countryId: leg.countryId }).then(r => r.data.data),
    enabled:  !!leg.countryId,
  });
  const { data: ports } = useQuery({
    queryKey: ['loc', 'ports', leg.cityId],
    queryFn:  () => locationsService.getPorts({ cityId: leg.cityId }).then(r => r.data.data),
    enabled:  !!leg.cityId,
  });
  const { data: terminals } = useQuery({
    queryKey: ['loc', 'terminals', leg.portId],
    queryFn:  () => locationsService.getTerminals({ portId: leg.portId }).then(r => r.data.data),
    enabled:  !!leg.portId,
  });

  const update       = (field, val) => onChange(index, { ...leg, [field]: val });
  const handleCountry = (e) => onChange(index, { ...leg, countryId: e.target.value, cityId: '', portId: '', terminalId: '' });
  const handleCity    = (e) => onChange(index, { ...leg, cityId: e.target.value, portId: '', terminalId: '' });
  const handlePort    = (e) => onChange(index, { ...leg, portId: e.target.value, terminalId: '' });

  return (
    <div className="relative flex gap-3 items-start bg-white border border-gray-200 rounded-xl p-4 hover:border-teal-300 hover:shadow-sm transition-all group">

      {/* Sequence badge */}
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-teal-50 border border-teal-200 flex items-center justify-center mt-0.5">
        <span className="text-[11px] font-bold text-teal-700">{index + 1}</span>
      </div>

      {/* Fields grid — 5 columns on large screens */}
      <div className="flex-1 grid grid-cols-2 gap-3 lg:grid-cols-5">

        {/* Country */}
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Country <span className="text-red-400">*</span>
          </label>
          <select value={leg.countryId} onChange={handleCountry} disabled={disabled} className={sc}>
            <option value="">Country…</option>
            {(countries || []).map(c => (
              <option key={c._id} value={c._id}>{c.name} ({c.code})</option>
            ))}
          </select>
        </div>

        {/* City */}
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            City <span className="text-red-400">*</span>
          </label>
          <select value={leg.cityId} onChange={handleCity} disabled={disabled || !leg.countryId} className={sc}>
            <option value="">City…</option>
            {(cities || []).map(c => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Port */}
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Port <span className="text-red-400">*</span>
          </label>
          <select value={leg.portId} onChange={handlePort} disabled={disabled || !leg.cityId} className={sc}>
            <option value="">Port…</option>
            {(ports || []).map(p => (
              <option key={p._id} value={p._id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Terminal */}
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Terminal
            <span className="text-gray-300 ml-1 font-normal">(opt)</span>
          </label>
          <select
            value={leg.terminalId}
            onChange={e => update('terminalId', e.target.value)}
            disabled={disabled || !leg.portId}
            className={sc}
          >
            <option value="">No terminal</option>
            {(terminals || []).map(t => (
              <option key={t._id} value={t._id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* Agent */}
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Agent
            <span className="text-gray-300 ml-1 font-normal">(opt)</span>
          </label>
          <select
            value={leg.agentId}
            onChange={e => update('agentId', e.target.value)}
            disabled={disabled}
            className={sc}
          >
            <option value="">No agent</option>
            {(agents || []).map(a => (
              <option key={a._id} value={a._id}>
                {a.agentCode ? `${a.agentCode} — ` : ''}{a.agentName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Remove button */}
      {total > 2 && !disabled && (
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="flex-shrink-0 w-7 h-7 rounded-full bg-red-50 text-red-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-red-100 hover:text-red-600 mt-0.5"
          title="Remove leg"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      )}

      {/* Connector line */}
      {index < total - 1 && (
        <div className="absolute left-[26px] -bottom-3 w-px h-3 bg-teal-200" />
      )}
    </div>
  );
}

// ─── Main RouteEditor ─────────────────────────────────────────────────────────
export default function RouteEditor({ serviceId, serviceName, serviceCode }) {
  const qc = useQueryClient();
  const [legs,     setLegs]     = useState([emptyLeg(), emptyLeg()]);
  const [blockMsg, setBlockMsg] = useState('');

  // Active agents for all leg rows (shared query)
  const { data: agentsData } = useQuery({
    queryKey: ['agents-active-dropdown'],
    queryFn:  () => agentsService.list({ limit: 200, status: 'Active' }).then(r => r.data.data),
    staleTime: 5 * 60 * 1000,
  });
  const agents = agentsData || [];

  // Load existing route
  const { isLoading } = useQuery({
    queryKey: ['route', serviceId],
    queryFn:  () => routesService.getRoute(serviceId).then(r => r.data.data),
    onSuccess: (data) => {
      if (data.legs && data.legs.length >= 2) {
        setLegs(data.legs.map(l => ({
          _key:       l._id,
          countryId:  l.countryId?._id  || l.countryId  || '',
          cityId:     l.cityId?._id     || l.cityId     || '',
          portId:     l.portId?._id     || l.portId     || '',
          terminalId: l.terminalId?._id || l.terminalId || '',
          agentId:    l.agentId?._id    || l.agentId    || '',
        })));
      }
    },
  });

  const saveMutation = useMutation({
    mutationFn: (payload) => routesService.saveRoute(serviceId, payload),
    onSuccess: () => {
      toast.success('Route saved successfully');
      qc.invalidateQueries(['route', serviceId]);
      qc.invalidateQueries(['services']);
    },
    onError: (e) => {
      const msg = e.response?.data?.message || 'Save failed';
      setBlockMsg(msg);
      toast.error(msg);
    },
  });

  const handleChange = useCallback((idx, updated) => {
    setLegs(prev => prev.map((l, i) => i === idx ? updated : l));
    setBlockMsg('');
  }, []);

  const handleRemove = (idx) => setLegs(prev => prev.filter((_, i) => i !== idx));
  const handleAdd    = () => setLegs(prev => [...prev, emptyLeg()]);

  const handleSave = () => {
    for (let i = 0; i < legs.length; i++) {
      if (!legs[i].countryId || !legs[i].cityId || !legs[i].portId) {
        toast.error(`Leg ${i + 1}: country, city and port are required`);
        return;
      }
    }
    if (legs.length < 2) { toast.error('Route must have at least 2 legs'); return; }

    saveMutation.mutate(legs.map(l => ({
      countryId:  l.countryId,
      cityId:     l.cityId,
      portId:     l.portId,
      terminalId: l.terminalId || null,
      agentId:    l.agentId    || null,
    })));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <svg className="animate-spin w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        <span className="text-sm">Loading route…</span>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs font-bold text-teal-600 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded">
              {serviceCode}
            </span>
            <span className="text-sm text-gray-400">Route Editor</span>
          </div>
          <h2 className="text-base font-semibold text-gray-800">{serviceName}</h2>
        </div>
        <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
          {legs.length} leg{legs.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Block warning */}
      {blockMsg && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
          <p className="text-sm text-amber-700">{blockMsg}</p>
        </div>
      )}

      {/* Min 2 legs notice */}
      {legs.length < 2 && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
          <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span className="text-sm text-red-600">A route requires at least 2 port calls</span>
        </div>
      )}

      {/* Leg rows */}
      <div className="flex flex-col gap-3 mb-5">
        {legs.map((leg, idx) => (
          <LegRow
            key={leg._key}
            leg={leg}
            index={idx}
            total={legs.length}
            onChange={handleChange}
            onRemove={handleRemove}
            disabled={saveMutation.isPending}
            agents={agents}
          />
        ))}
      </div>

      {/* Add port call */}
      <button
        type="button"
        onClick={handleAdd}
        disabled={saveMutation.isPending}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-400 hover:border-teal-400 hover:text-teal-600 hover:bg-teal-50 transition-all mb-6 disabled:opacity-50"
      >
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" d="M12 5v14M5 12h14"/>
        </svg>
        Add Port Call
      </button>

      {/* Save */}
      <div className="flex items-center justify-between border-t border-gray-100 pt-4">
        <p className="text-xs text-gray-400">
          {legs.length < 2 ? 'Add at least 2 port calls to save' : `${legs.length} port calls — ready to save`}
        </p>
        <button
          type="button"
          onClick={handleSave}
          disabled={saveMutation.isPending || legs.length < 2}
          className="btn btn-primary btn-md flex items-center gap-2"
        >
          {saveMutation.isPending ? (
            <>
              <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Saving…
            </>
          ) : (
            <>
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" d="M5 13l4 4L19 7"/>
              </svg>
              Save Route
            </>
          )}
        </button>
      </div>
    </div>
  );
}
