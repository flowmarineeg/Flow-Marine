'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { servicesService } from '@/services/services.service';
import { usePermission } from '@/context/PermissionContext';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import ServiceForm from '@/modules/services/ServiceForm';
import RouteEditor from '@/modules/services/RouteEditor';

const tabs = [
  { key: 'details', label: 'Service Details' },
  { key: 'route',   label: 'Route' },
];

export default function ServiceDetailPage({ serviceId, defaultTab = 'details' }) {
  const router     = useRouter();
  const qc         = useQueryClient();
  const { can }    = usePermission();
  const [activeTab, setActiveTab] = useState(defaultTab);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['service', serviceId],
    queryFn:  () => servicesService.getById(serviceId).then(r => r.data.data),
  });

  if (isLoading) return <LoadingSpinner fullPage />;
  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <p className="text-sm">Service not found</p>
        <button onClick={() => router.push('/services')} className="mt-3 text-sm text-teal-600 hover:underline">
          ← Back to Services
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">

      {/* Top breadcrumb + back */}
      <div className="flex items-center gap-2 mb-5">
        <button
          onClick={() => router.push('/services')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M15 19l-7-7 7-7"/>
          </svg>
          Services
        </button>
        <span className="text-gray-200">/</span>
        <span className="text-sm font-medium text-gray-700">{data.serviceCode}</span>
      </div>

      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm font-bold text-teal-600 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded">
              {data.serviceCode}
            </span>
            <Badge label={data.status} />
          </div>
          <h1 className="text-xl font-bold text-gray-900">{data.serviceName}</h1>
          {data.defaultVesselId && (
            <p className="text-sm text-gray-400 mt-1">
              Default vessel:&nbsp;
              <span className="font-mono text-xs text-teal-600 font-semibold">{data.defaultVesselId.vesselCode}</span>
              &nbsp;{data.defaultVesselId.vesselName}
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-400 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {activeTab === 'details' && (
        <div className="max-w-xl">
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-600 mb-4">Edit Service Details</h2>
            {can('services', 'update') ? (
              <ServiceForm
                item={data}
                onSuccess={() => {
                  qc.invalidateQueries(['service', serviceId]);
                  qc.invalidateQueries(['services']);
                }}
                onCancel={() => router.push('/services')}
              />
            ) : (
              <div className="space-y-4 text-sm text-gray-600">
                <Row label="Code"        value={data.serviceCode} mono />
                <Row label="Name"        value={data.serviceName} />
                <Row label="Status"      value={<Badge label={data.status} />} />
                <Row label="Description" value={data.description || '—'} />
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'route' && (
        <div className="card p-6">
          <RouteEditor
            serviceId={serviceId}
            serviceName={data.serviceName}
            serviceCode={data.serviceCode}
          />
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex gap-4">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide w-24 flex-shrink-0 pt-0.5">{label}</span>
      <span className={mono ? 'font-mono font-semibold text-teal-600' : ''}>{value}</span>
    </div>
  );
}
