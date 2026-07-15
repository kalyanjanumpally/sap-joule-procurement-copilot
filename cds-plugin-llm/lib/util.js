const DEFAULT_RETRY = { max: 3, baseMs: 500, maxMs: 20000 };
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);

/**
 * Retryable error — throw this from a provider's _chat to signal
 * the outer retry loop that the failure is transient.
 *
 *   throw new RetryableError('rate limited', 429, retryAfterSec)
 */
class RetryableError extends Error {
  constructor(message, status, retryAfterSec) {
    super(message);
    this.name = 'RetryableError';
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

/**
 * Wrap an async fn with exponential-backoff retry.
 * Retries on RetryableError or on non-Retryable errors with matching status.
 * Honors Retry-After hint when provided.
 */
async function withRetry(fn, opts = {}) {
  const cfg = { ...DEFAULT_RETRY, ...opts };
  let attempt = 0;
  let lastErr;
  while (attempt <= cfg.max) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const status = err.status ?? err.statusCode;
      const isRetryable = err instanceof RetryableError || (status && RETRYABLE_STATUS.has(status));
      if (!isRetryable || attempt === cfg.max) throw err;

      const retryAfterMs = err.retryAfterSec ? err.retryAfterSec * 1000 : null;
      const backoffMs = Math.min(cfg.maxMs, cfg.baseMs * 2 ** attempt);
      const jitterMs = Math.floor(Math.random() * backoffMs * 0.25);
      const waitMs = retryAfterMs ?? (backoffMs + jitterMs);

      await new Promise(r => setTimeout(r, waitMs));
      attempt++;
    }
  }
  throw lastErr;
}

/**
 * Given a Response object with a non-ok status, throw either a RetryableError
 * (for retryable statuses) or a plain Error (for permanent failures).
 * Callers should await this instead of manually branching on res.ok.
 */
async function throwFromResponse(res, providerName) {
  const body = await res.text();
  const retryAfter = res.headers.get('retry-after');
  const retryAfterSec = retryAfter ? parseFloat(retryAfter) : null;
  const message = `${providerName} ${res.status}: ${body.slice(0, 400)}`;
  if (RETRYABLE_STATUS.has(res.status)) {
    throw new RetryableError(message, res.status, retryAfterSec);
  }
  const err = new Error(message);
  err.status = res.status;
  throw err;
}

module.exports = { withRetry, RetryableError, throwFromResponse, DEFAULT_RETRY };
