#!/usr/bin/env node
/**
 * End-to-end verification of the GenAI Hub provider against a mock AI Core.
 *
 *   1. Spawn scripts/mock-ai-core.js on port 8080
 *   2. Configure @saptarishi/cds-plugin-llm's GenAIHubLLMService to point at it
 *   3. Fire a chat() call
 *   4. Verify: OAuth token was fetched, chat endpoint was hit with correct
 *      Bearer token + resource-group header, response was parsed correctly
 *   5. Kill mock server, report pass/fail
 *
 * Same test harness anyone with real AI Core credentials can adapt:
 * point at a real AI Core (set AICORE_* env vars) and run just the plugin
 * portion — the mock server is only for local verification.
 *
 * Usage:  node scripts/verify-genai-hub.js
 */

const { spawn } = require('child_process');
const path = require('path');

// Load @saptarishi/cds-plugin-llm from the local package (source, not npm)
// so we're testing what's on disk. Uses the same @sap/cds stub pattern as tests.
const Module = require('module');
const STUB_PATH = '/tmp/__cds_stub_verify__';
require.cache[STUB_PATH] = {
  exports: {
    Service: class { constructor(name, model, options) { this.options = options ?? {}; } async init() {} },
    log: () => ({ info: (...a) => {}, warn: (...a) => {}, error: (...a) => {}, debug: () => {} }),
  },
  loaded: true,
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function(request, ...rest) {
  if (request === '@sap/cds') return STUB_PATH;
  return origResolve.call(this, request, ...rest);
};

const PLUGIN_ROOT = path.resolve(__dirname, '../cds-plugin-llm');
const GenAIHubLLMService = require(path.join(PLUGIN_ROOT, 'lib/providers/genai-hub'));

// ---- ANSI colors ---------------------------------------------------------
const isTTY = process.stdout.isTTY;
const c = isTTY
  ? { grn: '\x1b[32m', red: '\x1b[31m', yel: '\x1b[33m', dim: '\x1b[2m', bld: '\x1b[1m', off: '\x1b[0m' }
  : { grn: '', red: '', yel: '', dim: '', bld: '', off: '' };

const MOCK_PORT = 8080;
const CHECKS = [];
let passed = 0;

function check(label, cond, detail = '') {
  const ok = !!cond;
  if (ok) passed++;
  CHECKS.push({ label, ok, detail });
  const badge = ok ? `${c.grn}ok${c.off}    ` : `${c.red}FAIL${c.off}  `;
  console.log(`  ${badge} ${label}${detail ? `  ${c.dim}${detail}${c.off}` : ''}`);
}

async function waitForPort(port, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${port}/__reset`);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}

async function main() {
  console.log(`\n${c.bld}GenAI Hub provider — mock verification${c.off}`);
  console.log(`${c.dim}Spawning mock AI Core on :${MOCK_PORT}...${c.off}\n`);

  const mock = spawn('node', [path.join(__dirname, 'mock-ai-core.js'), '--port', String(MOCK_PORT)], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  mock.stderr.on('data', d => process.stderr.write(`${c.dim}[mock] ${d}${c.off}`));

  try {
    const up = await waitForPort(MOCK_PORT);
    if (!up) {
      console.error(`${c.red}mock server did not come up within 5s${c.off}`);
      process.exit(1);
    }

    // Configure GenAI Hub provider to point at the mock
    const svc = new GenAIHubLLMService('llm', null, {
      modelId: 'gpt-4o',
      credentials: {
        aiCoreUrl: `http://localhost:${MOCK_PORT}`,
        tokenUrl: `http://localhost:${MOCK_PORT}`,
        clientId: 'mock-client',
        clientSecret: 'mock-secret',
        deploymentId: 'depMOCK001',
        resourceGroup: 'default',
      },
    });
    await svc.init();

    // Fire a chat call
    const t0 = Date.now();
    const res = await svc.chat({
      system: 'You are a test assistant.',
      messages: [{ role: 'user', content: 'Hello mock GenAI Hub!' }],
      maxTokens: 100,
    });
    const ms = Date.now() - t0;

    // Inspect what the mock recorded
    const logRes = await fetch(`http://localhost:${MOCK_PORT}/__log`);
    const log = await logRes.json();

    console.log(`${c.bld}Response received in ${ms}ms${c.off}\n`);

    // ---- assertions ----------------------------------------------------
    check('token endpoint was called', log.some(l => l.path === '/oauth/token'));

    check(
      'chat endpoint was called (with deployment ID in path)',
      log.some(l => l.deploymentId === 'depMOCK001'),
    );

    const chatCall = log.find(l => l.deploymentId === 'depMOCK001');
    check('chat call sent Bearer authorization', chatCall?.headers?.authorization?.startsWith('Bearer '));

    check(
      'chat call sent AI-Resource-Group: default',
      chatCall?.headers?.['ai-resource-group'] === 'default',
    );

    check('response text was parsed', typeof res.text === 'string' && res.text.length > 0,
      res.text ? `"${res.text.slice(0, 60)}..."` : '');

    check('response.model was populated', res.model === 'gpt-4o');

    check('response.usage.input_tokens was populated', typeof res.usage?.input_tokens === 'number',
      `input=${res.usage?.input_tokens} output=${res.usage?.output_tokens}`);

    check('response.stopReason was populated', res.stopReason === 'stop');

    // A second call should reuse the cached token (only one /oauth/token entry total)
    await svc.chat({ messages: [{ role: 'user', content: 'again' }], maxTokens: 50 });
    const log2 = await (await fetch(`http://localhost:${MOCK_PORT}/__log`)).json();
    const tokenCalls = log2.filter(l => l.path === '/oauth/token').length;
    check('OAuth token was cached (1 fetch across 2 chat calls)', tokenCalls === 1,
      `${tokenCalls} token fetch(es) recorded`);

    // ---- summary --------------------------------------------------------
    console.log();
    if (passed === CHECKS.length) {
      console.log(`${c.grn}${c.bld}Summary:${c.off} ${passed}/${CHECKS.length} checks passed — plugin talks to AI Core correctly.`);
    } else {
      console.log(`${c.red}${c.bld}Summary:${c.off} ${passed}/${CHECKS.length} checks passed.`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`${c.red}Unexpected error:${c.off}`, e.stack ?? e.message);
    process.exit(1);
  } finally {
    mock.kill('SIGTERM');
  }
}

main();
