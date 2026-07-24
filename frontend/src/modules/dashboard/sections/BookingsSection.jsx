'use client';

import { BookingCountsWidget, BookingStatusChartWidget } from '../widgets/BookingsWidgets';

export default function BookingsSection() {
  return (
    <section className="flex flex-col gap-3">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Bookings</p>
      <BookingCountsWidget />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <BookingStatusChartWidget />
        </div>
      </div>
    </section>
  );
}
