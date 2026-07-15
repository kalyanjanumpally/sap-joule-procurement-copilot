const { test } = require('node:test');
const assert = require('node:assert/strict');
const { withRetry, RetryableError } = require('../lib/util');

test('withRetry passes through on first success', async () => {
  let calls = 0;
  const res = await withRetry(() => { calls++; return 'ok'; });
  assert.equal(res, 'ok');
  assert.equal(calls, 1);
});

test('withRetry retries RetryableError and eventually succeeds', async () => {
  let calls = 0;
  const res = await withRetry(
    () => {
      calls++;
      if (calls < 3) throw new RetryableError('temporary', 429);
      return 'ok';
    },
    { baseMs: 1, maxMs: 5 },
  );
  assert.equal(res, 'ok');
  assert.equal(calls, 3);
});

test('withRetry throws non-retryable errors immediately', async () => {
  let calls = 0;
  await assert.rejects(
    () => withRetry(() => { calls++; throw new Error('permanent'); }, { baseMs: 1 }),
    /permanent/,
  );
  assert.equal(calls, 1);
});

test('withRetry throws after max retries exhausted', async () => {
  let calls = 0;
  await assert.rejects(
    () => withRetry(
      () => { calls++; throw new RetryableError('always fails', 503); },
      { max: 2, baseMs: 1, maxMs: 5 },
    ),
    /always fails/,
  );
  assert.equal(calls, 3); // initial + 2 retries
});

test('withRetry detects status-based retryability without RetryableError', async () => {
  let calls = 0;
  const res = await withRetry(
    () => {
      calls++;
      if (calls === 1) {
        const err = new Error('rate limited');
        err.status = 429;
        throw err;
      }
      return 'recovered';
    },
    { baseMs: 1, maxMs: 5 },
  );
  assert.equal(res, 'recovered');
  assert.equal(calls, 2);
});
