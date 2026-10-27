'use client';

// Read-only reference of the chart-of-accounts coding rules (docs/accounting). Nothing here is editable.
const LEVELS = [
  ['X00000', 'Class', '1 Assets · 2 Liabilities · 3 Equity & JV partners · 4 Operating revenue · 5 Direct operating costs · 6 General & administrative · 7 Finance & FX'],
  ['XX0000', 'Group', 'e.g. 11 Current assets, 12 Non-current assets'],
  ['XXX000', 'Sub-group (control account)', 'e.g. 111 Cash & banks, 112 Receivables — headers, never posted to'],
  ['XXXXXX', 'Posting account', 'The only level that takes journal entries'],
];

const DIMENSIONS = [
  ['Revenue (4xxxxx) and operating cost (5xxxxx) lines', 'Round'],
  ['Slot revenue (410000) and voyage / port costs (520000)', 'Voyage + Port'],
  ['Receivables and payables (112xxx, 113xxx, 211xxx)', 'Agent or client'],
  ['JV partner accounts (321xxx, 331xxx)', 'Partner'],
];

const RULES = [
  ['No per-customer, per-vessel or per-voyage accounts', 'The tree holds control accounts only; the detail lives in sub-ledgers and cost centres, otherwise the tree grows to tens of thousands of accounts.'],
  ['Header lock', 'Accounts ending in 000 are headers (is_group) and reject direct entries.'],
  ['Mandatory dimensions', 'Every entry on a revenue or operating-cost account carries the Round; see the table below for the others. Entries missing a required dimension are rejected.'],
  ['Operations never pick account numbers', 'Invoice Services are mapped to a revenue account (class 4) and Expense Types to an expense account (class 5); the ledger takes the account from the master.'],
  ['PDA to FDA', 'A provisional port expense debits the port-expense account and credits the accrual (213101); the final approved invoice reverses the accrual and books the actual payable.'],
  ['JV settlement', 'The partners settlement reads class 4 minus class 5 for the Round only; corporate G&A (class 6) is kept out unless the partners agreement says otherwise.'],
];

const Card = ({ title, children }) => (
  <div className="card p-5 mb-4">
    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">{title}</p>
    {children}
  </div>
);

export default function CodingRules() {
  return (
    <div className="max-w-4xl">
      <Card title="6-digit coding (X · XX · XXX)">
        <table className="w-full text-[13px] border-collapse">
          <tbody>
            {LEVELS.map(([code, name, desc]) => (
              <tr key={code} className="border-t border-gray-100 first:border-0">
                <td className="py-2 pr-4 mono text-teal-700 whitespace-nowrap">{code}</td>
                <td className="py-2 pr-4 font-medium text-gray-800 whitespace-nowrap">{name}</td>
                <td className="py-2 text-gray-500">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Rules">
        <div className="flex flex-col gap-3">
          {RULES.map(([t, d]) => (
            <div key={t}><p className="text-[13px] font-semibold text-gray-800">{t}</p><p className="text-[13px] text-gray-500">{d}</p></div>
          ))}
        </div>
      </Card>
      <Card title="Mandatory dimensions">
        <table className="w-full text-[13px] border-collapse">
          <tbody>
            {DIMENSIONS.map(([where, dim]) => (
              <tr key={where} className="border-t border-gray-100 first:border-0"><td className="py-2 pr-4 text-gray-700">{where}</td><td className="py-2 font-medium text-gray-800 whitespace-nowrap">{dim}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] text-gray-400">These rules are stored on each account (required dimensions). Enforcing them in the ledger is a later change.</p>
      </Card>
    </div>
  );
}
