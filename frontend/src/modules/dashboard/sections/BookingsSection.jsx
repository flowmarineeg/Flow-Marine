'use client';

import { BookingCountsWidget, BookingStatusChartWidget } from '../widgets/BookingsWidgets';

export default function BookingsSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="section-title">Bookings</h2>
      <BookingCountsWidget />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <BookingStatusChartWidget />
        </div>
      </div>
    </section>
  );
}
