'use client';

import { useRouter } from 'next/navigation';
import PageGuard   from '@/components/ui/PageGuard';
import PageHeader  from '@/components/ui/PageHeader';
import Button      from '@/components/ui/Button';
import ManualBookingForm from '@/modules/bookings/ManualBookingForm';

export default function NewManualBookingPage() {
  const router = useRouter();
  return (
    <PageGuard module="bookings">
      <div className="animate-fadeIn">
        <PageHeader
          title="New Manual Booking"
          subtitle="Commercial reservation before operational container details are available"
          action={<Button variant="secondary" onClick={() => router.push('/bookings?tab=manual')}>&larr; Back</Button>}
        />
        <ManualBookingForm
          onSuccess={(result) => {
            if (result?._id) router.push(`/bookings/manual/${result._id}`);
            else router.push('/bookings?tab=manual');
          }}
          onCancel={() => router.push('/bookings?tab=manual')}
        />
      </div>
    </PageGuard>
  );
}
