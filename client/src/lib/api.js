export class ApiError extends Error {
  constructor(message, { status, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details || [];
  }
}

async function getJson(url, signal) {
  let res;
  try {
    res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Could not reach the server. Check your connection and try again.');
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON response (e.g. a proxy error page) - handled below.
  }
  if (!res.ok) {
    const message =
      body?.error?.details?.map((d) => d.message).join('. ') ||
      body?.error?.message ||
      `Request failed (HTTP ${res.status}).`;
    throw new ApiError(message, { status: res.status, details: body?.error?.details });
  }
  if (!body) throw new ApiError('The server returned an unexpected response.');
  return body;
}

export const fetchProducts = (queryString, signal) =>
  getJson(`/api/products${queryString ? `?${queryString}` : ''}`, signal);

export const fetchFilterOptions = (category, signal) =>
  getJson(`/api/filters${category ? `?${new URLSearchParams({ category })}` : ''}`, signal);

export const fetchSuggestions = (q, signal) => getJson(`/api/suggestions?${new URLSearchParams({ q })}`, signal);
