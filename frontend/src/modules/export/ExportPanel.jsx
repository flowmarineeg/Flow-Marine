'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { exportService } from '@/services/export.service';
import { downloadFile, exportFilename } from '@/utils/exportHelper';
import PageHeader from '@/components/ui/PageHeader';

// ─── React Icons ──────────────────────────────────────────────────────────────
import { GiCargoShip }             from 'react-icons/gi';   // Vessels
import { FaUserTie }               from 'react-icons/fa';   // Agents
import { FaBoxOpen }               from 'react-icons/fa';   // Container Types
import { MdLabelImportant }        from 'react-icons/md';   // Expense Types
import { MdAltRoute }              from 'react-icons/md';   // Services
import { TbClockPlay }             from 'react-icons/tb';   // Rounds
import { MdOutlineSailing }        from 'react-icons/md';   // Voyages
import { FaClipboardList }         from 'react-icons/fa';   // Bookings
import { FaMoneyBillWave }         from 'react-icons/fa';   // Expenses
import { FaFileInvoiceDollar }     from 'react-icons/fa';   // Invoices
import { MdMyLocation }            from 'react-icons/md';   // Tracking History
import { MdOutlineManageSearch }   from 'react-icons/md';   // Audit Logs
import { FiCheckCircle }           from 'react-icons/fi';   // checkmark
import { LuDownload }              from 'react-icons/lu';   // download button

// ─────────────────────────────────────────────────────────────────────────────

const MODULES = [
  {
    key:   'vessels',
    label: 'Vessels',
    Icon:  GiCargoShip,
    color: 'text-blue-500',
    activeBg: 'bg-blue-50 border-blue-300',
    activeText: 'text-blue-700',
  },
  {
    key:   'agents',
    label: 'Agents',
    Icon:  FaUserTie,
    color: 'text-violet-500',
    activeBg: 'bg-violet-50 border-violet-300',
    activeText: 'text-violet-700',
  },
  {
    key:   'containerTypes',
    label: 'Container Types',
    Icon:  FaBoxOpen,
    color: 'text-orange-500',
    activeBg: 'bg-orange-50 border-orange-300',
    activeText: 'text-orange-700',
  },
  {
    key:   'expenseTypes',
    label: 'Expense Types',
    Icon:  MdLabelImportant,
    color: 'text-pink-500',
    activeBg: 'bg-pink-50 border-pink-300',
    activeText: 'text-pink-700',
  },
  {
    key:   'services',
    label: 'Services',
    Icon:  MdAltRoute,
    color: 'text-teal-500',
    activeBg: 'bg-teal-50 border-teal-300',
    activeText: 'text-teal-700',
  },
  {
    key:   'rounds',
    label: 'Rounds',
    Icon:  TbClockPlay,
    color: 'text-cyan-500',
    activeBg: 'bg-cyan-50 border-cyan-300',
    activeText: 'text-cyan-700',
  },
  {
    key:   'voyages',
    label: 'Voyages',
    Icon:  MdOutlineSailing,
    color: 'text-sky-500',
    activeBg: 'bg-sky-50 border-sky-300',
    activeText: 'text-sky-700',
  },
  {
    key:   'bookings',
    label: 'Bookings',
    Icon:  FaClipboardList,
    color: 'text-indigo-500',
    activeBg: 'bg-indigo-50 border-indigo-300',
    activeText: 'text-indigo-700',
  },
  {
    key:   'expenses',
    label: 'Expenses',
    Icon:  FaMoneyBillWave,
    color: 'text-green-500',
    activeBg: 'bg-green-50 border-green-300',
    activeText: 'text-green-700',
  },
  {
    key:   'invoices',
    label: 'Invoices',
    Icon:  FaFileInvoiceDollar,
    color: 'text-emerald-500',
    activeBg: 'bg-emerald-50 border-emerald-300',
    activeText: 'text-emerald-700',
  },
  {
    key:   'tracking',
    label: 'Tracking History',
    Icon:  MdMyLocation,
    color: 'text-rose-500',
    activeBg: 'bg-rose-50 border-rose-300',
    activeText: 'text-rose-700',
  },
  {
    key:   'auditLogs',
    label: 'Audit Logs',
    Icon:  MdOutlineManageSearch,
    color: 'text-amber-500',
    activeBg: 'bg-amber-50 border-amber-300',
    activeText: 'text-amber-700',
  },
];

