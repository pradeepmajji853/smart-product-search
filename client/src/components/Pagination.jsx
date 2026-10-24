// Page numbers with ellipses: 1 … 4 5 [6] 7 8 … 20
export function pageItems(current, total) {
  const pages = new Set([1, total, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (current >= total - 2) [total - 1, total - 2, total - 3].forEach((p) => pages.add(p));
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const items = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) items.push(`gap-${p}`);
    items.push(p);
  });
  return items;
}

export function Pagination({ page, totalPages, onChange, disabled }) {
  if (totalPages <= 1) return null;
  const btn =
    'min-w-9 rounded-md border px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-1.5">
      <button type="button" className={`${btn} border-slate-300 bg-white hover:bg-slate-50`} disabled={disabled || page <= 1} onClick={() => onChange(page - 1)}>
        ‹ Prev
      </button>
      {pageItems(page, totalPages).map((item) =>
        typeof item === 'string' ? (
          <span key={item} className="px-1 text-slate-400" aria-hidden="true">…</span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            disabled={disabled}
            aria-current={item === page ? 'page' : undefined}
            aria-label={`Page ${item}`}
            className={`${btn} ${
              item === page ? 'border-indigo-600 bg-indigo-600 text-white' : 'hidden border-slate-300 bg-white hover:bg-slate-50 sm:inline-block'
            }`}
          >
            {item}
          </button>
        ),
      )}
      <button type="button" className={`${btn} border-slate-300 bg-white hover:bg-slate-50`} disabled={disabled || page >= totalPages} onClick={() => onChange(page + 1)}>
        Next ›
      </button>
    </nav>
  );
}
