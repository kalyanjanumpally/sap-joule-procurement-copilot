# cds-plugin-llm

[![CI](https://github.com/kalyanjanumpally/sap-joule-procurement-copilot/actions/workflows/ci.yml/badge.svg)](https://github.com/kalyanjanumpally/sap-joule-procurement-copilot/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@saptarishi/cds-plugin-llm.svg)](https://www.npmjs.com/package/@saptarishi/cds-plugin-llm)
[![license](https://img.shields.io/npm/l/@saptarishi/cds-plugin-llm.svg)](./LICENSE)

LLM-agnostic AI service for SAP CAP. One unified interface — swap between Anthropic (Claude), Ollama (local), Groq, any OpenAI-compatible endpoint, or SAP Generative AI Hub without changing your handler code.

**Status:** alpha (v0.4.0). All five providers implemented. GenAI Hub is built to SAP's documented API contract and unit-tested against mocks; needs an AI Core extended plan to live-verify (feedback from anyone with access very welcome).

## Why

`@cap-js/ai` only speaks SAP Generative AI Hub, which requires the paid `extended` plan of SAP AI Core. This plugin lets you:

- **Develop locally** against Ollama (free), free Groq inference, or your own Anthropic key
- **Deploy to BTP** against GenAI Hub via the same handler code
- Keep your CAP service definitions untouched when swapping backends

## Install

```bash
npm install @saptarishi/cds-plugin-llm
```

Optional peer dep for the Anthropic path: `@anthropic-ai/sdk` (installed automatically as a dependency).

## Configure

Add to your CAP app's `package.json` under `cds.requires`:

```json
{
  "cds": {
    "requires": {
      "llm": {
        "[development]": { "kind": "llm-groq",       "modelId": "llama-3.3-70b-versatile" },
        "[ollama]":      { "kind": "llm-ollama",     "modelId": "qwen2.5:14b"             },
        "[production]":  { "kind": "llm-genai-hub", "credentials": { "deploymentId": "..." } }
      }
    }
  }
}
```

Set the appropriate env var (see `.env.example`):
- `ANTHROPIC_API_KEY` for `llm-anthropic`
- `OLLAMA_BASE_URL` for `llm-ollama` (defaults to `http://localhost:11434`)
- `GROQ_API_KEY` for `llm-groq`
- `OPENAI_API_KEY` + `OPENAI_BASE_URL` for `llm-openai-compatible`

## Providers

| Kind | Backend | Cost to test | Status |
|---|---|---|---|
| `llm-anthropic` | Claude via Anthropic API | Pennies per call | Working |
| `llm-ollama` | Local Ollama daemon | Free | Working |
| `llm-groq` | Groq's hosted Llama/Mixtral/Qwen (sub-second inference) | Generous free tier | Working |
| `llm-openai-compatible` | Any endpoint speaking OpenAI's `/chat/completions` (OpenAI, Together, Fireworks, DeepSeek direct, LM Studio, LocalAI...) | Varies | Working |
| `llm-genai-hub` | SAP AI Core / Generative AI Hub | Paid (extended plan) | Working (mock-verified; live-verify pending community access) |

## Use

Because of a CAP v9 quirk with `cds.connect.to()` and this plugin's kind registration, current usage instantiates the provider directly. This is documented as an open issue; will move to `cds.connect.to('llm')` in a future release.

```js
const cds = require('@sap/cds');
const {
  AnthropicLLMService, OllamaLLMService, GroqLLMService,
  OpenAICompatibleLLMService, GenAIHubLLMService,
} = require('@saptarishi/cds-plugin-llm');

const PROVIDERS = {
  'llm-anthropic': AnthropicLLMService,
  'llm-ollama': OllamaLLMService,
  'llm-groq': GroqLLMService,
  'llm-openai-compatible': OpenAICompatibleLLMService,
  'llm-genai-hub': GenAIHubLLMService,
};

async function connectLLM() {
  const cfg = cds.env.requires.llm;
  const svc = new PROVIDERS[cfg.kind]('llm', null, cfg);
  await svc.init();
  return svc;
}

module.exports = class ProcurementService extends cds.ApplicationService {
  async init() {
    const llm = await connectLLM();

    this.on('summarizePO', async (req) => {
      const { poId } = req.data;
      const po = await SELECT.one.from('PurchaseOrders').where({ ID: poId });

      const { text } = await llm.chat({
        system: 'You summarize purchase orders for approvers in 2 sentences.',
        messages: [{ role: 'user', content: JSON.stringify(po) }],
        cache: true,  // Anthropic-only: caches the system prompt
      });

      return text;
    });

    return super.init();
  }
};
```

## Structured outputs (new in v0.3.0)

Pass a JSON schema via `format` and get a parsed `.data` field back:

```js
const { data, usage } = await llm.chat({
  system: 'Assess supplier invoice risk for AP triage.',
  messages: [{ role: 'user', content: invoiceJson }],
  format: {
    type: 'object',
    properties: {
      risk: { type: 'string', enum: ['low', 'medium', 'high'] },
      rationale: { type: 'string' },
    },
    required: ['risk', 'rationale'],
    additionalProperties: false,
  },
});

console.log(data.risk);       // 'high'
console.log(data.rationale);  // 'Amount over 100k EUR without matched PO...'
```

Under the hood:
- **Anthropic**: uses `output_config.format` (native JSON schema)
- **OpenAI-compatible / Groq**: uses `response_format: { type: 'json_object' }` and prepends the schema to the system prompt for broadest model coverage
- **Ollama**: uses native `format` field (schema-strict on recent Ollama versions)
- **Base class** post-parses `.text` into `.data` uniformly; falls back to first-`{...}`-block extraction if the model wrapped the JSON in prose

## Tool use / function calling (new in v0.3.0)

Pass a unified tool schema; get normalized `toolCalls` back:

```js
const turn1 = await llm.chat({
  system: 'Help procurement approvers. Use tools to fetch data.',
  messages: [{ role: 'user', content: 'Fetch PO 4500000123' }],
  tools: [{
    name: 'get_purchase_order',
    description: 'Fetch a purchase order by its 10-digit ID',
    input_schema: {
      type: 'object',
      properties: { purchaseOrderId: { type: 'string' } },
      required: ['purchaseOrderId'],
    },
  }],
});

if (turn1.toolCalls?.length) {
  const call = turn1.toolCalls[0];  // { id, name, input }
  const result = await fetchPO(call.input.purchaseOrderId);  // your app logic

  // Feed the result back for turn 2
  const turn2 = await llm.chat({
    system: '...',
    messages: [
      { role: 'user',      content: 'Fetch PO 4500000123' },
      { role: 'assistant', toolCalls: turn1.toolCalls },
      { role: 'tool',      tool_call_id: call.id, content: JSON.stringify(result) },
    ],
    tools: [...],
  });
  console.log(turn2.text);  // model's final answer
}
```

Works across providers with matching `{ id, name, input }` shape. Individual model quality varies for multi-tool scenarios — llama-3.3-70b on Groq is solid for single-tool cases; Claude and qwen2.5 are more reliable for chained tool use.

## Vision / multimodal input (new in v0.5.0)

Pass images inline as content blocks. Works across all providers with vision-capable models (Claude 3.5+, GPT-4o, Groq's `llama-3.2-*-vision`, Ollama's `llava` / `moondream` / `llama3.2-vision`).

```js
const { imageFromFile, imageFromUrl, imageFromBase64 } = require('@saptarishi/cds-plugin-llm');

// Load from disk
const image = await imageFromFile('/tmp/scanned-invoice.png');

// Or from a URL (Anthropic + OpenAI-compat; Ollama needs base64)
const image = imageFromUrl('https://example.com/invoice.png');

// Or from base64 data you already have
const image = imageFromBase64(base64Data, 'image/png');

const { data } = await llm.chat({
  model: 'gpt-4o',  // or claude-opus-4-7, llama-3.2-11b-vision-preview, llava, ...
  system: 'Extract structured data from scanned invoices.',
  messages: [{
    role: 'user',
    content: [
      image,
      { type: 'text', text: 'Return the vendor, invoice number, and line items.' },
    ],
  }],
  format: {
    type: 'object',
    properties: {
      vendor: { type: 'string' },
      invoiceNumber: { type: 'string' },
      lineItems: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            quantity: { type: 'number' },
            unitPrice: { type: 'number' },
          },
        },
      },
    },
  },
});
```

Wire-shape translation is provider-aware:
- **Anthropic**: native content blocks (source can be `url` or `base64`)
- **OpenAI-compatible / Groq**: `image_url` blocks with data URLs for base64
- **Ollama**: text goes in `content`, images extracted to `images: [base64, ...]` (Ollama does not accept URLs — use `imageFromFile()` or `imageFromBase64()`)

## SAP Generative AI Hub setup

The `llm-genai-hub` kind targets a **deployment** in your BTP AI Core instance. Prerequisites:

1. **Provision AI Core** — BTP Cockpit → Service Marketplace → *AI Core* → **extended** plan (free plan does not include Generative AI Hub).
2. **Create a resource group** (or use `default`).
3. **Deploy a model** via SAP AI Launchpad, `ai-api-cli`, or the SDK — e.g. `gpt-4o`, `mistral-large-instruct`, `claude-3-5-sonnet`. Note the deployment ID.
4. **Configure the plugin** — three ways depending on where your CAP app runs.

### On BTP Cloud Foundry (recommended)

Bind the AI Core service instance to your CAP app:

```sh
cf bind-service <your-app> <ai-core-instance>
cf restage <your-app>
```

Then set only the deployment ID (credentials auto-discovered from `VCAP_SERVICES`):

```sh
cf set-env <your-app> AICORE_DEPLOYMENT_ID <deployment-id>
cf set-env <your-app> AICORE_RESOURCE_GROUP default   # optional; defaults to 'default'
```

In `package.json`:

```json
{
  "cds": { "requires": { "llm": {
    "[production]": { "kind": "llm-genai-hub", "modelId": "gpt-4o" }
  }}}
}
```

### On Kyma

Attach the service binding manifest, then set the same env vars via a ConfigMap or Secret. The `VCAP_SERVICES` layout is preserved by the SBO (Service Binding Operator).

### Local dev pointing at a BTP-hosted AI Core

Extract the service key JSON from BTP Cockpit (Service Instance → Service Keys → View). Put values in `.env`:

```
AICORE_API_URL=https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com
AICORE_AUTH_URL=https://<subaccount>.authentication.<region>.hana.ondemand.com
AICORE_CLIENT_ID=sb-...
AICORE_CLIENT_SECRET=...
AICORE_DEPLOYMENT_ID=abc123
AICORE_MODEL=gpt-4o
```

Or pass explicitly in `package.json`:

```json
{
  "cds": { "requires": { "llm": {
    "[genai-hub]": {
      "kind": "llm-genai-hub",
      "modelId": "gpt-4o",
      "credentials": {
        "aiCoreUrl":     "https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com",
        "tokenUrl":      "https://<subaccount>.authentication.<region>.hana.ondemand.com",
        "clientId":      "sb-...",
        "clientSecret":  "...",
        "deploymentId":  "abc123",
        "resourceGroup": "default"
      }
    }
  }}}
}
```

### What it handles for you

- OAuth2 client-credentials flow against XSUAA
- Token caching + refresh (60s before expiry)
- `AI-Resource-Group` header
- Deployment-based inference endpoint construction
- `VCAP_SERVICES.aicore` auto-discovery when the service is bound

### Known limitations (v0.4.0)

- **OpenAI-shape only.** Deployments that expose the OpenAI `/chat/completions` shape (GPT, Mistral, Llama, Gemini, and Anthropic-via-shim) work. Native Anthropic-shape deployments (Claude via `/invoke`) are not yet supported — use the `llm-anthropic` kind directly for Claude.
- **Not yet live-verified.** Built to the SAP-documented API contract and unit-tested against mocks. Live verification against an AI Core `extended` deployment is the next contribution wanted.

## Automatic retries (new in v0.3.0)

Every `chat()` and `embed()` call is wrapped with exponential-backoff retry on 429 / 5xx responses. Honors `Retry-After` headers. Configurable per-call or globally:

```js
// Per-call override
await llm.chat({ messages: [...], retries: { max: 5, baseMs: 1000, maxMs: 30000 } });

// Or via cds.requires.llm config:
{ "cds": { "requires": { "llm": {
  "kind": "llm-groq",
  "retries": { "max": 5 }
}}}}
```

## Full API

```ts
llm.chat({
  messages: [{ role: 'user' | 'assistant' | 'tool', content: string | ContentBlock[], toolCalls?, tool_call_id? }],
  system?: string,
  model?: string,          // overrides configured default
  maxTokens?: number,      // default 16000 (lower for Groq free tier — TPM: 12k)
  format?: JSONSchema,     // unified structured output; returns parsed data
  tools?: Tool[],          // [{ name, description, input_schema }]
  thinking?: { type: 'adaptive' } | false,  // Anthropic-only; default adaptive
  cache?: boolean,         // Anthropic-only; caches the system prompt
  retries?: { max, baseMs, maxMs },
}) => Promise<{
  text: string,
  data?: unknown,          // populated when format was set
  toolCalls?: [{ id, name, input }],  // populated when model called tools
  raw: unknown,            // provider-native response
  usage: { input_tokens, output_tokens, ... },
  stopReason: string,      // 'end_turn' | 'tool_use' | 'max_tokens' | ...
  model: string,
}>

llm.embed({ input: string | string[], model? })
  => Promise<{ embeddings: number[][], model: string }>
```

## License

Apache-2.0
