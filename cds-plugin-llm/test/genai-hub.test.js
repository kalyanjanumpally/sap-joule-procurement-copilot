const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// Stub @sap/cds before any provider is required
const Module = require('module');
const STUB_PATH = '/tmp/__cds_stub_genaihub__';
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

const GenAIHubLLMService = require('../lib/providers/genai-hub');

// ---- fetch mock ----------------------------------------------------------

let fetchCalls;
let fetchResponses;   // per-URL queue of responses
const origFetch = global.fetch;

function mockFetchOk(body, headers = {}) {
  return {
    ok: true,
    status: 200,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

beforeEach(() => {
  fetchCalls = [];
  fetchResponses = new Map(); // url substring -> [responses]
  global.fetch = async (url, init) => {
    fetchCalls.push({ url, init });
    // find the first response whose URL substring matches
    for (const [pattern, queue] of fetchResponses) {
      if (url.includes(pattern)) {
        const next = queue.shift();
        if (!next) throw new Error(`no more mock responses for ${pattern}`);
        return next;
      }
    }
    throw new Error(`unmocked fetch: ${url}`);
  };
});

afterEach(() => {
  global.fetch = origFetch;
  delete process.env.VCAP_SERVICES;
  delete process.env.AICORE_API_URL;
  delete process.env.AICORE_AUTH_URL;
  delete process.env.AICORE_CLIENT_ID;
  delete process.env.AICORE_CLIENT_SECRET;
  delete process.env.AICORE_DEPLOYMENT_ID;
});

// ---- baseline credentials -----------------------------------------------

function credentials() {
  return {
    aiCoreUrl: 'https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com',
    tokenUrl: 'https://myacc.authentication.eu-central-1.hana.ondemand.com',
    clientId: 'sb-clientid',
    clientSecret: 'secret',
    deploymentId: 'depABC123',
    resourceGroup: 'default',
  };
}

// ---- tests ---------------------------------------------------------------

test('init throws when required credentials are missing', async () => {
  const svc = new GenAIHubLLMService('llm', null, { credentials: { aiCoreUrl: 'x' } });
  await assert.rejects(() => svc.init(), /GenAI Hub provider missing config/);
});

test('init succeeds with full credentials + accepts modelId', async () => {
  const svc = new GenAIHubLLMService('llm', null, {
    credentials: credentials(),
    modelId: 'gpt-4o',
  });
  await svc.init();
  assert.equal(svc.deploymentId, 'depABC123');
  assert.equal(svc.resourceGroup, 'default');
  assert.equal(svc.modelId, 'gpt-4o');
  assert.equal(svc.options.baseUrl, 'https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com/v2/inference/deployments/depABC123');
});

test('_endpoint appends /chat/completions to the deployment URL', async () => {
  const svc = new GenAIHubLLMService('llm', null, { credentials: credentials() });
  await svc.init();
  assert.equal(
    svc._endpoint(),
    'https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com/v2/inference/deployments/depABC123/chat/completions',
  );
});

test('OAuth token is fetched with Basic auth and grant_type=client_credentials', async () => {
  const svc = new GenAIHubLLMService('llm', null, { credentials: credentials() });
  await svc.init();
  fetchResponses.set('/oauth/token', [mockFetchOk({ access_token: 'tok_A', expires_in: 3600 })]);
  const token = await svc._getAccessToken();
  assert.equal(token, 'tok_A');
  assert.equal(fetchCalls.length, 1);
  const call = fetchCalls[0];
  assert.equal(call.url, 'https://myacc.authentication.eu-central-1.hana.ondemand.com/oauth/token');
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers['content-type'], 'application/x-www-form-urlencoded');
  assert.equal(call.init.body, 'grant_type=client_credentials');
  const basic = Buffer.from('sb-clientid:secret').toString('base64');
  assert.equal(call.init.headers['authorization'], `Basic ${basic}`);
});

test('OAuth token is cached and reused within expiry window', async () => {
  const svc = new GenAIHubLLMService('llm', null, { credentials: credentials() });
  await svc.init();
  fetchResponses.set('/oauth/token', [
    mockFetchOk({ access_token: 'tok_A', expires_in: 3600 }),
  ]);
  const t1 = await svc._getAccessToken();
  const t2 = await svc._getAccessToken();
  const t3 = await svc._getAccessToken();
  assert.equal(t1, 'tok_A');
  assert.equal(t2, 'tok_A');
  assert.equal(t3, 'tok_A');
  assert.equal(fetchCalls.length, 1); // only one OAuth call despite three requests
});

test('OAuth token refreshes after expiry', async () => {
  const svc = new GenAIHubLLMService('llm', null, { credentials: credentials() });
  await svc.init();
  fetchResponses.set('/oauth/token', [
    mockFetchOk({ access_token: 'tok_A', expires_in: 0 }), // instantly stale
    mockFetchOk({ access_token: 'tok_B', expires_in: 3600 }),
  ]);
  const t1 = await svc._getAccessToken();
  const t2 = await svc._getAccessToken();
  assert.equal(t1, 'tok_A');
  assert.equal(t2, 'tok_B');
  assert.equal(fetchCalls.length, 2);
});

test('_headers() returns Bearer token + AI-Resource-Group', async () => {
  const svc = new GenAIHubLLMService('llm', null, {
    credentials: { ...credentials(), resourceGroup: 'my-rg' },
  });
  await svc.init();
  fetchResponses.set('/oauth/token', [mockFetchOk({ access_token: 'tok_X', expires_in: 3600 })]);
  const headers = await svc._headers();
  assert.equal(headers['content-type'], 'application/json');
  assert.equal(headers['authorization'], 'Bearer tok_X');
  assert.equal(headers['ai-resource-group'], 'my-rg');
});

test('_chat POSTs to the deployment endpoint with OAuth + resource-group headers', async () => {
  const svc = new GenAIHubLLMService('llm', null, {
    credentials: credentials(),
    modelId: 'gpt-4o',
  });
  await svc.init();
  fetchResponses.set('/oauth/token', [mockFetchOk({ access_token: 'tok_1', expires_in: 3600 })]);
  fetchResponses.set('/chat/completions', [mockFetchOk({
    choices: [{ message: { content: 'hello from GenAI Hub' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
    model: 'gpt-4o',
  })]);

  const res = await svc.chat({
    messages: [{ role: 'user', content: 'hi' }],
    maxTokens: 200,
  });

  assert.equal(res.text, 'hello from GenAI Hub');
  assert.equal(res.stopReason, 'stop');
  assert.equal(res.usage.input_tokens, 10);
  assert.equal(res.usage.output_tokens, 5);
  assert.equal(res.model, 'gpt-4o');

  // Two fetch calls: OAuth then chat/completions
  assert.equal(fetchCalls.length, 2);
  const chatCall = fetchCalls[1];
  assert.ok(chatCall.url.endsWith('/v2/inference/deployments/depABC123/chat/completions'));
  assert.equal(chatCall.init.headers['authorization'], 'Bearer tok_1');
  assert.equal(chatCall.init.headers['ai-resource-group'], 'default');
  const body = JSON.parse(chatCall.init.body);
  assert.equal(body.model, 'gpt-4o');
  assert.equal(body.max_tokens, 200);
  assert.deepEqual(body.messages, [{ role: 'user', content: 'hi' }]);
});

test('VCAP_SERVICES auto-discovery populates credentials', async () => {
  process.env.VCAP_SERVICES = JSON.stringify({
    aicore: [{
      credentials: {
        clientid: 'vcap-client',
        clientsecret: 'vcap-secret',
        url: 'https://vcap.authentication.example',
        serviceurls: {
          AI_API_URL: 'https://api.ai.vcap.example',
        },
      },
    }],
  });
  const svc = new GenAIHubLLMService('llm', null, {
    credentials: { deploymentId: 'vcapDep' },
  });
  await svc.init();
  assert.equal(svc.clientId, 'vcap-client');
  assert.equal(svc.clientSecret, 'vcap-secret');
  assert.equal(svc.tokenUrl, 'https://vcap.authentication.example');
  assert.equal(svc.aiCoreUrl, 'https://api.ai.vcap.example');
  assert.equal(svc.deploymentId, 'vcapDep');
});

test('VCAP_SERVICES malformed is ignored gracefully', async () => {
  process.env.VCAP_SERVICES = '{not valid json';
  const svc = new GenAIHubLLMService('llm', null, {
    credentials: credentials(),
    modelId: 'gpt-4o',
  });
  // Should still succeed via explicit credentials
  await svc.init();
  assert.equal(svc.clientId, 'sb-clientid');
});

test('trailing slashes in URLs are normalized', async () => {
  const svc = new GenAIHubLLMService('llm', null, {
    credentials: {
      ...credentials(),
      aiCoreUrl: 'https://api.ai.example.com/',
      tokenUrl: 'https://auth.example.com/',
    },
  });
  await svc.init();
  assert.equal(svc._endpoint(), 'https://api.ai.example.com/v2/inference/deployments/depABC123/chat/completions');
  fetchResponses.set('/oauth/token', [mockFetchOk({ access_token: 't', expires_in: 3600 })]);
  await svc._getAccessToken();
  assert.equal(fetchCalls[0].url, 'https://auth.example.com/oauth/token');
});

test('embed(): requires embeddingDeploymentId', async () => {
  const svc = new GenAIHubLLMService('llm', null, { credentials: credentials() });
  await svc.init();
  await assert.rejects(
    () => svc.embed({ input: 'hi', retries: { max: 0 } }),
    /embeddingDeploymentId/,
  );
});

test('embed(): hits the embedding deployment endpoint with OAuth + resource-group', async () => {
  const svc = new GenAIHubLLMService('llm', null, {
    credentials: { ...credentials(), embeddingDeploymentId: 'embDEP42' },
    modelId: 'text-embedding-3-small',
  });
  await svc.init();
  fetchResponses.set('/oauth/token', [mockFetchOk({ access_token: 'tok', expires_in: 3600 })]);
  fetchResponses.set('/deployments/embDEP42/embeddings', [mockFetchOk({
    data: [{ embedding: [0.1, 0.2, 0.3] }],
    model: 'text-embedding-3-small',
    usage: { prompt_tokens: 3, total_tokens: 3 },
  })]);

  const res = await svc.embed({ input: 'hi' });
  assert.deepEqual(res.embeddings, [[0.1, 0.2, 0.3]]);
  assert.equal(res.model, 'text-embedding-3-small');

  const embedCall = fetchCalls.find(c => c.url.includes('/embDEP42/embeddings'));
  assert.ok(embedCall, 'embedding endpoint was not hit');
  assert.ok(embedCall.url.endsWith('/v2/inference/deployments/embDEP42/embeddings'));
  assert.equal(embedCall.init.headers['authorization'], 'Bearer tok');
  assert.equal(embedCall.init.headers['ai-resource-group'], 'default');
});

test('embed(): uses different deployment than chat', async () => {
  const svc = new GenAIHubLLMService('llm', null, {
    credentials: { ...credentials(), embeddingDeploymentId: 'embDEP99' },
    modelId: 'x',
  });
  await svc.init();
  // Both chat and embed should hit different endpoints
  assert.ok(svc._endpoint().endsWith('/depABC123/chat/completions'));
  assert.equal(svc.embeddingDeploymentId, 'embDEP99');
});

test('OAuth failure surfaces as retryable error when 429', async () => {
  const svc = new GenAIHubLLMService('llm', null, { credentials: credentials() });
  await svc.init();
  fetchResponses.set('/oauth/token', [{
    ok: false,
    status: 429,
    headers: { get: (k) => k.toLowerCase() === 'retry-after' ? '2' : null },
    text: async () => 'rate limited',
  }]);
  await assert.rejects(() => svc._getAccessToken(), /429/);
});
