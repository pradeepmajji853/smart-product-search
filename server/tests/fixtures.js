// Hand-crafted products with known values, loaded into the isolated test database.
// ids are assigned in array order (1-based) because the table is truncated with
// RESTART IDENTITY before insertion.

const p = (sku, name, description, brand, category, price, rating, inStock, createdAt) => ({
  sku,
  name,
  description,
  brand,
  category,
  price: price.toFixed(2),
  rating: rating.toFixed(1),
  inStock,
  createdAt,
  imageUrl: `/api/images/test/${sku}.svg`,
});

const named = [
  p('AUD-1001', 'Sony WH-1000XM5 Wireless Headphones', 'Industry-leading noise-cancelling over-ear headphones.', 'Sony', 'Audio', 349.99, 4.8, true, '2025-01-10T10:00:00Z'),
  p('AUD-1002', 'Sony WF-1000XM4 Earbuds', 'Compact true wireless earbuds with long battery life.', 'Sony', 'Audio', 249.99, 4.6, false, '2025-02-11T10:00:00Z'),
  p('AUD-1003', 'Bose QuietComfort Headphones', 'Premium comfort with world-class noise-cancelling.', 'Bose', 'Audio', 329.0, 4.7, true, '2025-03-12T10:00:00Z'),
  p('AUD-1004', 'JBL Flip 6 Portable Speaker', 'Waterproof Bluetooth speaker with punchy bass.', 'JBL', 'Audio', 129.99, 4.5, true, '2025-04-13T10:00:00Z'),
  p('LAP-2001', 'Apple MacBook Air 13', 'Thin and light laptop with the M3 chip.', 'Apple', 'Laptops', 999.0, 4.9, true, '2025-05-14T10:00:00Z'),
  p('LAP-2002', 'Dell XPS 13 Laptop', 'Compact premium ultrabook with an InfinityEdge display.', 'Dell', 'Laptops', 1199.0, 4.4, false, '2025-06-15T10:00:00Z'),
  p('LAP-2003', 'Lenovo ThinkPad X1 Carbon', 'Business laptop with a legendary keyboard.', 'Lenovo', 'Laptops', 1499.0, 4.6, true, '2025-07-16T10:00:00Z'),
  p('PHN-3001', 'Apple iPhone 15', 'Smartphone with Dynamic Island and a 48MP camera.', 'Apple', 'Smartphones', 799.0, 4.7, true, '2025-08-17T10:00:00Z'),
  p('PHN-3002', 'Samsung Galaxy S24', 'Android smartphone with Galaxy AI features.', 'Samsung', 'Smartphones', 799.0, 4.5, true, '2025-08-17T10:00:00Z'),
  p('PHN-3003', 'Google Pixel 8', 'Android phone with the best-in-class camera.', 'Google', 'Smartphones', 699.0, 4.3, false, '2025-09-18T10:00:00Z'),
  p('KIT-4001', 'Philips Air Fryer XL', 'Makes crispy fries with up to 90% less fat.', 'Philips', 'Kitchen', 149.99, 4.2, true, '2025-10-19T10:00:00Z'),
  p('KIT-4002', 'Prestige Pressure Cooker 5L', 'Stainless steel cooker for everyday meals.', 'Prestige', 'Kitchen', 49.99, 4.0, true, '2025-11-20T10:00:00Z'),
  p('APP-5001', '100% Cotton T-Shirt', 'Soft tee made from pure cotton.', 'Wildcard Co', 'Apparel', 19.99, 3.5, true, '2025-12-01T10:00:00Z'),
  p('APP-5002', 'Under_score Edition Tee', 'Limited run graphic tee.', 'Wildcard Co', 'Apparel', 24.99, 3.0, false, '2025-12-02T10:00:00Z'),
  p('APP-5003', 'Back\\slash Poster', 'Art print featuring a single backslash.', 'Wildcard Co', 'Apparel', 9.99, 2.5, true, '2025-12-03T10:00:00Z'),
  p('BOK-6001', "O'Reilly Learning SQL", "A beginner's guide to SQL; DROP TABLE is covered in chapter 9.", "O'Reilly", 'Books', 39.99, 4.4, true, '2025-12-04T10:00:00Z'),
];

// 20 products that are identical in every sortable column. Only the id differs, so
// they exercise the deterministic tie-breaker for every sort option.
const ties = Array.from({ length: 20 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return p(`TIE-90${n}`, `Tie Widget`, 'Identical widget used to test stable pagination.', 'TieCo', 'Testing', 10.0, 4.0, true, '2025-06-01T00:00:00Z');
});

export const FIXTURE_PRODUCTS = [...named, ...ties].map((product, index) => ({ id: index + 1, ...product }));

// Reference implementation of the search semantics, used to compute expected results.
export function expectedIds(params = {}) {
  const terms = (params.q || '').trim().split(/\s+/).filter(Boolean).map((t) => t.toLowerCase());
  const list = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
  const categories = list(params.category);
  const brands = list(params.brand);

  const rows = FIXTURE_PRODUCTS.filter((row) => {
    const fields = [row.name, row.description, row.brand, row.category, row.sku].map((f) => f.toLowerCase());
    if (!terms.every((t) => fields.some((f) => f.includes(t)))) return false;
    if (categories.length && !categories.includes(row.category)) return false;
    if (brands.length && !brands.includes(row.brand)) return false;
    if (params.minPrice !== undefined && Number(row.price) < Number(params.minPrice)) return false;
    if (params.maxPrice !== undefined && Number(row.price) > Number(params.maxPrice)) return false;
    if (params.minRating !== undefined && Number(row.rating) < Number(params.minRating)) return false;
    if (params.inStock !== undefined && row.inStock !== (params.inStock === 'true')) return false;
    return true;
  });

  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const comparators = {
    price_asc: (a, b) => cmp(Number(a.price), Number(b.price)) || a.id - b.id,
    price_desc: (a, b) => cmp(Number(b.price), Number(a.price)) || b.id - a.id,
    rating_desc: (a, b) => cmp(Number(b.rating), Number(a.rating)) || b.id - a.id,
    newest: (a, b) => cmp(b.createdAt, a.createdAt) || b.id - a.id,
    name_asc: (a, b) => cmp(a.name.toLowerCase(), b.name.toLowerCase()) || a.id - b.id,
  };
  return rows.sort(comparators[params.sort || 'newest']).map((row) => row.id);
}
