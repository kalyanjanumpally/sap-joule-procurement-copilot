const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const Module = require('module');
const STUB_PATH = '/tmp/__cds_stub_stream__';
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
const OllamaLLMService = require('../lib/providers/ollama');

// ---- fetch mock ---------------------------------------------------------

const origFetch = global.fetch;

/**
 * Turn a list of string chunks into a mock Response with an async-iterable
 * body of Uint8Arrays. Simulates the fetch response body a real HTTP stream
 * would produce.
 */
function mockStreamResponse(chunks) {
  const encoder = new TextEncoder();
  const iter = (async function* () {
    for (const c of chunks) yield encoder.encode(c);
  })();
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    body: iter,
  };
}

function mockErrorResponse(status, message = 'error') {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    text: async () => message,
  };
}

beforeEach(() => { global.fetch = null; });
afterEach(()  => { global.fetch = origFetch; });

async function collect(asyncIterable) {
  const out = [];
  for await (const v of asyncIterable) out.push(v);
  return out;
}

// ---- OpenAI-compat SSE --------------------------------------------------

test('OpenAI-compat stream: yields text_delta per chunk, done at end', async () => {
  const sse = [
    'data: {"choices":[{"delta":{"content":"Hello"},"index":0}]}\n\n',
    'data: {"choices":[{"delta":{"content":" "},"index":0}]}\n\n',
    'data: {"choices":[{"delta":{"content":"world"},"index":0,"finish_reason":"stop"}],"model":"gpt-4o","usage":{"prompt_tokens":10,"completion_tokens":3}}\n\n',
    'data: [DONE]\n\n',
  ];
  global.fetch = async () => mockStreamResponse(sse);

  const svc = new OpenAICompatibleLLMService('llm', null, {
    credentials: { baseUrl: 'https://api.example.com/v1', apiKey: 'k' },
    modelId: 'gpt-4o',
  });
  await svc.init();
  const chunks = await collect(svc.stream({ messages: [{ role: 'user', content: 'hi' }] }));

  const deltas = chunks.filter(c => c.type === 'text_delta').map(c => c.text);
  assert.deepEqual(deltas, ['Hello', ' ', 'world']);

  const done = chunks.find(c => c.type === 'done');
  assert.ok(done, 'done chunk missing');
  assert.equal(done.text, 'Hello world');
  assert.equal(done.stopReason, 'stop');
  assert.equal(done.model, 'gpt-4o');
  assert.equal(done.usage.input_tokens, 10);
  assert.equal(done.usage.output_tokens, 3);
});

test('OpenAI-compat stream: handles chunk boundaries mid-event', async () => {
  // Split a single event across two network chunks
  const sse = [
    'data: {"choices":[{"delta":{"content":"Hel',
    'lo"}}]}\n\ndata: {"choices":[{"delta":{"content":" world"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
  ];
  global.fetch = async () => mockStreamResponse(sse);

  const svc = new OpenAICompatibleLLMService('llm', null, {
    credentials: { baseUrl: 'https://api.example.com/v1', apiKey: 'k' },
    modelId: 'gpt-4o',
  });
  await svc.init();
  const chunks = await collect(svc.stream({ messages: [{ role: 'user', content: 'hi' }] }));
  const deltas = chunks.filter(c => c.type === 'text_delta').map(c => c.text);
  assert.deepEqual(deltas, ['Hello', ' world']);
  const done = chunks.find(c => c.type === 'done');
  assert.equal(done.text, 'Hello world');
});

test('OpenAI-compat stream: rejects on non-ok upstream', async () => {
  global.fetch = async () => mockErrorResponse(500, 'oops');
  const svc = new OpenAICompatibleLLMService('llm', null, {
    credentials: { baseUrl: 'https://api.example.com/v1', apiKey: 'k' },
    modelId: 'gpt-4o',
  });
  await svc.init();
  await assert.rejects(() => collect(svc.stream({ messages: [{ role: 'user', content: 'hi' }] })), /500/);
});

test('OpenAI-compat stream: request body has stream:true', async () => {
  let captured;
  global.fetch = async (url, init) => {
    captured = JSON.parse(init.body);
    return mockStreamResponse(['data: [DONE]\n\n']);
  };
  const svc = new OpenAICompatibleLLMService('llm', null, {
    credentials: { baseUrl: 'https://api.example.com/v1', apiKey: 'k' },
    modelId: 'gpt-4o',
  });
  await svc.init();
  await collect(svc.stream({ messages: [{ role: 'user', content: 'hi' }] }));
  assert.equal(captured.stream, true);
  assert.deepEqual(captured.stream_options, { include_usage: true });
});

// ---- Ollama NDJSON ------------------------------------------------------

test('Ollama stream: yields text_delta per line, done from final message', async () => {
  const ndjson = [
    '{"message":{"content":"Hello"}}\n',
    '{"message":{"content":" "}}\n',
    '{"message":{"content":"world"}}\n',
    '{"done":true,"done_reason":"stop","model":"qwen2.5:14b","prompt_eval_count":10,"eval_count":3,"message":{"content":""}}\n',
  ];
  global.fetch = async () => mockStreamResponse(ndjson);

  const svc = new OllamaLLMService('llm', null, {
    credentials: { baseUrl: 'http://localhost:11434' },
    modelId: 'qwen2.5:14b',
  });
  await svc.init();
  const chunks = await collect(svc.stream({ messages: [{ role: 'user', content: 'hi' }] }));

  const deltas = chunks.filter(c => c.type === 'text_delta').map(c => c.text);
  assert.deepEqual(deltas, ['Hello', ' ', 'world']);

  const done = chunks.find(c => c.type === 'done');
  assert.ok(done);
  assert.equal(done.text, 'Hello world');
  assert.equal(done.stopReason, 'stop');
  assert.equal(done.model, 'qwen2.5:14b');
  assert.equal(done.usage.input_tokens, 10);
  assert.equal(done.usage.output_tokens, 3);
});

test('Ollama stream: handles chunk boundaries mid-line', async () => {
  const ndjson = [
    '{"message":{"content":"Hel',
    'lo"}}\n{"message":{"content":" world"}}\n{"done":true,"done_reason":"stop","model":"m","message":{"content":""}}\n',
  ];
  global.fetch = async () => mockStreamResponse(ndjson);

  const svc = new OllamaLLMService('llm', null, {
    credentials: { baseUrl: 'http://localhost:11434' },
    modelId: 'm',
  });
  await svc.init();
  const chunks = await collect(svc.stream({ messages: [{ role: 'user', content: 'hi' }] }));
  const deltas = chunks.filter(c => c.type === 'text_delta').map(c => c.text);
  assert.deepEqual(deltas, ['Hello', ' world']);
});

test('base LLMService: stream() rejects empty messages', async () => {
  const OpenAI = require('../lib/providers/openai-compatible');
  const svc = new OpenAI('llm', null, {
    credentials: { baseUrl: 'https://api.example.com/v1', apiKey: 'k' },
    modelId: 'gpt-4o',
  });
  await svc.init();
  await assert.rejects(() => collect(svc.stream({ messages: [] })), /messages/);
});
