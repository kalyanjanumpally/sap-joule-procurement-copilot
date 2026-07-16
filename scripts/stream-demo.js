#!/usr/bin/env node
/**
 * Streaming demo — prints tokens live as they arrive from an LLM provider.
 * Useful in a screen recording to show the "response streams in" moment.
 *
 * Reads GROQ_API_KEY from joule-project-api/.env by default.
 * Override provider/model via env: PROVIDER=ollama MODEL=qwen2.5:14b
 *
 * Usage:  node scripts/stream-demo.js "Your prompt here"
 */

const path = require('path');
const fs = require('fs');

// Stub @sap/cds so we can load the plugin without a full CAP install
const Module = require('module');
const STUB_PATH = '/tmp/__cds_stub_demo__';
require.cache[STUB_PATH] = {
  exports: {
    Service: class { constructor(n, m, o) { this.options = o ?? {}; } async init() {} },
    log: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
  },
  loaded: true,
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function(request, ...rest) {
  if (request === '@sap/cds') return STUB_PATH;
  return origResolve.call(this, request, ...rest);
};

// Load env from joule-project-api/.env if it exists
const envPath = path.resolve(__dirname, '../joule-project-api/.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const PLUGIN_ROOT = path.resolve(__dirname, '../cds-plugin-llm');
const providers = require(path.join(PLUGIN_ROOT, 'lib/index'));

const providerKey = (process.env.PROVIDER ?? 'groq').toLowerCase();
const providerClass = {
  groq: providers.GroqLLMService,
  ollama: providers.OllamaLLMService,
  anthropic: providers.AnthropicLLMService,
}[providerKey];
if (!providerClass) {
  console.error(`unknown PROVIDER=${providerKey}. Use groq|ollama|anthropic.`);
  process.exit(1);
}

const model = process.env.MODEL ?? {
  groq: 'llama-3.3-70b-versatile',
  ollama: 'qwen2.5:14b',
  anthropic: 'claude-opus-4-7',
}[providerKey];

const options = { modelId: model };
if (providerKey === 'ollama' && process.env.OLLAMA_BASE_URL) {
  options.credentials = { baseUrl: process.env.OLLAMA_BASE_URL };
}

const prompt = process.argv.slice(2).join(' ') || 'Write a 4-line haiku about SAP Joule and open source.';

(async () => {
  const svc = new providerClass('llm', null, options);
  await svc.init();

  console.log(`\n\x1b[2m[${providerKey} · ${model}] ${prompt}\x1b[0m\n`);

  const t0 = Date.now();
  let first = null;
  for await (const chunk of svc.stream({
    maxTokens: 400,
    messages: [{ role: 'user', content: prompt }],
  })) {
    if (chunk.type === 'text_delta') {
      if (first === null) first = Date.now() - t0;
      process.stdout.write(chunk.text);
    }
    if (chunk.type === 'done') {
      const total = Date.now() - t0;
      console.log(`\n\n\x1b[2mfirst token: ${first}ms · total: ${total}ms · ${chunk.usage?.output_tokens ?? '?'} output tokens\x1b[0m`);
    }
  }
})().catch(e => { console.error('ERR:', e.stack ?? e.message); process.exit(1); });
