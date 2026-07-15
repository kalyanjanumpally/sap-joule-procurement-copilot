#!/usr/bin/env node
/**
 * Mock SAP AI Core server for local verification of the GenAI Hub provider.
 * No dependencies (Node built-ins only).
 *
 * Exposes:
 *   POST /oauth/token
 *     Accepts:  Authorization: Basic <b64(client:secret)>
 *               Content-Type: application/x-www-form-urlencoded
 *               body: grant_type=client_credentials
 *     Returns:  { access_token, token_type, expires_in }
 *
 *   POST /v2/inference/deployments/:id/chat/completions
 *     Accepts:  Authorization: Bearer <token>
 *               AI-Resource-Group: <group>
 *               body: OpenAI /chat/completions shape
 *     Returns:  OpenAI-shape response
 *
 * Any deviation from the expected request shape returns a 400 with a diagnostic
 * message, so a mismatch by the plugin surfaces clearly instead of silently
 * passing.
 *
 * Usage:  node scripts/mock-ai-core.js [--port 8080]
 */

const http = require('http');

const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const PORT = portIdx >= 0 ? parseInt(args[portIdx + 1], 10) : 8080;

// Fixed test credentials the driver script uses
const EXPECTED_CLIENT_ID = 'mock-client';
const EXPECTED_CLIENT_SECRET = 'mock-secret';
const EXPECTED_RESOURCE_GROUP = 'default';
const ISSUED_TOKEN = 'mock-access-token-abc123';
const DEPLOYMENT_ID = 'depMOCK001';

// Track requests so the driver can inspect what was called
const requestLog = [];

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(payload);
}

function badRequest(res, message, extra = {}) {
  send(res, 400, { error: 'invalid_request', message, ...extra });
}

async function handleToken(req, res) {
  requestLog.push({ path: req.url, method: req.method, headers: req.headers });

  const auth = req.headers.authorization ?? '';
  if (!auth.startsWith('Basic ')) return badRequest(res, 'Authorization header must be Basic');

  let clientId, clientSecret;
  try {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    if (idx < 0) throw new Error('bad shape');
    clientId = decoded.slice(0, idx);
    clientSecret = decoded.slice(idx + 1);
  } catch {
    return badRequest(res, 'Authorization Basic value not decodable');
  }

  if (clientId !== EXPECTED_CLIENT_ID || clientSecret !== EXPECTED_CLIENT_SECRET) {
    return send(res, 401, { error: 'invalid_client', message: 'client credentials mismatch' });
  }

  const ct = req.headers['content-type'] ?? '';
  if (!ct.includes('application/x-www-form-urlencoded')) {
    return badRequest(res, `Content-Type must be application/x-www-form-urlencoded, got '${ct}'`);
  }

  const body = await readBody(req);
  const params = new URLSearchParams(body);
  if (params.get('grant_type') !== 'client_credentials') {
    return badRequest(res, `grant_type must be 'client_credentials', got '${params.get('grant_type')}'`);
  }

  send(res, 200, {
    access_token: ISSUED_TOKEN,
    token_type: 'Bearer',
    expires_in: 3600,
  });
}

async function handleChat(req, res, deploymentId) {
  requestLog.push({ path: req.url, method: req.method, headers: req.headers, deploymentId });

  const auth = req.headers.authorization ?? '';
  if (!auth.startsWith('Bearer ')) return badRequest(res, 'Authorization header must be Bearer');
  const token = auth.slice(7);
  if (token !== ISSUED_TOKEN) {
    return send(res, 401, { error: 'invalid_token', message: `expected ${ISSUED_TOKEN}, got ${token.slice(0, 20)}...` });
  }

  const rg = req.headers['ai-resource-group'];
  if (!rg) return badRequest(res, 'AI-Resource-Group header missing');
  if (rg !== EXPECTED_RESOURCE_GROUP) {
    return badRequest(res, `AI-Resource-Group mismatch: expected '${EXPECTED_RESOURCE_GROUP}', got '${rg}'`);
  }

  if (deploymentId !== DEPLOYMENT_ID) {
    return send(res, 404, { error: 'deployment_not_found', message: `deployment '${deploymentId}' not found; expected '${DEPLOYMENT_ID}'` });
  }

  const raw = await readBody(req);
  let body;
  try { body = JSON.parse(raw); } catch { return badRequest(res, 'body is not valid JSON'); }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return badRequest(res, 'body.messages must be a non-empty array');
  }
  if (typeof body.max_tokens !== 'number') {
    return badRequest(res, 'body.max_tokens must be a number');
  }

  // Compose a realistic AI-Core-shaped OpenAI response
  const userText = body.messages.filter(m => m.role === 'user').map(m => m.content).join(' ');
  const reply = `Mock GenAI Hub reply (${userText.length} chars in, requested max ${body.max_tokens}).`;

  send(res, 200, {
    id: 'chatcmpl-mock001',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: body.model ?? 'mock-model',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: reply },
      finish_reason: 'stop',
    }],
    usage: {
      prompt_tokens: 42,
      completion_tokens: 15,
      total_tokens: 57,
    },
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = req.url ?? '';

    if (req.method === 'POST' && url === '/oauth/token') {
      return await handleToken(req, res);
    }

    const chatMatch = url.match(/^\/v2\/inference\/deployments\/([^/]+)\/chat\/completions$/);
    if (req.method === 'POST' && chatMatch) {
      return await handleChat(req, res, chatMatch[1]);
    }

    if (req.method === 'GET' && url === '/__log') {
      return send(res, 200, requestLog);
    }

    if (req.method === 'GET' && url === '/__reset') {
      requestLog.length = 0;
      return send(res, 200, { reset: true });
    }

    send(res, 404, { error: 'not_found', method: req.method, url });
  } catch (e) {
    send(res, 500, { error: 'internal', message: e.message });
  }
});

server.listen(PORT, () => {
  console.error(`[mock-ai-core] listening on http://localhost:${PORT}`);
  console.error(`  clientId=${EXPECTED_CLIENT_ID} clientSecret=${EXPECTED_CLIENT_SECRET}`);
  console.error(`  deploymentId=${DEPLOYMENT_ID} resourceGroup=${EXPECTED_RESOURCE_GROUP}`);
});
