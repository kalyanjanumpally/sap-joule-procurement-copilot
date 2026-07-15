const { test } = require('node:test');
const assert = require('node:assert/strict');

// Stub @sap/cds so tests run without installing it (which conflicts with
// consuming apps' node_modules when using file: deps during development).
const Module = require('module');
const STUB_PATH = '/tmp/__cds_stub_llm_test__';
require.cache[STUB_PATH] = {
  exports: {
    Service: class {
      constructor(name, model, options) { this.options = options ?? {}; }
      async init() {}
    },
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

class StubProvider extends LLMService {
  async init() {
    await super.init();
    this.calls = [];
  }
  async _chat(params) {
    this.calls.push(params);
    return { text: 'ok', raw: null, usage: {}, stopReason: 'end_turn', model: params.model };
  }
}

test('chat() rejects empty messages', async () => {
  const svc = new StubProvider('llm', null, { modelId: 'test-model' });
  await svc.init();
  await assert.rejects(() => svc.chat({}), /messages/);
  await assert.rejects(() => svc.chat({ messages: [] }), /messages/);
});

test('chat() merges defaults and forwards to _chat', async () => {
  const svc = new StubProvider('llm', null, { model: 'test-model', maxTokens: 500 });
  await svc.init();
  const res = await svc.chat({ messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(res.text, 'ok');
  assert.equal(svc.calls[0].model, 'test-model');
  assert.equal(svc.calls[0].maxTokens, 500);
});

test('chat() lets caller override model + maxTokens', async () => {
  const svc = new StubProvider('llm', null, { model: 'default' });
  await svc.init();
  await svc.chat({
    model: 'override',
    maxTokens: 42,
    messages: [{ role: 'user', content: 'x' }],
  });
  assert.equal(svc.calls[0].model, 'override');
  assert.equal(svc.calls[0].maxTokens, 42);
});

test('base _chat throws for unimplemented providers', async () => {
  const svc = new LLMService('llm', null, {});
  await svc.init();
  await assert.rejects(
    () => svc.chat({ messages: [{ role: 'user', content: 'x' }] }),
    /implement _chat/,
  );
});
