'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { accountingService } from '@/services/accounting.service';
import { usePermission } from '@/context/PermissionContext';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import AccountForm from '@/modules/accounting/AccountForm';
import ExchangeRates from '@/modules/accounting/ExchangeRates';
import CodingRules from '@/modules/accounting/CodingRules';

const TYPES = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
const BADGE = 'inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border';

const LEGACY_ID = '__legacy__';

/** Flat account list -> roots with children. 4-digit ledger accounts (no parent) go under one synthetic group. */
function buildTree(all) {
  const nodes = new Map(all.map((a) => [String(a._id), { ...a, children: [] }]));
  const roots = [];
  const legacy = [];
  for (const n of nodes.values()) {
    const parent = n.parentId ? nodes.get(String(n.parentId)) : null;
    if (parent) parent.children.push(n);
    else if (/^d{4}$/.test(n.code)) legacy.push(n);
    else roots.push(n);
  }
  const byCode = (a, b) => a.code.localeCompare(b.code);
  nodes.forEach((n) => n.children.sort(byCode));
  roots.sort(byCode);
  if (legacy.length) roots.push({ _id: LEGACY_ID, code: '', name: 'Ledger posting accounts (4-digit, used by the ledger today)', isGroup: true, synthetic: true, children: legacy.sort(byCode) });
  return roots;
}

