import { ZodError } from 'zod';
import { formatZodError } from './validation.js';

export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// node-postgres / network errors that mean "the database is unreachable" rather than
// "the query is wrong". SQLSTATE class 08 = connection exception, 57P0x = shutdown,
// 3D000 = database does not exist, 28xxx = authentication failure.
const UNAVAILABLE_NETWORK_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH']);

export function isDatabaseUnavailable(err) {
  if (!err) return false;
  const code = String(err.code || '');
  return (
    UNAVAILABLE_NETWORK_CODES.has(code) ||
    code.startsWith('08') ||
    code.startsWith('57P') ||
    code.startsWith('28') ||
    code === '3D000' ||
    /timeout exceeded when trying to connect|Connection terminated/i.test(err.message || '')
  );
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.baseUrl}${req.path} not found` } });
}

// Central error handler: logs the real error server-side and returns a safe,
// consistent JSON body. SQL text, stack traces and connection strings never leave the server.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters', details: formatZodError(err) },
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err?.type === 'entity.parse.failed' || err?.status === 400) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Malformed request' } });
  }

  const unavailable = isDatabaseUnavailable(err);
  if (process.env.NODE_ENV !== 'test') {
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err?.code || '', err?.message);
  }
  if (unavailable) {
    return res.status(503).json({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'The product database is temporarily unavailable. Please try again.' },
    });
  }
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
}
