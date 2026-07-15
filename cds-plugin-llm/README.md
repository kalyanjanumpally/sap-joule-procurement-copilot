# cds-plugin-llm

LLM-agnostic AI service for SAP CAP. One service kind interface — swap between Anthropic (Claude), Ollama (local), or SAP Generative AI Hub without changing your handler code.

**Status:** early alpha. Anthropic + Ollama providers work today; GenAI Hub is a stub with wiring instructions.

## Why

`@cap-js/ai` only speaks SAP Generative AI Hub, which requires the paid `extended` plan of SAP AI Core. This plugin lets you:

- **Develop locally** against Ollama (free) or your own Anthropic key (cheap)
- **Deploy to BTP** against GenAI Hub via the same handler code
- Keep your CAP service definitions untouched when swapping backends

## Install

```bash
npm install cds-plugin-llm
```

Bring your own SDK for Anthropic (`@anthropic-ai/sdk` is a dependency).

## Configure

Add to `package.json` under `cds.requires`:

```json
{
  "cds": {
    "requires": {
      "llm": {
        "kind": "llm-anthropic",
        "model": "claude-opus-4-7"
      }
    }
  }
}
```

Or per profile:

```json
{
  "cds": {
    "requires": {
      "llm": {
        "[development]": { "kind": "llm-ollama", "model": "llama3.2" },
        "[production]":  { "kind": "llm-genai-hub", "credentials": { "deploymentId": "..." } }
      }
    }
  }
}
```

Set the appropriate env var (see `.env.example`):
- `ANTHROPIC_API_KEY` for `llm-anthropic`
- `OLLAMA_BASE_URL` for `llm-ollama` (defaults to `http://localhost:11434`)

## Use

```js
const cds = require('@sap/cds');

module.exports = class ProcurementService extends cds.ApplicationService {
  async init() {
    const llm = await cds.connect.to('llm');

    this.on('summarizePO', async (req) => {
      const { poId } = req.data;
      const po = await SELECT.one.from('PurchaseOrders').where({ ID: poId });

      const { text } = await llm.chat({
        system: 'You summarize purchase orders for approvers in 2 sentences.',
        messages: [{ role: 'user', content: JSON.stringify(po) }],
        cache: true,
      });

      return text;
    });

    return super.init();
  }
};
```

## API

```ts
llm.chat({
  messages: [{ role: 'user' | 'assistant', content: string | ContentBlock[] }],
  system?: string,
  model?: string,          // overrides configured default
  maxTokens?: number,      // default 16000
  tools?: Tool[],          // provider-native tool schema
  thinking?: { type: 'adaptive' } | false,  // Anthropic-only; default adaptive
  cache?: boolean,         // Anthropic-only; caches the system prompt
}) => Promise<{
  text: string,
  raw: unknown,            // provider-native response
  usage: { input_tokens, output_tokens, ... },
  stopReason: string,
  model: string,
}>

llm.embed({ input: string | string[], model?: string })
  => Promise<{ embeddings: number[][], model: string }>
```

## Providers

| Kind | Backend | Cost to test | Status |
|---|---|---|---|
| `llm-anthropic` | Claude via Anthropic API | Pennies (per-token) | Working |
| `llm-ollama` | Local Ollama daemon | Free | Working |
| `llm-genai-hub` | SAP AI Core / GenAI Hub | Paid (extended plan) | Stub — see `lib/providers/genai-hub.js` |

## License

Apache-2.0
