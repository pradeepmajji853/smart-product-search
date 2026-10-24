import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE, parseSearchState, priceRangeError, toSearchString } from '../lib/searchState.js';

describe('URL search state', () => {
  it('round-trips every field through the query string', () => {
    const state = {
      q: 'sony headphones', category: 'Audio', brands: ['Bose', 'Sony'], minPrice: '100', maxPrice: '500.5',
      minRating: '4', inStock: true, sort: 'price_desc', page: 3, exact: true,
    };
    const search = toSearchString(state);
    expect(search).toBe('q=sony+headphones&category=Audio&brand=Bose&brand=Sony&minPrice=100&maxPrice=500.5&minRating=4&inStock=true&sort=price_desc&page=3&exact=true');
    expect(parseSearchState(`?${search}`)).toEqual(state);
  });

  it('only keeps exact=true together with a keyword', () => {
    expect(parseSearchState('?exact=true').exact).toBe(false);
    expect(toSearchString({ ...DEFAULT_STATE, exact: true })).toBe('');
  });

  it('omits default values', () => {
    expect(toSearchString(DEFAULT_STATE)).toBe('');
    expect(parseSearchState('')).toEqual(DEFAULT_STATE);
  });

  it('falls back to defaults for invalid hand-edited values', () => {
    expect(parseSearchState('?page=-2&sort=hack&minRating=9&inStock=yes')).toEqual(DEFAULT_STATE);
    expect(parseSearchState('?page=abc').page).toBe(1);
    expect(parseSearchState('?minPrice=-5&maxPrice=10')).toMatchObject({ minPrice: '', maxPrice: '' });
    expect(parseSearchState('?minPrice=50&maxPrice=10')).toMatchObject({ minPrice: '', maxPrice: '' });
  });

  it('validates price ranges', () => {
    expect(priceRangeError('', '')).toBeNull();
    expect(priceRangeError('10', '10')).toBeNull();
    expect(priceRangeError('-1', '')).toBe('Prices cannot be negative.');
    expect(priceRangeError('20', '10')).toBe('Minimum price cannot exceed maximum price.');
    expect(priceRangeError('abc', '')).toBe('Enter a valid price.');
  });
});
