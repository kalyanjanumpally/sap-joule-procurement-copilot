const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const Module = require('module');
const STUB_PATH = '/tmp/__cds_stub_cache__';
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

const LLMService = require('../lib/LLMService');
const { ResponseCache, hashChatRequest } = require('../lib/util');

// ---- ResponseCache primitive --------------------------------------------

test('ResponseCache: basic set + get + hit stats', () => {
  const c = new ResponseCache({ ttlMs: 1000, maxEntries: 10 });
  c.set('a', { text: 'hello' });
  const got = c.get('a');
  assert.deepEqual(got, { text: 'hello' });
  assert.equal(c.hits, 1);
  assert.equal(c.misses, 0);
});

test('ResponseCache: miss stats + TTL expiry', async () => {
  const c = new ResponseCache({ ttlMs: 20, maxEntries: 10 });
  c.set('a', { text: 'v' });
  await new Promise(r => setTimeout(r, 30));
  const got = c.get('a');
  assert.equal(got, undefined);
  assert.equal(c.misses, 1);
});

test('ResponseCache: maxEntries evicts oldest', () => {
  const c = new ResponseCache({ ttlMs: 60_000, maxEntries: 3 });
  c.set('a', 1); c.set('b', 2); c.set('c', 3); c.set('d', 4);
  assert.equal(c.size(), 3);
  assert.equal(c.get('a'), undefined);  // evicted
  assert.equal(c.get('d'), 4);
});

test('hashChatRequest: same request -> same key regardless of key order', () => {
  const a = hashChatRequest({ model: 'x', messages: [{ role: 'user', content: 'hi' }], maxTokens: 100 });
  const b = hashChatRequest({ maxTokens: 100, messages: [{ role: 'user', content: 'hi' }], model: 'x' });
  assert.equal(a, b);
});

test('hashChatRequest: different content -> different keys', () => {
  const a = hashChatRequest({ model: 'x', messages: [{ role: 'user', content: 'hi' }] });
  const b = hashChatRequest({ model: 'x', messages: [{ role: 'user', content: 'hello' }] });
  assert.notEqual(a, b);
});

// ---- Integration with LLMService.chat ------------------------------------

class StubProvider extends LLMService {
  async init() {
    await super.init();
    this.callCount = 0;
  }
  async _chat(params) {
    this.callCount++;
    return { text: 'response ' + this.callCount, raw: null, usage: {}, stopReason: 'end_turn', model: params.model };
  }
}

test('chat(): identical requests are served from cache on second call', async () => {
  const svc = new StubProvider('llm', null, { modelId: 'm', responseCache: true });
  await svc.init();
  const r1 = await svc.chat({ messages: [{ role: 'user', content: 'hi' }] });
  const r2 = await svc.chat({ messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(r1.text, 'response 1');
  assert.equal(r2.text, 'response 1');    // same
  assert.equal(r2.cached, true);
  assert.equal(svc.callCount, 1);           // only one real call
});

test('chat(): different requests bypass cache', async () => {
  const svc = new StubProvider('llm', null, { modelId: 'm', responseCache: true });
  await svc.init();
  await svc.chat({ messages: [{ role: 'user', content: 'q1' }] });
  await svc.chat({ messages: [{ role: 'user', content: 'q2' }] });
  assert.equal(svc.callCount, 2);
});

test('chat(): tool-use requests always bypass cache (side effects)', async () => {
  const svc = new StubProvider('llm', null, { modelId: 'm', responseCache: true });
  await svc.init();
  await svc.chat({
    messages: [{ role: 'user', content: 'q' }],
    tools: [{ name: 'x', input_schema: { type: 'object' } }],
  });
  await svc.chat({
    messages: [{ role: 'user', content: 'q' }],
    tools: [{ name: 'x', input_schema: { type: 'object' } }],
  });
  assert.equal(svc.callCount, 2);
});

test('chat(): cache disabled by default (no options.responseCache)', async () => {
  const svc = new StubProvider('llm', null, { modelId: 'm' });
  await svc.init();
  await svc.chat({ messages: [{ role: 'user', content: 'q' }] });
  await svc.chat({ messages: [{ role: 'user', content: 'q' }] });
  assert.equal(svc.callCount, 2);
  assert.equal(svc.responseCache, undefined);
});

test('chat(): responseCache config object sets ttl + maxEntries', async () => {
  const svc = new StubProvider('llm', null, {
    modelId: 'm',
    responseCache: { ttlMs: 30, maxEntries: 2 },
  });
  await svc.init();
  await svc.chat({ messages: [{ role: 'user', content: 'q1' }] });
  assert.equal(svc.responseCache.size(), 1);
  await new Promise(r => setTimeout(r, 40));
  // Second identical call after TTL — cache miss, real call
  await svc.chat({ messages: [{ role: 'user', content: 'q1' }] });
  assert.equal(svc.callCount, 2);
});
