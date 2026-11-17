// Status badges. Colour carries meaning, drawn from the three-colour system:
//   green = done / paid / active      amber = waiting / needs attention
//   red   = cancelled / overdue       navy  = in progress / scheduled
//   orange = at a port (live state)   grey  = inactive / not started
const TONE = {
  good:    { background: '#DDF3E6', color: '#14532D' },
  warn:    { background: '#FDF0D5', color: '#7A4A06' },
  bad:     { background: '#FBE4E4', color: '#8E1C1C' },
  info:    { background: '#DCE6F2', color: '#0B2A4A' },
  planned: { background: '#fff',    color: '#123A63', border: '1px solid #8FAAC9' },
  live:    { background: '#FFE8DC', color: '#8A2D08' },
  neutral: { background: '#E6EAF0', color: '#3C4F66' },
};

const BADGE_STYLES = {
  // Status
  Active: TONE.good, Inactive: TONE.neutral,
  // Booking / Invoice
  Pending: TONE.warn, Confirmed: TONE.info, 'Final Loading': TONE.good, Cancelled: TONE.bad,
  Draft: TONE.neutral, Issued: TONE.info, 'Partially Paid': TONE.warn, Paid: TONE.good,
  Overdue: TONE.bad, 'Not Invoiced': TONE.neutral,
  // Round / Voyage
  Planned: TONE.planned, Completed: TONE.good, Scheduled: TONE.info,
  Departed: TONE.warn, Arrived: TONE.good, 'In Transit': TONE.live,
  // Tracking
  'At Port': TONE.live, Anchored: TONE.neutral, Delayed: TONE.bad,
  // Vessels
  'Under Maintenance': TONE.warn, Sold: TONE.neutral,
};

export default function Badge({ label }) {
  const style = BADGE_STYLES[label] || TONE.neutral;
  return (
    <span className="badge" style={style}>
      {label}
    </span>
  );
}