export default function ExportPanel() {
  const [selected, setSelected] = useState(new Set());
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [loading,  setLoading]  = useState(false);

  const toggle = (key) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const toggleAll = () =>
    setSelected(prev =>
      prev.size === MODULES.length ? new Set() : new Set(MODULES.map(m => m.key))
    );

  const handleExport = async () => {
    if (selected.size === 0) return toast.error('Select at least one module');

    setLoading(true);
    const filters = {};
    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo)   filters.dateTo   = dateTo;

    const exports = [...selected].map(module => ({ module, filters, selectedIds: [] }));

    try {
      if (exports.length === 1) {
        const res = await exportService.exportExcel({ module: exports[0].module, filters, selectedIds: [] });
        downloadFile(res.data, exportFilename(exports[0].module));
        toast.success('Excel downloaded');
      } else {
        const res = await exportService.exportZip(exports);
        downloadFile(res.data, exportFilename('logistics-bulk', 'zip'));
        toast.success(`ZIP downloaded — ${exports.length} modules`);
      }
    } catch (e) {
      const msg = await exportService.readBlobError(e);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fadeIn max-w-3xl">
      <PageHeader
        title="Bulk Export"
        subtitle="Select one or more modules to download as Excel or ZIP"
      />

      {/* ── Module grid ────────────────────────────────────────────────────── */}
      <div className="card p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
            Select Modules
          </p>
          <button
            onClick={toggleAll}
            className="text-xs font-semibold text-teal-600 hover:text-teal-800 transition"
          >
            {selected.size === MODULES.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {MODULES.map(({ key, label, Icon, color, activeBg, activeText }) => {
            const active = selected.has(key);
            return (
              <button
                key={key}
                onClick={() => toggle(key)}
                className={`
                  group relative flex items-center gap-3 px-3.5 py-3 rounded-xl
                  text-sm font-medium border transition-all duration-150
                  ${active
                    ? `${activeBg} ${activeText} shadow-sm`
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50/80'
                  }
                `}
              >
                {/* Icon */}
                <span className={`flex-shrink-0 text-xl ${active ? activeText : color} transition-colors`}>
                  <Icon />
                </span>

                {/* Label */}
                <span className="text-[13px] leading-tight text-left">{label}</span>

                {/* Check badge */}
                {active && (
                  <span className="ml-auto flex-shrink-0">
                    <FiCheckCircle className={`w-4 h-4 ${activeText}`} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Selection count strip */}
        {selected.size > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              {[...selected].map(key => {
                const mod = MODULES.find(m => m.key === key);
                return (
                  <span
                    key={key}
                    className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${mod.activeBg} ${mod.activeText}`}
                  >
                    <mod.Icon className="w-2.5 h-2.5" />
                    {mod.label}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Date range filter ──────────────────────────────────────────────── */}
      <div className="card p-5 mb-5">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">
          Date Range Filter
          <span className="ml-1.5 text-gray-300 font-normal normal-case">(optional)</span>
        </p>
        <p className="text-xs text-gray-400 mb-3">
          Applied to modules that support date filtering — expenses, invoices, rounds, audit logs, etc.
        </p>
        <div className="flex flex-wrap gap-3 items-center">
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition"
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="self-end mb-px text-xs text-gray-400 hover:text-gray-600 transition"
            >
              Clear dates
            </button>
          )}
        </div>
      </div>

      {/* ── Summary + download ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-5 py-4">
        <div>
          {selected.size === 0 ? (
            <p className="text-sm text-gray-400">No modules selected</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-700">
                {selected.size} module{selected.size !== 1 ? 's' : ''} selected
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {selected.size === 1
                  ? 'Will download as Excel (.xlsx)'
                  : `Will bundle ${selected.size} Excel files into a ZIP`}
              </p>
            </>
          )}
        </div>

        <button
          onClick={handleExport}
          disabled={loading || selected.size === 0}
          className="btn btn-primary btn-md flex items-center gap-2 disabled:opacity-50"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Preparing…
            </>
          ) : (
            <>
              <LuDownload className="w-4 h-4" />
              {selected.size > 1 ? 'Download ZIP' : 'Download Excel'}
            </>
          )}
        </button>
      </div>

      {selected.size > 5 && (
        <p className="text-xs text-amber-500 mt-3 text-center">
          ⚠ Exporting many large modules may take a moment to prepare.
        </p>
      )}
    </div>
  );
}
