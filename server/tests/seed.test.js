import { describe, expect, it } from 'vitest';
import { generateProducts, insertProducts, MIN_PRODUCTS } from '../../database/seed.js';
import { setupTestApp } from './helpers.js';

const { pool } = setupTestApp();

describe('seed data generator', () => {
  const products = generateProducts(1000);

  it('generates at least the required number of products', () => {
    expect(products.length).toBe(1000);
    expect(products.length).toBeGreaterThanOrEqual(MIN_PRODUCTS);
  });

  it('is deterministic', () => {
    expect(generateProducts(1000)).toEqual(products);
  });

  it('produces unique SKUs and valid field values', () => {
    expect(new Set(products.map((p) => p.sku)).size).toBe(products.length);
    for (const p of products) {
      expect(p.sku).toMatch(/^[A-Z0-9][A-Z0-9-]*$/);
      expect(Number(p.price)).toBeGreaterThanOrEqual(0);
      expect(Number(p.rating)).toBeGreaterThanOrEqual(0);
      expect(Number(p.rating)).toBeLessThanOrEqual(5);
      expect(p.name.trim()).not.toBe('');
      expect(p.description.trim()).not.toBe('');
    }
  });

  it('covers multiple categories, brands and stock states, with duplicate sort values', () => {
    expect(new Set(products.map((p) => p.category)).size).toBeGreaterThanOrEqual(10);
    expect(new Set(products.map((p) => p.brand)).size).toBeGreaterThanOrEqual(30);
    expect(products.some((p) => p.inStock)).toBe(true);
    expect(products.some((p) => !p.inStock)).toBe(true);
    expect(new Set(products.map((p) => p.price)).size).toBeLessThan(products.length);
    expect(new Set(products.map((p) => p.rating)).size).toBeLessThan(products.length);
    expect(new Set(products.map((p) => p.createdAt)).size).toBeLessThan(products.length);
  });

  it('satisfies every database constraint when inserted', async () => {
    // Insert inside a transaction that is rolled back, leaving the fixture data intact.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('TRUNCATE products');
      await insertProducts(client, products);
      const { rows } = await client.query('SELECT count(*)::int AS n FROM products');
      expect(rows[0].n).toBe(1000);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
