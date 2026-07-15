# cds-plugin-llm

LLM-agnostic AI service for SAP CAP. One unified interface — swap between Anthropic (Claude), Ollama (local), Groq, any OpenAI-compatible endpoint, or SAP Generative AI Hub without changing your handler code.

**Status:** alpha (v0.3.0). Anthropic + Ollama + Groq + OpenAI-compatible providers work today; GenAI Hub is a stub with wiring instructions.

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
| `llm-genai-hub` | SAP AI Core / GenAI Hub | Paid (extended plan) | Stub — see `lib/providers/genai-hub.js` |

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
