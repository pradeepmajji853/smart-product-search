import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useProducts } from '../hooks/useProducts.js';

const page = (name) => ({
  data: [{ id: 1, name }],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
});

// A fetch mock whose responses are resolved manually, in any order. It deliberately
// ignores the abort signal, so the request-id guard is tested on its own.
function controllableFetch() {
  const pending = new Map();
  const fetchMock = vi.fn((url, { signal }) => {
    const query = new URL(url, 'http://localhost').searchParams.get('q');
    return new Promise((resolve) => {
      pending.set(query, { resolve: (body) => resolve({ ok: true, status: 200, json: async () => body }), signal });
    });
  });
  return { fetchMock, pending };
}

afterEach(() => vi.unstubAllGlobals());

describe('useProducts', () => {
  it('ignores a slow, outdated response that arrives after a newer one', async () => {
    const { fetchMock, pending } = controllableFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(({ query }) => useProducts(query), { initialProps: { query: 'q=so' } });
    rerender({ query: 'q=sony' });
    await waitFor(() => expect(pending.size).toBe(2));

    // The newer request finishes first...
    await act(async () => pending.get('sony').resolve(page('newer')));
    expect(result.current.data[0].name).toBe('newer');

    // ...then the outdated one finishes and must not overwrite it.
    await act(async () => pending.get('so').resolve(page('outdated')));
    expect(result.current.data[0].name).toBe('newer');
    expect(result.current.status).toBe('success');
  });

  it('aborts the previous request when the query changes', async () => {
    const { fetchMock, pending } = controllableFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = renderHook(({ query }) => useProducts(query), { initialProps: { query: 'q=a' } });
    await waitFor(() => expect(pending.has('a')).toBe(true));
    expect(pending.get('a').signal.aborted).toBe(false);
    rerender({ query: 'q=ab' });
    expect(pending.get('a').signal.aborted).toBe(true);
  });

  it('surfaces API validation messages and recovers on retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Invalid', details: [{ field: 'maxPrice', message: 'maxPrice must be greater than or equal to minPrice' }] } }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => page('ok') });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useProducts('minPrice=5&maxPrice=1'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error.message).toBe('maxPrice must be greater than or equal to minPrice');

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data[0].name).toBe('ok');
  });

  it('reports network failures with a friendly message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const { result } = renderHook(() => useProducts(''));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error.message).toMatch(/Could not reach the server/);
  });
});
