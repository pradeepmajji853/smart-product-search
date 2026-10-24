import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';
import { SearchInput, SEARCH_DEBOUNCE_MS } from '../components/SearchInput.jsx';

const FILTERS = {
  categories: [{ value: 'Audio', count: 40 }, { value: 'Laptops', count: 60 }],
  brands: [{ value: 'Bose', count: 30 }, { value: 'Sony', count: 70 }],
  price: { min: 1, max: 1000 },
};

// Fake API: every product name encodes the query it was returned for.
function installFakeApi() {
  const productRequests = [];
  const fetchMock = vi.fn(async (url) => {
    const parsed = new URL(url, 'http://localhost');
    if (parsed.pathname === '/api/filters') return { ok: true, status: 200, json: async () => FILTERS };
    productRequests.push(parsed.searchParams);
    const pageNo = Number(parsed.searchParams.get('page') || 1);
    const label = parsed.searchParams.get('q') || 'item';
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: Array.from({ length: 20 }, (_, i) => ({
          id: pageNo * 100 + i, sku: `SKU-${i}`, name: `${label} product ${i}`, description: 'desc', brand: 'Sony',
          category: 'Audio', price: 100, rating: 4, inStock: true, createdAt: '2025-01-01T00:00:00Z', imageUrl: '/x.svg',
        })),
        pagination: { page: pageNo, limit: 20, total: 100, totalPages: 5, hasNextPage: pageNo < 5, hasPreviousPage: pageNo > 1 },
      }),
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { productRequests, lastQuery: () => productRequests.at(-1).toString() };
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  window.scrollTo = vi.fn();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('SearchInput debouncing', () => {
  it('commits only after the user stops typing for 300ms', () => {
    vi.useFakeTimers();
    const onCommit = vi.fn();
    render(<SearchInput initialValue="" onCommit={onCommit} />);
    const input = screen.getByRole('searchbox');

    for (const value of ['s', 'so', 'son', 'sony']) {
      fireEvent.change(input, { target: { value } });
      act(() => vi.advanceTimersByTime(100));
    }
    expect(onCommit).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 101));
    expect(onCommit).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('sony');
  });

  it('commits immediately on Enter and does not re-commit the same value', () => {
    vi.useFakeTimers();
    const onCommit = vi.fn();
    render(<SearchInput initialValue="" onCommit={onCommit} />);
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'bose ' } });
    fireEvent.submit(input.closest('form'));
    expect(onCommit).toHaveBeenCalledWith('bose');
    act(() => vi.advanceTimersByTime(1000));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});