function ChartTab() {
  const { can } = usePermission();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [kind, setKind] = useState(''); // '' | 'true' posting | 'false' header
  const [modal, setModal] = useState(null); // null | 'create' | { edit }

  const { data: meta } = useQuery({ queryKey: ['chart-meta'], queryFn: () => accountingService.meta().then(r => r.data.data) });
  const { data: all = [], isLoading } = useQuery({
    queryKey: ['chart-of-accounts', 'all'],
    queryFn: () => accountingService.listAccounts().then(r => r.data.data),
  });

  const q = search.trim().toLowerCase();
  const filtering = !!(q || type || kind);
  const [open, setOpen] = useState(() => new Set());
  const tree = useMemo(() => buildTree(all), [all]);

  const matches = (a) => !a.synthetic &&
    (!type || a.type === type) &&
    (!kind || (kind === 'true' ? !a.isGroup : !!a.isGroup)) &&
    (!q || a.code.includes(q) || a.name.toLowerCase().includes(q) || (a.nameAr || '').includes(search.trim()));

  // visible rows: with a filter, every matching account plus its ancestors (all expanded); otherwise the expanded branches only
  const rows = useMemo(() => {
    const out = [];
    if (!filtering) {
      const walk = (n, depth) => {
        out.push({ ...n, depth });
        if ((n.children || []).length && open.has(String(n._id))) n.children.forEach((c) => walk(c, depth + 1));
      };
      tree.forEach((r) => walk(r, 0));
      return out;
    }
    const visit = (n, depth) => {
      const at = out.length;
      (n.children || []).forEach((c) => visit(c, depth + 1));
      if (matches(n) || out.length > at) out.splice(at, 0, { ...n, depth, forcedOpen: true });
    };
    tree.forEach((r) => visit(r, 0));
    return out;
  }, [tree, open, filtering, q, type, kind, search]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = all.length;
  const toggle = (id) => setOpen((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const expandAll = () => setOpen(new Set(all.filter((a) => a.isGroup).map((a) => String(a._id)).concat(LEGACY_ID)));
  const collapseAll = () => setOpen(new Set());
  const headers = all.filter(a => a.isGroup);
  const canManage = can('accounting', 'create');

  if (isLoading || !meta) return <LoadingSpinner />;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search code or name…" className="input-base" style={{ width: 240 }} />
        <select value={type} onChange={e => setType(e.target.value)} className="input-base" style={{ width: 150 }}>
          <option value="">All types</option>{TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={kind} onChange={e => setKind(e.target.value)} className="input-base" style={{ width: 160 }}>
          <option value="">Headers + posting</option><option value="true">Posting only</option><option value="false">Headers only</option>
        </select>
        <span className="text-xs text-gray-400">{filtering ? `${rows.length} rows` : `${total} accounts`}</span>
        {!filtering && <><button type="button" onClick={expandAll} className="text-xs font-medium text-teal-600 hover:underline">Expand all</button><button type="button" onClick={collapseAll} className="text-xs font-medium text-gray-500 hover:underline">Collapse all</button></>}
        <div className="flex-1" />
        {canManage && <Button onClick={() => setModal('create')}>+ New Posting Account</Button>}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[900px]">
            <thead><tr className="table-header">{['Code', 'Name', 'Arabic', 'Type', 'Balance', 'Kind', 'Sub-ledger', 'Allocation', 'Dimensions', ''].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(a => {
                const hasKids = (a.children || []).length > 0;
                const isOpen = a.forcedOpen || open.has(String(a._id));
                return (
                <tr key={a._id} className={`table-row ${a.isActive === false ? 'opacity-50' : ''} ${a.isGroup && a.depth === 0 ? 'bg-gray-50' : ''}`}>
                  <td style={{ paddingLeft: 8 + a.depth * 18, whiteSpace: 'nowrap' }}>
                    {hasKids ? (
                      <button type="button" disabled={a.forcedOpen} onClick={() => toggle(String(a._id))} className="inline-flex items-center justify-center w-5 h-5 mr-1 text-gray-500 hover:text-gray-800 disabled:cursor-default" aria-label={isOpen ? 'Collapse' : 'Expand'}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                      </button>
                    ) : <span className="inline-block w-5 mr-1" />}
                    <span className={`mono ${a.isGroup ? 'font-bold text-gray-800' : 'text-teal-700'}`}>{a.code}</span>
                  </td>
                  <td><span className={a.isGroup ? 'font-semibold text-gray-800' : 'text-gray-700'}>{a.name}</span>{hasKids && !a.forcedOpen && <span className="ml-2 text-[11px] text-gray-400">({a.children.length})</span>}</td>
                  <td dir="rtl" className="text-xs text-gray-500">{a.nameAr || ''}</td>
                  <td className="text-xs text-gray-600">{a.type}</td>
                  <td className="text-xs text-gray-500">{a.normalBalance || ''}</td>
                  <td>
                    <span className={`${BADGE} ${a.isGroup ? 'bg-gray-100 text-gray-600 border-gray-200' : 'bg-teal-50 text-teal-700 border-teal-200'}`}>{a.isGroup ? 'Header' : 'Posting'}</span>
                    {(a.isSystemLocked || a.isSystem) && <span className={`${BADGE} ml-1 bg-amber-50 text-amber-700 border-amber-200`}>Locked</span>}
                  </td>
                  <td className="text-xs text-gray-500">{a.subledgerType && a.subledgerType !== 'NONE' ? a.subledgerType : ''}</td>
                  <td className="text-xs text-gray-500">{a.allocationLevel && a.allocationLevel !== 'NONE' ? a.allocationLevel : ''}</td>
                  <td className="text-[11px] text-gray-500">{(a.requiredDimensions || []).join(', ')}</td>
                  <td>{canManage && !a.isGroup && !a.isSystemLocked && !a.isSystem && <button onClick={() => setModal({ edit: a })} className="text-xs font-medium text-teal-600 hover:text-teal-800">Edit</button>}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-gray-400">
        Headers never take entries. Master data only: the ledger still posts to its 4-digit accounts; this 6-digit chart is used to pick revenue, expense, accrual and AR accounts.
      </p>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? 'New Posting Account' : 'Edit Account'} size="lg">
        {modal && <AccountForm item={modal?.edit || null} headers={headers} meta={meta} onSuccess={() => setModal(null)} onCancel={() => setModal(null)} />}
      </Modal>
    </div>
  );
}

export default function AccountingPage() {
  const { can } = usePermission();
  const tabs = [
    { key: 'chart', label: 'Chart of Accounts' },
    ...(can('ledger', 'read') ? [{ key: 'fx', label: 'Exchange Rates' }] : []),
    { key: 'rules', label: 'Coding Rules' },
  ];
  const [tab, setTab] = useState('chart');

  return (
    <div className="animate-fadeIn">
      <PageHeader title="Accounting" subtitle="Chart of accounts, exchange rates and coding rules" />
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${tab === t.key ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-400 hover:text-gray-700 hover:border-gray-300'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'chart' && <ChartTab />}
      {tab === 'fx' && <ExchangeRates />}
      {tab === 'rules' && <CodingRules />}
    </div>
  );
}
