const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const Module = require('module');
const STUB_PATH = '/tmp/__cds_stub_embed__';
require.cache[STUB_PATH] = {
  exports: {
    Service: class { constructor(name, model, options) { this.options = options ?? {}; } async init() {} },
    log: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
  },
  loaded: true,
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function(request, ...rest) {
  if (request === '@sap/cds') return STUB_PATH;
  return origResolve.call(this, request, ...rest);
};

const OpenAICompatibleLLMService = require('../lib/providers/openai-compatible');
const GroqLLMService = require('../lib/providers/groq');

// ---- fetch mock ----------------------------------------------------------

let lastRequest;
const origFetch = global.fetch;

function mockEmbeddingsResponse(embeddings, model = 'test-embed-model') {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({
      object: 'list',
      data: embeddings.map((emb, index) => ({ object: 'embedding', index, embedding: emb })),
      model,
      usage: { prompt_tokens: 8, total_tokens: 8 },
    }),
    text: async () => '',
  };
}

beforeEach(() => {
  lastRequest = null;
  global.fetch = async (url, init) => {
    lastRequest = { url, init, body: init?.body ? JSON.parse(init.body) : null };
    return mockEmbeddingsResponse([[0.1, 0.2, 0.3, 0.4]], 'text-embedding-3-small');
  };
});
afterEach(() => { global.fetch = origFetch; });

// ---- tests ---------------------------------------------------------------

test('embed: single string input hits /embeddings with correct body', async () => {
  const svc = new OpenAICompatibleLLMService('llm', null, {
    credentials: { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test' },
    modelId: 'text-embedding-3-small',
  });
  await svc.init();
  const res = await svc.embed({ input: 'hello world' });

  assert.equal(lastRequest.url, 'https://api.openai.com/v1/embeddings');
  assert.equal(lastRequest.init.method, 'POST');
  assert.equal(lastRequest.init.headers.authorization, 'Bearer sk-test');
  assert.deepEqual(lastRequest.body, { model: 'text-embedding-3-small', input: 'hello world' });
  assert.equal(res.embeddings.length, 1);
  assert.deepEqual(res.embeddings[0], [0.1, 0.2, 0.3, 0.4]);
  assert.equal(res.model, 'text-embedding-3-small');
});

test('embed: array input is forwarded as-is', async () => {
  global.fetch = async (url, init) => {
    lastRequest = { url, init, body: JSON.parse(init.body) };
    return mockEmbeddingsResponse([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]);
  };
  const svc = new OpenAICompatibleLLMService('llm', null, {
    credentials: { baseUrl: 'https://x/v1', apiKey: 'k' },
    modelId: 'emb',
  });
  await svc.init();
  const res = await svc.embed({ input: ['a', 'b', 'c'] });
  assert.deepEqual(lastRequest.body.input, ['a', 'b', 'c']);
  assert.equal(res.embeddings.length, 3);
  assert.deepEqual(res.embeddings, [[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
});

test('embed: per-call model override wins over default', async () => {
  const svc = new OpenAICompatibleLLMService('llm', null, {
    credentials: { baseUrl: 'https://x/v1', apiKey: 'k' },
    modelId: 'default-model',
  });
  await svc.init();
  await svc.embed({ input: 'x', model: 'override-model' });
  assert.equal(lastRequest.body.model, 'override-model');
});

test('embed: 500 response surfaces as retryable-typed error', async () => {
  global.fetch = async () => ({
    ok: false,
    status: 500,
    headers: { get: () => null },
    text: async () => 'internal error',
  });
  const svc = new OpenAICompatibleLLMService('llm', null, {
    credentials: { baseUrl: 'https://x/v1', apiKey: 'k' },
    modelId: 'emb',
  });
  await svc.init();
  // withRetry will retry 500s a few times before finally throwing
  await assert.rejects(
    () => svc.embed({ input: 'x', retries: { max: 0 } }),
    /500/,
  );
});

test('embed: GroqLLMService inherits _embed from OpenAI-compat', async () => {
  process.env.GROQ_API_KEY = 'gsk-test';
  const svc = new GroqLLMService('llm', null, { modelId: 'nomic-embed-text-v1.5' });
  await svc.init();
  const res = await svc.embed({ input: 'hello from groq' });
  assert.ok(lastRequest.url.startsWith('https://api.groq.com/openai/v1/embeddings'));
  assert.equal(lastRequest.init.headers.authorization, 'Bearer gsk-test');
  assert.deepEqual(res.embeddings[0], [0.1, 0.2, 0.3, 0.4]);
  delete process.env.GROQ_API_KEY;
});
