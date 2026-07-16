'use client';
import PageGuard from '@/components/ui/PageGuard';
import AgentList from '@/modules/agents/AgentList';
export default function AgentsPage() {
  return <PageGuard module="agents"><AgentList /></PageGuard>;
}
