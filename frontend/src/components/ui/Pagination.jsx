export default function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  const getPages = () => {
    const pages = [];
    const delta = 2;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== '…') {
        pages.push('…');
      }
    }
    return pages;
  };

  const btnBase = {
    height: 32, minWidth: 32, padding: '0 10px',
    borderRadius: 6, fontSize: 13, fontWeight: 500,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', border: '1px solid var(--border)',
    transition: 'all 0.15s',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        style={{ ...btnBase, background: 'var(--card)', color: 'var(--text-secondary)', opacity: page === 1 ? 0.4 : 1 }}
      >
        ←
      </button>

      {getPages().map((p, i) =>
        p === '…' ? (
          <span key={`e${i}`} style={{ padding: '0 4px', color: 'var(--text-muted)', fontSize: 13 }}>…</span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            style={{
              ...btnBase,
              background: p === page ? 'var(--teal)' : 'var(--card)',
              color:      p === page ? '#fff' : 'var(--text-secondary)',
              borderColor: p === page ? 'var(--teal)' : 'var(--border)',
            }}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        style={{ ...btnBase, background: 'var(--card)', color: 'var(--text-secondary)', opacity: page === totalPages ? 0.4 : 1 }}
      >
        →
      </button>
    </div>
  );
}
