'use client';
import { use, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import PageGuard from '@/components/ui/PageGuard';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { usePermission } from '@/context/PermissionContext';
import { agentsService } from '@/services/agents.service';
import AgentForm from '@/modules/agents/AgentForm';
import AgentV2Panel from '@/modules/agents/AgentV2Panel';

// Agent Details = the agent's accounting view (statement of account, agreements,
// commission, round settlement, cash & netting). Editing the agent's own fields
// is a secondary "Edit" mode on the same page.
function AgentDetailContent({ id }) {
  const router = useRouter();
  const { can } = usePermission();
  const [mode, setMode] = useState('account');
  const { data: agent, isLoading } = useQuery({
    queryKey: ['agent', id],
    queryFn: () => agentsService.getById(id).then((r) => r.data.data),
  });

  if (mode === 'edit') {
    return (
      <div className="flex flex-col gap-3">
        <button
          onClick={() => setMode('account')}
          className="self-start flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Account
        </button>
        <AgentForm id={id} />
      </div>
    );
  }

  if (isLoading) return <LoadingSpinner fullPage />;

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center gap-2 mb-5">
        <button
          onClick={() => router.push('/agents')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M15 19l-7-7 7-7" />
          </svg>
          Agents
        </button>
        <span className="text-gray-200">/</span>
        <span className="mono text-sm font-bold text-gray-600">{agent?.agentCode}</span>
      </div>

      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-xl font-bold text-gray-800">{agent?.agentName}</h1>
          <p className="text-xs text-gray-400 mt-1">
            {agent?.partyType === 'DirectLine' ? 'Direct Line' : 'Agent'} · {agent?.status}
            {agent?.creditDays != null ? ` · ${agent.creditDays} credit days` : ''}
          </p>
        </div>
        {can('agents', 'update') && (
          <button onClick={() => setMode('edit')} className="btn btn-secondary btn-md">Edit Agent</button>
        )}
      </div>

      <AgentV2Panel agentId={id} />
    </div>
  );
}

export default function AgentDetailPage({ params }) {
  const { id } = use(params);
  return (
    <PageGuard module="agents">
      <AgentDetailContent id={id} />
    </PageGuard>
  );
}
