import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';

const FILTERS = {
  categories: [{ value: 'Audio', count: 40 }],
  brands: [{ value: 'Bose', count: 30 }, { value: 'Sony', count: 70 }],
  price: { min: 1, max: 1000 },
};
const SUGGESTIONS = {
  son: [
    { type: 'brand', value: 'Sony', count: 70 },
    { type: 'product', id: 7, value: 'Sony Sport Headphones X55', brand: 'Sony', category: 'Audio' },
  ],
  aud: [{ type: 'category', value: 'Audio', count: 40 }],
  sonny: [{ type: 'correction', value: 'sony' }],
  sony: [{ type: 'product', id: 8, value: 'Sony Sport Headphones X56', brand: 'Sony', category: 'Audio' }],
};

const page = (q, { correctedQuery = null, total = 1 } = {}) => ({
  data: total
    ? [{ id: 1, sku: 'AUD-1', name: `${correctedQuery || q || 'item'} product`, description: 'd', brand: 'Sony', category: 'Audio', price: 10, rating: 4, inStock: true, createdAt: '2025-01-01T00:00:00Z', imageUrl: '/x.svg' }]
    : [],
  pagination: { page: 1, limit: 20, total, totalPages: total ? 1 : 0, hasNextPage: false, hasPreviousPage: false },
  correctedQuery,
});

// Fake API. `suggestionDelays` lets a test make specific suggestion responses slow.
function installFakeApi({ suggestionDelays = {}, products = (params) => page(params.get('q')) } = {}) {
  const calls = { suggestions: [], products: [] };
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const parsed = new URL(url, 'http://localhost');
    const json = (body) => ({ ok: true, status: 200, json: async () => body });
    if (parsed.pathname === '/api/filters') return json(FILTERS);
    if (parsed.pathname === '/api/suggestions') {
      const q = parsed.searchParams.get('q');
      calls.suggestions.push(q);
      if (suggestionDelays[q]) await new Promise((r) => setTimeout(r, suggestionDelays[q]));
      return json({ suggestions: SUGGESTIONS[q] || [] });
    }
    calls.products.push(parsed.searchParams.toString());
    return json(products(parsed.searchParams));
  }));
  return calls;
}

const searchBox = () => screen.getByRole('combobox', { name: 'Search products' });
// Scoped to the suggestions list: the page's <select> elements also contain role="option".
const suggestionList = () => screen.findByRole('listbox', { name: 'Search suggestions' });
const findSuggestions = async () => within(await suggestionList()).getAllByRole('option');

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  window.scrollTo = vi.fn();
});
afterEach(() => vi.unstubAllGlobals());

