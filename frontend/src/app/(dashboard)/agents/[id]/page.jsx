'use client';
import { use, useState } from 'react';
import AgentForm from '@/modules/agents/AgentForm';
import AgentFinancialAccount from '@/modules/agents/AgentFinancialAccount';

// Sprint 033 Decision 3: Agent Details is no longer just the edit form — it
// is the Agent Financial Account (the statement). Editing the agent's own
// fields is now a secondary "Edit" mode reached from within the statement.
export default function AgentDetailPage({ params }) {
  const { id } = use(params);
  const [mode, setMode] = useState('statement');

  if (mode === 'edit') {
    return (
      <div className="flex flex-col gap-3">
        <button
          onClick={() => setMode('statement')}
          className="self-start flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Statement
        </button>
        <AgentForm id={id} />
      </div>
    );
  }
  return <AgentFinancialAccount id={id} onEdit={() => setMode('edit')} />;
}
