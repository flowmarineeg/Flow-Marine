// Breadcrumb for the drill-down pages: [{ label, onClick? }, ...]. Items with onClick are links, the last one is plain.
export default function DrillCrumb({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3 text-[13px]">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-gray-300">/</span>}
          {it.onClick
            ? <button type="button" onClick={it.onClick} className="font-semibold text-teal-600 hover:text-teal-800 transition">{i === 0 ? '← ' : ''}{it.label}</button>
            : <span className="font-semibold text-gray-800">{it.label}</span>}
        </span>
      ))}
    </div>
  );
}
