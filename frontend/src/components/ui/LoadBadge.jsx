// Peak load % of a vessel / round / voyage (capacity engine). "—" when there is no capacity to compare with.
// Colours follow the Badge tones: green = comfortable, amber = nearly full, red = over capacity.
const tone = (pct) => {
  if (pct > 100) return { background: '#FBE4E4', color: '#8E1C1C' };
  if (pct >= 85) return { background: '#FDF0D5', color: '#7A4A06' };
  return { background: '#DDF3E6', color: '#14532D' };
};

export default function LoadBadge({ pct, title }) {
  if (pct == null) return <span className="text-gray-300" title="No capacity set on the vessel">—</span>;
  return <span className="badge" style={tone(pct)} title={title || (pct > 100 ? 'Over capacity' : 'Peak load')}>{pct}%</span>;
}
