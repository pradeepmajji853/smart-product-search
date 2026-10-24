import { useState } from 'react';
import { Highlight } from './Highlight.jsx';
import { formatPrice } from '../lib/format.js';

function Stars({ rating }) {
  return (
    <span className="flex items-center gap-1 text-sm" aria-label={`Rated ${rating.toFixed(1)} out of 5`}>
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 text-amber-400" fill="currentColor">
        <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
      </svg>
      <span className="font-medium text-slate-700">{rating > 0 ? rating.toFixed(1) : 'No ratings'}</span>
    </span>
  );
}

export function ProductCard({ product, terms }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <article className="flex w-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="aspect-[4/3] bg-slate-100">
        {imageFailed ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">Image unavailable</div>
        ) : (
          <img
            src={product.imageUrl}
            alt={product.name}
            width="400"
            height="300"
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-semibold uppercase tracking-wide text-indigo-600">
            <Highlight text={product.brand} terms={terms} />
          </span>
          <span className="truncate text-slate-500">
            <Highlight text={product.category} terms={terms} />
          </span>
        </div>
        <h2 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">
          <Highlight text={product.name} terms={terms} />
        </h2>
        <p className="line-clamp-2 text-xs text-slate-500">
          <Highlight text={product.description} terms={terms} />
        </p>
        <p className="font-mono text-[11px] text-slate-400">
          SKU: <Highlight text={product.sku} terms={terms} />
        </p>
        <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-2">
          <div>
            <p className="text-lg font-bold text-slate-900">{formatPrice(product.price)}</p>
            <Stars rating={product.rating} />
          </div>
          <span
            className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
              product.inStock ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            }`}
          >
            {product.inStock ? 'In stock' : 'Out of stock'}
          </span>
        </div>
      </div>
    </article>
  );
}
