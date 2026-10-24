// Deterministic product seed.
// Usage: node database/seed.js [--count 1000] [--database-url <url>]
//
// The same seed + count always produces exactly the same rows (same SKUs, prices,
// ratings, dates and, because the table is truncated with RESTART IDENTITY, the same ids).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadEnv, resolveDatabaseUrl } from './env.js';

export const MIN_PRODUCTS = 500;
export const DEFAULT_COUNT = 1000;
const DEFAULT_SEED = 20261024;
// Fixed reference date so created_at values do not depend on when the seed runs.
const BASE_DATE = Date.UTC(2026, 9, 1, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

const CATEGORIES = [
  {
    name: 'Smartphones', code: 'PHN', priceRange: [8999, 149999], step: 1000,
    brands: ['Apple', 'Samsung', 'Google', 'OnePlus', 'Xiaomi', 'Motorola'],
    nouns: ['Smartphone', '5G Phone', 'Phone'],
    adjectives: ['Pro', 'Lite', 'Ultra', 'Plus', 'Max', 'Neo'],
    features: ['a 6.5-inch AMOLED display', 'a 50MP triple camera', 'all-day 5000mAh battery', '120Hz refresh rate', 'fast 67W charging', 'an IP68 water-resistant body'],
  },
  {
    name: 'Laptops', code: 'LAP', priceRange: [29999, 249999], step: 5000,
    brands: ['Apple', 'Dell', 'HP', 'Lenovo', 'ASUS', 'Acer'],
    nouns: ['Laptop', 'Notebook', 'Ultrabook', 'Gaming Laptop'],
    adjectives: ['Slim', 'Pro', 'Creator', 'Thin & Light', 'Business', 'Gaming'],
    features: ['16GB RAM', 'a 512GB NVMe SSD', 'a backlit keyboard', 'a 14-inch 2.8K display', 'up to 12 hours of battery life', 'Wi-Fi 6E connectivity'],
  },
  {
    name: 'Audio', code: 'AUD', priceRange: [999, 39999], step: 500,
    brands: ['Sony', 'Bose', 'JBL', 'boAt', 'Sennheiser', 'Samsung'],
    nouns: ['Wireless Headphones', 'Earbuds', 'Bluetooth Speaker', 'Soundbar', 'Neckband'],
    adjectives: ['Noise-Cancelling', 'Bass Boost', 'Portable', 'Over-Ear', 'Studio', 'Sport'],
    features: ['active noise cancellation', '30 hours of playback', 'deep bass', 'a built-in microphone', 'Bluetooth 5.3', 'a sweat-resistant design'],
  },
  {
    name: 'Televisions', code: 'TV', priceRange: [12999, 199999], step: 5000,
    brands: ['Samsung', 'LG', 'Sony', 'Xiaomi', 'TCL', 'OnePlus'],
    nouns: ['Smart TV', 'LED TV', 'OLED TV', 'QLED TV'],
    adjectives: ['43-inch', '50-inch', '55-inch', '65-inch', '4K Ultra HD', 'Full HD'],
    features: ['Dolby Vision', 'a 120Hz panel', 'built-in Chromecast', 'Dolby Atmos sound', 'voice remote control', 'HDR10+ support'],
  },
  {
    name: 'Cameras', code: 'CAM', priceRange: [4999, 189999], step: 2500,
    brands: ['Canon', 'Nikon', 'Sony', 'Fujifilm', 'GoPro'],
    nouns: ['Mirrorless Camera', 'DSLR Camera', 'Action Camera', 'Vlogging Camera'],
    adjectives: ['Compact', 'Full-Frame', 'Waterproof', 'Pro', 'Creator', 'Travel'],
    features: ['4K 60fps video', 'a 24MP sensor', 'in-body image stabilisation', 'dual card slots', 'eye-tracking autofocus', 'a flip-out touchscreen'],
  },
  {
    name: 'Wearables', code: 'WRB', priceRange: [1499, 89999], step: 500,
    brands: ['Apple', 'Samsung', 'Fitbit', 'Garmin', 'Noise', 'Amazfit'],
    nouns: ['Smartwatch', 'Fitness Band', 'GPS Watch'],
    adjectives: ['Active', 'Classic', 'Sport', 'Pro', 'Lite', 'Adventure'],
    features: ['heart-rate monitoring', 'SpO2 tracking', 'built-in GPS', 'a 7-day battery', 'sleep tracking', 'an always-on display'],
  },
  {
    name: 'Kitchen Appliances', code: 'KIT', priceRange: [799, 49999], step: 250,
    brands: ['Philips', 'Prestige', 'Bajaj', 'Samsung', 'LG', 'Havells'],
    nouns: ['Air Fryer', 'Mixer Grinder', 'Microwave Oven', 'Electric Kettle', 'Induction Cooktop', 'Coffee Maker'],
    adjectives: ['Digital', 'Compact', 'Family Size', 'Stainless Steel', 'Smart', 'Energy Saver'],
    features: ['a 4.1L capacity', 'auto shut-off', 'a stainless steel body', '8 preset menus', 'a 2-year warranty', 'rapid heating technology'],
  },
  {
    name: 'Home & Furniture', code: 'HOM', priceRange: [499, 79999], step: 500,
    brands: ['IKEA', 'Urban Ladder', 'Nilkamal', 'Wakefit', 'Godrej Interio'],
    nouns: ['Office Chair', 'Bookshelf', 'Study Table', 'Sofa', 'Mattress', 'Bed Frame'],
    adjectives: ['Ergonomic', 'Solid Wood', 'Modern', 'Foldable', 'Memory Foam', 'Minimalist'],
    features: ['engineered wood construction', 'easy DIY assembly', 'a 5-year warranty', 'breathable fabric', 'lumbar support', 'a scratch-resistant finish'],
  },
  {
    name: 'Sports & Fitness', code: 'SPT', priceRange: [299, 59999], step: 250,
    brands: ['Decathlon', 'Nike', 'Adidas', 'Puma', 'Yonex', 'Cosco'],
    nouns: ['Yoga Mat', 'Dumbbell Set', 'Badminton Racket', 'Cricket Bat', 'Treadmill', 'Football'],
    adjectives: ['Pro', 'Training', 'Lightweight', 'Anti-Slip', 'Adjustable', 'Tournament'],
    features: ['a non-slip grip', 'durable construction', 'a carry bag', 'professional-grade materials', 'adjustable resistance', 'a lightweight frame'],
  },
  {
    name: 'Footwear', code: 'FTW', priceRange: [499, 19999], step: 250,
    brands: ['Nike', 'Adidas', 'Puma', 'Bata', 'Skechers', 'Woodland'],
    nouns: ['Running Shoes', 'Sneakers', 'Sandals', 'Hiking Boots', 'Formal Shoes'],
    adjectives: ['Cushioned', 'Breathable', 'Lightweight', 'Waterproof', 'Classic', 'Trail'],
    features: ['a cushioned midsole', 'a breathable mesh upper', 'a rubber outsole', 'memory-foam insoles', 'a water-repellent finish', 'a lace-up closure'],
  },
  {
    name: 'Clothing', code: 'CLO', priceRange: [299, 9999], step: 100,
    brands: ['Levi\'s', 'H&M', 'Allen Solly', 'Peter England', 'Puma', 'FabIndia'],
    nouns: ['T-Shirt', 'Denim Jeans', 'Hoodie', 'Formal Shirt', 'Kurta', 'Jacket'],
    adjectives: ['Slim Fit', 'Regular Fit', 'Cotton', 'Oversized', 'Linen', 'Printed'],
    features: ['100% cotton fabric', 'a regular fit', 'machine-washable material', 'a stretchable waistband', 'a soft-touch finish', 'colour-fast dyes'],
  },
  {
    name: 'Books', code: 'BOK', priceRange: [149, 2999], step: 50,
    brands: ['Penguin', 'HarperCollins', 'Rupa', 'Scholastic', 'O\'Reilly'],
    nouns: ['Novel', 'Programming Guide', 'Cookbook', 'Biography', 'Children\'s Book', 'Self-Help Book'],
    adjectives: ['Paperback', 'Hardcover', 'Illustrated', 'Bestselling', 'Collector\'s Edition', 'Annotated'],
    features: ['over 300 pages', 'a foreword by the author', 'full-colour illustrations', 'practical exercises', 'an index and glossary', 'premium paper'],
  },
];

// Small, fast, deterministic PRNG (mulberry32).
export function createRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function slugify(value) {
  return value.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function brandCode(brand) {
  return brand.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3).padEnd(3, 'X');
}

export function generateProducts(count = DEFAULT_COUNT, seed = DEFAULT_SEED) {
  const rand = createRng(seed);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const int = (min, max) => min + Math.floor(rand() * (max - min + 1));
  const products = [];

  for (let i = 0; i < count; i += 1) {
    const category = CATEGORIES[i % CATEGORIES.length];
    const brand = pick(category.brands);
    const noun = pick(category.nouns);
    const adjective = pick(category.adjectives);
    const model = `${String.fromCharCode(65 + int(0, 25))}${int(1, 9) * 10 + int(0, 9)}`;
    const name = `${brand} ${adjective} ${noun} ${model}`;
    const sku = `${category.code}-${brandCode(brand)}-${String(i + 1).padStart(5, '0')}`;

    const [f1, f2] = [pick(category.features), pick(category.features)];
    const featureText = f1 === f2 ? f1 : `${f1} and ${f2}`;
    const description =
      `The ${name} by ${brand} offers ${featureText}. ` +
      `${/^[aeiou]/i.test(adjective) ? 'An' : 'A'} ${adjective.toLowerCase()} choice from our ${category.name.toLowerCase()} range.`;

    // Prices snap to a coarse grid and end in .00 or .99, so many products share
    // the same price (useful for verifying stable tie-breaking).
    const [minP, maxP] = category.priceRange;
    const steps = Math.floor((maxP - minP) / category.step);
    const base = minP + int(0, steps) * category.step;
    const price = rand() < 0.5 ? base : base + 0.99;

    // Ratings between 2.5 and 5.0 with one decimal, skewed upwards; ~3% unrated (0).
    const rating = rand() < 0.03 ? 0 : Math.round((5 - Math.pow(rand(), 1.6) * 2.5) * 10) / 10;

    // ~18% of products are out of stock.
    const inStock = rand() >= 0.18;

    // Spread over ~2 years; about a quarter of products share the exact same timestamp
    // as another product released the same day.
    const daysAgo = int(0, 730);
    const sameInstant = rand() < 0.25;
    const ms = sameInstant ? 0 : int(0, DAY_MS - 1);
    const createdAt = new Date(BASE_DATE - daysAgo * DAY_MS - ms);

    products.push({
      sku,
      name,
      description,
      brand,
      category: category.name,
      price: price.toFixed(2),
      rating: rating.toFixed(1),
      inStock,
      createdAt: createdAt.toISOString(),
      imageUrl: `/api/images/${slugify(category.name)}/${sku}.svg`,
    });
  }
  return products;
}

const COLUMNS = ['sku', 'name', 'description', 'brand', 'category', 'price', 'rating', 'in_stock', 'created_at', 'image_url'];

// Inserts products with multi-row parameterized INSERTs inside the caller's transaction.
export async function insertProducts(client, products, batchSize = 200) {
  for (let start = 0; start < products.length; start += batchSize) {
    const batch = products.slice(start, start + batchSize);
    const values = [];
    const rows = batch.map((p, rowIndex) => {
      values.push(p.sku, p.name, p.description, p.brand, p.category, p.price, p.rating, p.inStock, p.createdAt, p.imageUrl);
      const offset = rowIndex * COLUMNS.length;
      return `(${COLUMNS.map((_, c) => `$${offset + c + 1}`).join(', ')})`;
    });
    await client.query(`INSERT INTO products (${COLUMNS.join(', ')}) VALUES ${rows.join(', ')}`, values);
  }
}

export async function seedDatabase(client, products) {
  await client.query('BEGIN');
  try {
    await client.query('TRUNCATE products RESTART IDENTITY');
    await insertProducts(client, products);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
  await refreshVocabulary(client);
  await client.query('ANALYZE products');
}

// Rebuilds the word list used for typo correction from the current catalogue.
export async function refreshVocabulary(client) {
  await client.query('REFRESH MATERIALIZED VIEW search_vocabulary');
  await client.query('ANALYZE search_vocabulary');
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const countFlag = args.indexOf('--count');
  const count = Number(countFlag !== -1 ? args[countFlag + 1] : process.env.SEED_COUNT || DEFAULT_COUNT);
  if (!Number.isInteger(count) || count < MIN_PRODUCTS) {
    throw new Error(`Product count must be an integer >= ${MIN_PRODUCTS}`);
  }

  const client = new pg.Client({ connectionString: resolveDatabaseUrl(args) });
  await client.connect();
  try {
    await seedDatabase(client, generateProducts(count));
    const { rows } = await client.query('SELECT count(*)::int AS total FROM products');
    console.log(`Seeded ${rows[0].total} products.`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`Seeding failed: ${err.message}`);
    process.exit(1);
  });
}