describe('search autocomplete', () => {
  it('shows brand and product suggestions as the user types', async () => {
    installFakeApi();
    render(<App />);
    await userEvent.type(searchBox(), 'son');

    const list = await screen.findByRole('listbox', { name: 'Search suggestions' });
    const options = within(list).getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('Sony');
    expect(options[0]).toHaveTextContent('Brand · 70 products');
    expect(options[1]).toHaveTextContent('Sony Sport Headphones X55');
    expect(searchBox()).toHaveAttribute('aria-expanded', 'true');
  });

  it('applies a brand filter when a brand suggestion is chosen with the keyboard', async () => {
    const calls = installFakeApi();
    render(<App />);
    await userEvent.type(searchBox(), 'son');
    await suggestionList();

    fireEvent.keyDown(searchBox(), { key: 'ArrowDown' });
    expect(searchBox()).toHaveAttribute('aria-activedescendant', 'search-suggestions-0');
    expect((await findSuggestions())[0]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(searchBox(), { key: 'Enter' });

    await waitFor(() => expect(window.location.search).toBe('?brand=Sony'));
    expect(searchBox()).toHaveValue('');
    expect(screen.getByRole('checkbox', { name: /Sony/ })).toBeChecked();
    await waitFor(() => expect(calls.products.at(-1)).toBe('brand=Sony'));
  });

  it('searches for a product name when a product suggestion is clicked', async () => {
    installFakeApi();
    render(<App />);
    await userEvent.type(searchBox(), 'son');
    const options = await findSuggestions();
    fireEvent.mouseDown(options[1]);

    await waitFor(() => expect(window.location.search).toBe('?q=Sony+Sport+Headphones+X55'));
    expect(searchBox()).toHaveValue('Sony Sport Headphones X55');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('applies a category filter when a category suggestion is chosen', async () => {
    installFakeApi();
    render(<App />);
    await userEvent.type(searchBox(), 'aud');
    const [audio] = await findSuggestions();
    expect(audio).toHaveTextContent('Category · 40 products');
    fireEvent.mouseDown(audio);
    await waitFor(() => expect(window.location.search).toBe('?category=Audio'));
    expect(screen.getByLabelText('Category')).toHaveValue('Audio');
  });

  it('offers "did you mean" and searches for the correction when chosen', async () => {
    installFakeApi();
    render(<App />);
    await userEvent.type(searchBox(), 'sonny');
    await waitFor(async () => expect(await findSuggestions()).toHaveLength(1));
    const [option] = await findSuggestions();
    expect(option).toHaveTextContent('Did you mean sony?');
    fireEvent.mouseDown(option);
    await waitFor(() => expect(window.location.search).toBe('?q=sony'));
  });

  it('never shows suggestions from an outdated request', async () => {
    // The response for "son" is slow and arrives after the one for "sony".
    const saved = SUGGESTIONS.son;
    SUGGESTIONS.son = [{ type: 'brand', value: 'OUTDATED', count: 1 }];
    const calls = installFakeApi({ suggestionDelays: { son: 400 } });
    render(<App />);
    await userEvent.type(searchBox(), 'son');
    await waitFor(() => expect(calls.suggestions).toContain('son'));
    await userEvent.type(searchBox(), 'y');

    await waitFor(async () => expect((await findSuggestions()).map((o) => o.textContent).join()).toContain('X56'));
    await act(() => new Promise((r) => setTimeout(r, 500)));
    expect(screen.queryByText('OUTDATED')).not.toBeInTheDocument();
    SUGGESTIONS.son = saved;
  });

  it('closes on Escape and does not request suggestions for fewer than 3 characters', async () => {
    const calls = installFakeApi();
    render(<App />);
    await userEvent.type(searchBox(), 'so');
    await act(() => new Promise((r) => setTimeout(r, 250)));
    expect(calls.suggestions).toEqual([]);

    await userEvent.type(searchBox(), 'n');
    await suggestionList();
    fireEvent.keyDown(searchBox(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(searchBox()).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('typo correction banner', () => {
  it('explains the correction, highlights the corrected terms and offers the exact search', async () => {
    window.history.replaceState(null, '', '/?q=sonny');
    const calls = installFakeApi({
      products: (params) => (params.get('exact') === 'true' ? page('sonny', { total: 0 }) : page('sonny', { correctedQuery: 'sony' })),
    });
    render(<App />);

    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent('No results for “sonny”. Showing results for “sony”.');
    expect(screen.getByText('sony', { selector: 'mark' })).toBeInTheDocument();

    fireEvent.click(within(banner).getByRole('button', { name: 'Search instead for “sonny”' }));
    await waitFor(() => expect(window.location.search).toBe('?q=sonny&exact=true'));
    await waitFor(() => expect(calls.products.at(-1)).toBe('q=sonny&exact=true'));
    expect(await screen.findByText('No products found')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('re-enables correction when a new keyword is typed', async () => {
    window.history.replaceState(null, '', '/?q=sonny&exact=true');
    installFakeApi({ products: () => page('x', { total: 0 }) });
    render(<App />);
    await screen.findByText('No products found');
    await userEvent.clear(searchBox());
    await userEvent.type(searchBox(), 'bose');
    await waitFor(() => expect(window.location.search).toBe('?q=bose'));
  });
});
