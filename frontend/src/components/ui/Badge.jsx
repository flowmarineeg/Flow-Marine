const BADGE_STYLES = {
  // Status
  Active:       { background: '#D1FAE5', color: '#065F46' },
  Inactive:     { background: '#F1F5F9', color: '#64748B' },
  // Booking / Invoice
  Pending:      { background: '#FEF3C7', color: '#92400E' },
  Confirmed:    { background: '#DBEAFE', color: '#1E40AF' },
  Cancelled:    { background: '#FEE2E2', color: '#991B1B' },
  Draft:        { background: '#F1F5F9', color: '#475569' },
  Issued:       { background: '#E0F2FE', color: '#0369A1' },
  Paid:         { background: '#D1FAE5', color: '#065F46' },
  Overdue:      { background: '#FEE2E2', color: '#991B1B' },
  // Round / Voyage
  Planned:      { background: '#EDE9FE', color: '#5B21B6' },
  Completed:    { background: '#D1FAE5', color: '#065F46' },
  Scheduled:    { background: '#DBEAFE', color: '#1E40AF' },
  Departed:     { background: '#FEF3C7', color: '#92400E' },
  Arrived:      { background: '#D1FAE5', color: '#065F46' },
  'In Transit': { background: '#E0F2FE', color: '#0369A1' },
  // Tracking
  'At Port':    { background: '#CCFBF1', color: '#0F766E' },
  Anchored:     { background: '#F1F5F9', color: '#475569' },
  Delayed:      { background: '#FEE2E2', color: '#991B1B' },
  // Under maintenance
  'Under Maintenance': { background: '#FEF3C7', color: '#92400E' },
  Sold:         { background: '#F1F5F9', color: '#475569' },
};

export default function Badge({ label }) {
  const style = BADGE_STYLES[label] || { background: '#F1F5F9', color: '#475569' };
  return (
    <span className="badge" style={style}>
      {label}
    </span>
  );
}
