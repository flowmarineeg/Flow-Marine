'use client';
import { use } from 'react';
import AgentForm from '@/modules/agents/AgentForm';
export default function EditAgentPage({ params }) {
  const { id } = use(params);
  return <AgentForm id={id} />;
}
