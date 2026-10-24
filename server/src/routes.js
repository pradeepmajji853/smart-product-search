import { Router } from 'express';
import { filterOptionsQuerySchema, productQuerySchema, suggestionQuerySchema } from './validation.js';
import { getSuggestions } from './suggestions.js';
import { searchProducts } from './productQuery.js';
import { renderPlaceholder } from './placeholder.js';
import { HttpError } from './errors.js';

export function createApiRouter(db) {
  const router = Router();

  router.get('/health', async (req, res) => {
    try {
      await db.query('SELECT 1');
      res.json({ status: 'ok', database: 'up' });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'down' });
    }
  });

  router.get('/products', async (req, res, next) => {
    try {
      const filters = productQuerySchema.parse(req.query);
      res.json(await searchProducts(db, filters));
    } catch (err) {
      next(err);
    }
  });

  router.get('/suggestions', async (req, res, next) => {
    try {
      const query = suggestionQuerySchema.parse(req.query);
      res.json({ suggestions: await getSuggestions(db, query) });
    } catch (err) {
      next(err);
    }
  });

  // Brand options (and their counts) are narrowed to the selected categories, if any.
  router.get('/filters', async (req, res, next) => {
    try {
      const { category } = filterOptionsQuerySchema.parse(req.query);
      const brandWhere = category.length > 0 ? 'WHERE category = ANY($1::text[])' : '';
      const [categories, brands, price] = await Promise.all([
        db.query('SELECT category AS value, count(*)::int AS count FROM products GROUP BY category ORDER BY category'),
        db.query(
          `SELECT brand AS value, count(*)::int AS count FROM products ${brandWhere} GROUP BY brand ORDER BY brand`,
          category.length > 0 ? [category] : [],
        ),
        db.query('SELECT coalesce(min(price), 0)::float8 AS min, coalesce(max(price), 0)::float8 AS max FROM products'),
      ]);
      res.json({ categories: categories.rows, brands: brands.rows, price: price.rows[0] });
    } catch (err) {
      next(err);
    }
  });

  router.get('/images/:category/:label.svg', (req, res, next) => {
    const { category, label } = req.params;
    if (!/^[a-z0-9-]{1,40}$/.test(category) || !/^[A-Z0-9-]{1,32}$/.test(label)) {
      return next(new HttpError(404, 'NOT_FOUND', 'Image not found'));
    }
    res.set('Cache-Control', 'public, max-age=86400, immutable');
    res.type('image/svg+xml').send(renderPlaceholder(category, label));
  });

  return router;
}
