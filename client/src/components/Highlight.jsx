const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Wraps every case-insensitive occurrence of the search terms in <mark>.
export function Highlight({ text, terms }) {
  const active = terms.filter(Boolean);
  if (active.length === 0) return text;
  const pattern = new RegExp(`(${active.map(escapeRegExp).sort((a, b) => b.length - a.length).join('|')})`, 'gi');
  return text.split(pattern).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded-sm bg-yellow-200 px-0.5 text-inherit">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}
