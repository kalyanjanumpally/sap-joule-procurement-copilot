const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// Stub @sap/cds
const Module = require('module');
const STUB_PATH = '/tmp/__cds_stub_vision__';
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
const { imageFromUrl, imageFromBase64, imageFromFile } = require('../lib/util');

// ---- fetch mock ----------------------------------------------------------

let lastRequest;
const origFetch = global.fetch;

beforeEach(() => {
  lastRequest = null;
  global.fetch = async (url, init) => {
    lastRequest = { url, init, body: init?.body ? JSON.parse(init.body) : null };
    // Return a minimal OpenAI/Ollama-shape success
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        choices: [{ message: { content: 'ok', role: 'assistant' }, finish_reason: 'stop' }],
        message: { content: 'ok' },
        usage: { prompt_tokens: 1, completion_tokens: 1 },
        prompt_eval_count: 1, eval_count: 1,
        model: 'test-model',
        done_reason: 'stop',
      }),
      text: async () => '',
    };
  };
});

afterEach(() => {
  global.fetch = origFetch;
});

// ---- helpers -------------------------------------------------------------

test('imageFromUrl builds a plugin-shape image block', () => {
  const img = imageFromUrl('https://example.com/foo.png');
  assert.deepEqual(img, {
    type: 'image',
    source: { type: 'url', url: 'https://example.com/foo.png' },
  });
});

test('imageFromBase64 builds a plugin-shape image block with media_type', () => {
  const img = imageFromBase64('aGVsbG8=', 'image/jpeg');
  assert.deepEqual(img, {
    type: 'image',
    source: { type: 'base64', media_type: 'image/jpeg', data: 'aGVsbG8=' },
  });
});

test('imageFromFile reads a file, base64-encodes, detects PNG', async () => {
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const path = require('node:path');
  const tmp = path.join(os.tmpdir(), `vision-test-${Date.now()}.png`);
  await fs.writeFile(tmp, Buffer.from([0x89, 0x50, 0x4e, 0x47])); // PNG magic
  try {
    const img = await imageFromFile(tmp);
    assert.equal(img.type, 'image');
    assert.equal(img.source.type, 'base64');
    assert.equal(img.source.media_type, 'image/png');
    assert.equal(img.source.data, 'iVBORw==');
  } finally {
    await fs.unlink(tmp);
  }
});

test('imageFromFile throws on unsupported extension', async () => {
  await assert.rejects(() => imageFromFile('/tmp/foo.txt'), /unsupported extension/i);
});

// ---- OpenAI-compat provider ---------------------------------------------

test('OpenAI-compat: image URL block becomes {type:"image_url", image_url:{url}}', async () => {
  const svc = new OpenAICompatibleLLMService('llm', null, {
    credentials: { baseUrl: 'https://api.example.com/v1', apiKey: 'test-key' },
    modelId: 'gpt-4o',
  });
  await svc.init();
  await svc.chat({
    messages: [{
      role: 'user',
      content: [
        imageFromUrl('https://example.com/invoice.png'),
        { type: 'text', text: 'Extract line items' },
      ],
    }],
    maxTokens: 100,
  });
  const userMsg = lastRequest.body.messages.find(m => m.role === 'user');
  assert.ok(Array.isArray(userMsg.content), 'user content should be a multi-part array');
  assert.deepEqual(userMsg.content[0], {
    type: 'image_url',
    image_url: { url: 'https://example.com/invoice.png' },
  });
  assert.deepEqual(userMsg.content[1], { type: 'text', text: 'Extract line items' });
});

test('OpenAI-compat: base64 image becomes data URL in image_url', async () => {
  const svc = new OpenAICompatibleLLMService('llm', null, {
    credentials: { baseUrl: 'https://api.example.com/v1', apiKey: 'test-key' },
    modelId: 'gpt-4o',
  });
  await svc.init();
  await svc.chat({
    messages: [{
      role: 'user',
      content: [imageFromBase64('AAAA', 'image/png'), { type: 'text', text: 'q' }],
    }],
    maxTokens: 100,
  });
  const userMsg = lastRequest.body.messages.find(m => m.role === 'user');
  assert.equal(userMsg.content[0].image_url.url, 'data:image/png;base64,AAAA');
});

test('OpenAI-compat: string content unchanged (backwards compat)', async () => {
  const svc = new OpenAICompatibleLLMService('llm', null, {
    credentials: { baseUrl: 'https://api.example.com/v1', apiKey: 'test-key' },
    modelId: 'gpt-4o',
  });
  await svc.init();
  await svc.chat({
    messages: [{ role: 'user', content: 'plain text' }],
    maxTokens: 100,
  });
  const userMsg = lastRequest.body.messages.find(m => m.role === 'user');
  assert.equal(userMsg.content, 'plain text');
});

test('OpenAI-compat: content array with only text blocks flattens to string', async () => {
  const svc = new OpenAICompatibleLLMService('llm', null, {
    credentials: { baseUrl: 'https://api.example.com/v1', apiKey: 'test-key' },
    modelId: 'gpt-4o',
  });
  await svc.init();
  await svc.chat({
    messages: [{
      role: 'user',
      content: [{ type: 'text', text: 'foo' }, { type: 'text', text: 'bar' }],
    }],
    maxTokens: 100,
  });
  const userMsg = lastRequest.body.messages.find(m => m.role === 'user');
  assert.equal(userMsg.content, 'foobar');
});

// ---- Ollama provider -----------------------------------------------------

test('Ollama: base64 image goes into images[] array, text stays in content', async () => {
  const svc = new OllamaLLMService('llm', null, {
    credentials: { baseUrl: 'http://localhost:11434' },
    modelId: 'llava',
  });
  await svc.init();
  await svc.chat({
    messages: [{
      role: 'user',
      content: [imageFromBase64('BASE64DATA', 'image/png'), { type: 'text', text: 'describe this' }],
    }],
    maxTokens: 100,
  });
  const userMsg = lastRequest.body.messages.find(m => m.role === 'user');
  assert.equal(userMsg.content, 'describe this');
  assert.deepEqual(userMsg.images, ['BASE64DATA']);
});

test('Ollama: multiple images all end up in images[]', async () => {
  const svc = new OllamaLLMService('llm', null, {
    credentials: { baseUrl: 'http://localhost:11434' },
    modelId: 'llava',
  });
  await svc.init();
  await svc.chat({
    messages: [{
      role: 'user',
      content: [
        imageFromBase64('IMG1', 'image/png'),
        imageFromBase64('IMG2', 'image/jpeg'),
        { type: 'text', text: 'compare these' },
      ],
    }],
    maxTokens: 100,
  });
  const userMsg = lastRequest.body.messages.find(m => m.role === 'user');
  assert.deepEqual(userMsg.images, ['IMG1', 'IMG2']);
  assert.equal(userMsg.content, 'compare these');
});

test('Ollama: URL image throws (base64-only)', async () => {
  const svc = new OllamaLLMService('llm', null, {
    credentials: { baseUrl: 'http://localhost:11434' },
    modelId: 'llava',
  });
  await svc.init();
  await assert.rejects(
    () => svc.chat({
      messages: [{
        role: 'user',
        content: [imageFromUrl('https://example.com/foo.png'), { type: 'text', text: 'x' }],
      }],
      maxTokens: 100,
    }),
    /Ollama images must be base64/,
  );
});
