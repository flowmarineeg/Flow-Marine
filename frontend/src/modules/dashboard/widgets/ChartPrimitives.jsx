'use client';

import { useEffect, useRef } from 'react';
import { Chart } from 'chart.js';

// Sprint 039 — chart primitives moved out of the monolithic dashboard
// page into reusable widget building blocks. Chart.js registration
// stays centralized once, in the Dashboard page itself (Sprint020
// PERF-006 targeted registration) — these components only construct
// chart instances, they do not re-register anything.

const PALETTE = ['#0D9488','#6366F1','#F59E0B','#EC4899','#10B981','#3B82F6','#8B5CF6'];

export function MonthlyTrendChart({ data }) {
  const ref      = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!ref.current || !data) return;

    if (chartRef.current) {
      chartRef.current.data.labels           = data.labels;
      chartRef.current.data.datasets[0].data = data.freight;
      chartRef.current.data.datasets[1].data = data.counts;
      chartRef.current.update('none');
      return;
    }

    chartRef.current = new Chart(ref.current, {
      type: 'line',
      data: {
        labels:   data.labels,
        datasets: [
          {
            label: 'Revenue ($)', data: data.freight,
            borderColor: '#0D9488', backgroundColor: 'rgba(13,148,136,0.12)',
            borderWidth: 2.5, pointBackgroundColor: '#0D9488', pointRadius: 4,
            fill: true, tension: 0.4, yAxisID: 'y',
          },
          {
            label: 'Booking Count', data: data.counts,
            borderColor: '#6366F1', backgroundColor: 'rgba(99,102,241,0.08)',
            borderWidth: 2, pointBackgroundColor: '#6366F1', pointRadius: 3,
            fill: true, tension: 0.4, yAxisID: 'y1',
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { font: { size: 11 }, padding: 12 } },
          tooltip: { callbacks: { label: ctx => ctx.datasetIndex === 0 ? ` Revenue: $${Number(ctx.raw).toLocaleString()}` : ` Bookings: ${ctx.raw}` } },
        },
        scales: {
          y:  { type:'linear', position:'left',  beginAtZero:true, ticks:{ callback: v=>`$${(v/1000).toFixed(0)}k`, font:{size:11} }, grid:{color:'#F3F4F6'} },
          y1: { type:'linear', position:'right', beginAtZero:true, ticks:{ font:{size:11} }, grid:{drawOnChartArea:false} },
          x:  { ticks:{ font:{size:11} }, grid:{display:false} },
        },
      },
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [data]);

  return <canvas ref={ref} style={{ height: 240 }} />;
}

export function RevenueBarChart({ data }) {
  const ref      = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!ref.current || !data?.length) return;

    if (chartRef.current) {
      chartRef.current.data.labels           = data.map(r => r.label);
      chartRef.current.data.datasets[0].data = data.map(r => r.value);
      chartRef.current.update('none');
      return;
    }

    chartRef.current = new Chart(ref.current, {
      type: 'bar',
      data: {
        labels:   data.map(r => r.label),
        datasets: [{ label:'Revenue', data:data.map(r=>r.value), backgroundColor:data.map((_,i)=>PALETTE[i%PALETTE.length]), borderRadius:5, borderSkipped:false }],
      },
      options: {
        indexAxis:'y', responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:ctx=>` $${Number(ctx.raw).toLocaleString()}` } } },
        scales:{ x:{ beginAtZero:true, ticks:{callback:v=>`$${(v/1000).toFixed(0)}k`, font:{size:11}}, grid:{color:'#F3F4F6'} }, y:{ ticks:{font:{size:11}}, grid:{display:false} } },
      },
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [data]);

  return <canvas ref={ref} style={{ height: 220 }} />;
}

export function DoughnutChart({ items = [], colorMap = {} }) {
  const ref      = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!ref.current || !items.length) return;

    if (chartRef.current) {
      chartRef.current.data.labels           = items.map(i => i.label);
      chartRef.current.data.datasets[0].data = items.map(i => i.count);
      chartRef.current.update('none');
      return;
    }

    chartRef.current = new Chart(ref.current, {
      type: 'doughnut',
      data: {
        labels:   items.map(i => i.label),
        datasets: [{ data:items.map(i=>i.count), backgroundColor:items.map(i=>colorMap[i.label]||PALETTE[0]), borderWidth:2, borderColor:'#fff', hoverOffset:6 }],
      },
      options: {
        responsive:true, maintainAspectRatio:false, cutout:'65%',
        plugins:{ legend:{ position:'bottom', labels:{font:{size:10},padding:8} }, tooltip:{ callbacks:{label:ctx=>` ${ctx.label}: ${ctx.raw}`} } },
      },
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [items]);

  return <div style={{ position: 'relative', height: 200 }}><canvas ref={ref} /></div>;
}
