'use client';

import { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { exportService } from '../../services/export.service';
import { downloadFile, exportFilename } from '../../utils/exportHelper';
import { usePermission } from '@/context/PermissionContext';

/**
 * Reusable export dropdown button.
 * Sprint019: hidden unless user has can('export','read') AND can(module,'export')
 *
 * Props:
 *   module       string           – module name matching backend COLUMNS key
 *   filters      object           – current list filter state
 *   selectedIds  string[]         – currently checked row IDs
 *   onClear      () => void       – clears selection after export
 */
export default function ExportButton({ module, filters = {}, selectedIds = [], onClear }) {
  const { can }     = usePermission();
  const [open,      setOpen]      = useState(false);
  const [loading,   setLoading]   = useState('');   // 'all' | 'selected' | ''
  const menuRef = useRef(null);

  // Hide entirely if user lacks export permission
  if (!can('export', 'read') || !can(module, 'export')) return null;

  // Close menu on outside click
  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const run = async (mode) => {
    setOpen(false);
    setLoading(mode);
    const ids = mode === 'selected' ? selectedIds : [];
    try {
      const res = await exportService.exportExcel({ module, filters, selectedIds: ids });
      downloadFile(res.data, exportFilename(module));
      toast.success(`Exported ${res.headers?.['x-export-count'] ?? ''} rows`);
      if (mode === 'selected') onClear?.();
    } catch (e) {
      const msg = await exportService.readBlobError(e);
      toast.error(msg);
    } finally {
      setLoading('');
    }
  };

  const isLoading = !!loading;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={isLoading}
        className="btn btn-secondary btn-sm flex items-center gap-1.5"
      >
        {isLoading ? (
          <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
        ) : (
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
          </svg>
        )}
        {loading === 'all' ? 'Exporting…' : loading === 'selected' ? 'Exporting…' : 'Export'}
        {!isLoading && (
          <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" d="M19 9l-7 7-7-7"/>
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden py-1">
          <button
            onClick={() => run('all')}
            className="w-full text-left text-[13px] px-4 py-2.5 text-gray-700 hover:bg-gray-50 transition flex items-center gap-2"
          >
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            Export All (filtered)
          </button>
          <button
            onClick={() => run('selected')}
            disabled={selectedIds.length === 0}
            className="w-full text-left text-[13px] px-4 py-2.5 text-gray-700 hover:bg-gray-50 transition flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            Export Selected
            {selectedIds.length > 0 && (
              <span className="ml-auto text-xs font-semibold text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded-full">
                {selectedIds.length}
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
