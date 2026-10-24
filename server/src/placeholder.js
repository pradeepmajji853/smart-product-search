// Self-hosted SVG placeholder images: no external image service is needed, so product
// images always load (offline, in CI, in screenshots).
const PALETTE = {
  smartphones: ['#1e3a8a', '#3b82f6'],
  laptops: ['#334155', '#64748b'],
  audio: ['#7c2d12', '#ea580c'],
  televisions: ['#312e81', '#6366f1'],
  cameras: ['#3f3f46', '#a1a1aa'],
  wearables: ['#065f46', '#10b981'],
  'kitchen-appliances': ['#9a3412', '#f59e0b'],
  'home-and-furniture': ['#78350f', '#d97706'],
  'sports-and-fitness': ['#14532d', '#22c55e'],
  footwear: ['#831843', '#ec4899'],
  clothing: ['#581c87', '#a855f7'],
  books: ['#7f1d1d', '#ef4444'],
};
const DEFAULT_COLORS = ['#374151', '#9ca3af'];

const escapeXml = (s) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

export function renderPlaceholder(categorySlug, label) {
  const [dark, light] = PALETTE[categorySlug] || DEFAULT_COLORS;
  const title = escapeXml(categorySlug.replace(/-/g, ' ').replace(/\band\b/g, '&').toUpperCase());
  const text = escapeXml(label);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300" role="img" aria-label="${text}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${dark}"/><stop offset="1" stop-color="${light}"/></linearGradient></defs>
<rect width="400" height="300" fill="url(#g)"/>
<circle cx="200" cy="128" r="54" fill="#ffffff" fill-opacity="0.18"/>
<text x="200" y="140" text-anchor="middle" font-family="system-ui,sans-serif" font-size="34" font-weight="700" fill="#ffffff">${title.slice(0, 2)}</text>
<text x="200" y="222" text-anchor="middle" font-family="system-ui,sans-serif" font-size="16" letter-spacing="2" fill="#ffffff" fill-opacity="0.9">${title}</text>
<text x="200" y="250" text-anchor="middle" font-family="ui-monospace,monospace" font-size="13" fill="#ffffff" fill-opacity="0.75">${text}</text>
</svg>`;
}
