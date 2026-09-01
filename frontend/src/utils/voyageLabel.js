// Voyage display standard: show only the name as the voyage's reference,
// falling back to its auto-generated code (voyageNumber) when unnamed —
// never both at once.
export function getVoyageLabel(v) {
  if (!v) return null;
  return v.voyageName || v.voyageNumber || null;
}