describe('App search flow', () => {
  it('sends one request for a quickly typed keyword, not one per keystroke', async () => {
    const api = installFakeApi();
    render(<App />);
    await waitFor(() => expect(api.productRequests).toHaveLength(1));

    await userEvent.type(screen.getByRole('searchbox'), 'sony');
    await waitFor(() => expect(api.lastQuery()).toBe('q=sony'));
    await new Promise((r) => setTimeout(r, SEARCH_DEBOUNCE_MS + 50));

    const keywords = api.productRequests.map((p) => p.get('q'));
    expect(keywords).toEqual([null, 'sony']);
    expect(window.location.search).toBe('?q=sony');
    expect(await screen.findByText('product 0', { exact: false })).toHaveTextContent('sony product 0');
  });

  it('restores search, filters, sort and page from a bookmarked URL', async () => {
    window.history.replaceState(null, '', '/?q=sony&brand=Sony&minPrice=10&inStock=true&sort=price_asc&page=2');
    const api = installFakeApi();
    render(<App />);

    expect(screen.getByRole('searchbox')).toHaveValue('sony');
    expect(screen.getByLabelText('Sort by')).toHaveValue('price_asc');
    expect(screen.getByLabelText('Minimum price')).toHaveValue(10);
    expect(screen.getByLabelText('In stock only')).toBeChecked();
    expect(await screen.findByRole('checkbox', { name: /Sony/ })).toBeChecked();
    await waitFor(() => expect(api.lastQuery()).toBe('q=sony&brand=Sony&minPrice=10&inStock=true&sort=price_asc&page=2'));
    expect(await screen.findByText(/Showing 21–40 of 100 products/)).toBeInTheDocument();
  });

  it('keeps search, filters and sort when changing pages', async () => {
    window.history.replaceState(null, '', '/?q=sony&category=Audio&sort=rating_desc');
    const api = installFakeApi();
    render(<App />);
    await screen.findByText(/Showing 1–20 of 100/);

    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(api.lastQuery()).toBe('q=sony&category=Audio&sort=rating_desc&page=2'));
    expect(window.location.search).toBe('?q=sony&category=Audio&sort=rating_desc&page=2');
    expect(await screen.findByText(/Showing 21–40 of 100/)).toBeInTheDocument();
  });

  it('resets to page 1 when the search criteria change', async () => {
    window.history.replaceState(null, '', '/?page=3');
    const api = installFakeApi();
    render(<App />);
    await screen.findByText(/Showing 41–60/);

    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'price_desc' } });
    await waitFor(() => expect(api.lastQuery()).toBe('sort=price_desc'));

    fireEvent.click(await screen.findByRole('button', { name: 'Page 3' }));
    await waitFor(() => expect(api.lastQuery()).toBe('sort=price_desc&page=3'));
    fireEvent.click(screen.getByLabelText('In stock only'));
    await waitFor(() => expect(api.lastQuery()).toBe('inStock=true&sort=price_desc'));
  });

  it('follows browser back/forward navigation', async () => {
    const api = installFakeApi();
    render(<App />);
    await screen.findByText(/Showing 1–20/);

    await userEvent.type(screen.getByRole('searchbox'), 'bose');
    await waitFor(() => expect(window.location.search).toBe('?q=bose'));
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'name_asc' } });
    await waitFor(() => expect(window.location.search).toBe('?q=bose&sort=name_asc'));

    act(() => window.history.back());
    await waitFor(() => expect(screen.getByLabelText('Sort by')).toHaveValue('newest'));
    expect(screen.getByRole('searchbox')).toHaveValue('bose');
    await waitFor(() => expect(api.lastQuery()).toBe('q=bose'));

    act(() => window.history.back());
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveValue(''));
    await waitFor(() => expect(api.lastQuery()).toBe(''));

    act(() => window.history.forward());
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveValue('bose'));
  });

  it('clears the keyword and every filter but keeps the sort order', async () => {
    window.history.replaceState(null, '', '/?q=sony&category=Audio&brand=Sony&maxPrice=500&minRating=4&inStock=true&sort=price_asc&page=2');
    const api = installFakeApi();
    render(<App />);
    await screen.findByText(/Showing 21–40/);

    const aside = screen.getByRole('complementary', { name: 'Filters' });
    fireEvent.click(within(aside).getByRole('button', { name: 'Clear all' }));
    await waitFor(() => expect(api.lastQuery()).toBe('sort=price_asc'));
    expect(window.location.search).toBe('?sort=price_asc');
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(screen.getByLabelText('Maximum price')).toHaveValue(null);
    expect(screen.getByLabelText('Category')).toHaveValue('');
    expect(screen.getByLabelText('In stock only')).not.toBeChecked();
  });

  it('blocks an invalid price range on the client', async () => {
    const api = installFakeApi();
    render(<App />);
    await screen.findByText(/Showing 1–20/);
    const before = api.productRequests.length;

    fireEvent.change(screen.getByLabelText('Minimum price'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Maximum price'), { target: { value: '100' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Minimum price cannot exceed maximum price.');
    await new Promise((r) => setTimeout(r, 650));
    expect(api.productRequests.length).toBe(before);
  });

  it('shows the empty state with a clear-all action', async () => {
    window.history.replaceState(null, '', '/?q=nothing');
    vi.stubGlobal('fetch', vi.fn(async (url) => ({
      ok: true,
      status: 200,
      json: async () => (url.startsWith('/api/filters') ? FILTERS : {
        data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
      }),
    })));
    render(<App />);
    expect(await screen.findByText('No products found')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('main')).getByRole('button', { name: 'Clear all filters' }));
    await waitFor(() => expect(window.location.search).toBe(''));
  });
});
